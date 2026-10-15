const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { creerCompte, lireComptes, lireLecteurs } = require('../relais/lib/comptes.js');
const { servirSortie, purger, DELAI } = require('../relais/lib/sortie.js');

const basic = (nom, mdp) => 'Basic ' + Buffer.from(nom + ':' + mdp).toString('base64');
const MDP_TECH = 'un-mot-de-passe-solide-42';
const MDP_TAB = 'mot-de-passe-de-la-tablette-77';
const COMPTES = lireComptes([creerCompte('julien', MDP_TECH), creerCompte('tablette', MDP_TAB)].join(';'));
const LECTEURS = lireLecteurs('tablette');
const NOW = 1791900000000;
const JOUR = 86400000;
const SHA_PHOTO = 'a'.repeat(64);
const SHA_AUTRE = 'b'.repeat(64);
const CLE = '28409 Professional#2#1791896184';
const empreinte = (t) => crypto.createHash('sha256').update(t).digest('hex');

function stockageMemoire() {
  const blobs = new Map();
  return {
    blobs,
    async ecrire(c, o) { if (blobs.has(c)) return 'existe'; blobs.set(c, o); return 'cree'; },
    async lister(p) { return [...blobs.keys()].filter((c) => c.startsWith(p)).sort(); },
    async lire(c) { return blobs.has(c) && !(blobs.get(c) instanceof Uint8Array) ? blobs.get(c) : null; },
    async supprimer(c) { blobs.delete(c); },
  };
}

// Un véhicule complet sur le relais : photo + fiche, rapport, et leurs réclamations.
function semer(s, plaque, sha, cle) {
  s.blobs.set('photos/' + plaque + '/' + sha + '.jpg', new Uint8Array([1, 2, 3]));
  s.blobs.set('photos/' + plaque + '/' + sha + '.json', { sha256: sha, plaque });
  s.blobs.set('reclamations-photos/' + sha + '.json', { sha256: sha, dossier: 'D1' });
  s.blobs.set('rapports/' + plaque + '/' + sha + '.json', { cle, plaque, sha256: sha });
  s.blobs.set('reclamations/' + empreinte(cle) + '.json', { cle, dossier: 'D1' });
}

const appel = (s, extra) => servirSortie(Object.assign({
  methode: 'POST', authorization: basic('tablette', MDP_TAB), requete: {}, corps: JSON.stringify({ plaque: 'AB123CD' }),
  comptes: COMPTES, lecteurs: LECTEURS, stockage: s, maintenant: () => NOW,
}, extra));

test('la tablette signale une sortie : un marqueur daté est écrit', async () => {
  const s = stockageMemoire();
  const r = await appel(s);
  assert.equal(r.statut, 200);
  assert.deepEqual(s.blobs.get('sorties/AB123CD.json'), { version: 1, plaque: 'AB123CD', sortie: NOW });
});

test('un compte non lecteur, ou sans identifiants, ne peut pas signaler une sortie', async () => {
  const s = stockageMemoire();
  assert.equal((await appel(s, { authorization: basic('julien', MDP_TECH) })).statut, 403);
  assert.equal((await appel(s, { authorization: undefined })).statut, 401);
  assert.equal(s.blobs.size, 0);
});

test('une plaque invalide, un corps illisible ou une autre méthode sont refusés', async () => {
  const s = stockageMemoire();
  assert.equal((await appel(s, { corps: JSON.stringify({ plaque: '../x' }) })).statut, 400);
  assert.equal((await appel(s, { corps: 'pas du json' })).statut, 400);
  assert.equal((await appel(s, { methode: 'GET' })).statut, 405);
  assert.equal(s.blobs.size, 0);
});

test('une nouvelle sortie de la même plaque repart de la date du jour', async () => {
  const s = stockageMemoire();
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - 6 * JOUR });
  await appel(s);
  assert.equal(s.blobs.get('sorties/AB123CD.json').sortie, NOW);
});

test('purger supprime photos, rapports et réclamations au bout de 7 jours après la sortie', async () => {
  const s = stockageMemoire();
  semer(s, 'AB123CD', SHA_PHOTO, CLE);
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - DELAI - 1 });
  await purger({ stockage: s, maintenant: () => NOW });
  assert.deepEqual([...s.blobs.keys()], []);
});

test('purger ne touche à rien avant 7 jours, ni aux véhicules sans sortie', async () => {
  const s = stockageMemoire();
  semer(s, 'AB123CD', SHA_PHOTO, CLE);
  semer(s, 'ZZ999ZZ', SHA_AUTRE, 'autre#1#1');
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - DELAI + 1000 });
  const avant = [...s.blobs.keys()].sort();
  await purger({ stockage: s, maintenant: () => NOW });
  assert.deepEqual([...s.blobs.keys()].sort(), avant);
});

test('purger ne supprime que la plaque échue et laisse les autres véhicules', async () => {
  const s = stockageMemoire();
  semer(s, 'AB123CD', SHA_PHOTO, CLE);
  semer(s, 'ZZ999ZZ', SHA_AUTRE, 'autre#1#1');
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - 8 * JOUR });
  await purger({ stockage: s, maintenant: () => NOW });
  assert.ok([...s.blobs.keys()].every((c) => !c.includes('AB123CD') && !c.includes(SHA_PHOTO)));
  assert.ok(s.blobs.has('photos/ZZ999ZZ/' + SHA_AUTRE + '.json'));
  assert.ok(s.blobs.has('rapports/ZZ999ZZ/' + SHA_AUTRE + '.json'));
  assert.ok(s.blobs.has('reclamations/' + empreinte('autre#1#1') + '.json'));
});

test('signaler une sortie purge au passage les véhicules échus', async () => {
  const s = stockageMemoire();
  semer(s, 'ZZ999ZZ', SHA_AUTRE, 'autre#1#1');
  s.blobs.set('sorties/ZZ999ZZ.json', { version: 1, plaque: 'ZZ999ZZ', sortie: NOW - 9 * JOUR });
  await appel(s);
  assert.deepEqual([...s.blobs.keys()], ['sorties/AB123CD.json']);
});

test('annuler la sortie supprime le marqueur : rien n\'est plus purgé', async () => {
  const s = stockageMemoire();
  semer(s, 'AB123CD', SHA_PHOTO, CLE);
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - 8 * JOUR });
  const r = await appel(s, { methode: 'DELETE', requete: { plaque: 'AB123CD' }, corps: '' });
  assert.equal(r.statut, 200);
  assert.equal(s.blobs.has('sorties/AB123CD.json'), false);
  assert.ok(s.blobs.has('photos/AB123CD/' + SHA_PHOTO + '.json'));
  assert.ok(s.blobs.has('rapports/AB123CD/' + SHA_PHOTO + '.json'));
});

test('annuler une sortie qui n\'existe pas répond 200, sans rien changer', async () => {
  const s = stockageMemoire();
  semer(s, 'AB123CD', SHA_PHOTO, CLE);
  const avant = s.blobs.size;
  const r = await appel(s, { methode: 'DELETE', requete: { plaque: 'AB123CD' }, corps: '' });
  assert.equal(r.statut, 200);
  assert.equal(s.blobs.size, avant);
});

test('annuler la sortie est réservé aux lecteurs et exige une plaque valide', async () => {
  const s = stockageMemoire();
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW });
  const tech = await appel(s, { methode: 'DELETE', authorization: basic('julien', MDP_TECH), requete: { plaque: 'AB123CD' } });
  assert.equal(tech.statut, 403);
  const mauvaise = await appel(s, { methode: 'DELETE', requete: { plaque: '../x' } });
  assert.equal(mauvaise.statut, 400);
  assert.ok(s.blobs.has('sorties/AB123CD.json'));
});

test('remettre en sortie après une annulation repart de 7 jours', async () => {
  const s = stockageMemoire();
  s.blobs.set('sorties/AB123CD.json', { version: 1, plaque: 'AB123CD', sortie: NOW - 6 * JOUR });
  await appel(s, { methode: 'DELETE', requete: { plaque: 'AB123CD' }, corps: '' });
  await appel(s, { maintenant: () => NOW + 3 * JOUR });
  assert.equal(s.blobs.get('sorties/AB123CD.json').sortie, NOW + 3 * JOUR);
});
