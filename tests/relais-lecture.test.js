const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { creerCompte, lireComptes, lireLecteurs } = require('../relais/lib/comptes.js');
const { recevoirNexptg } = require('../relais/lib/recevoir.js');
const { servirRapports, servirTechniciens } = require('../relais/lib/lecture.js');

const fixture = (nom) => fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8');
const basic = (nom, mdp) => 'Basic ' + Buffer.from(nom + ':' + mdp).toString('base64');

const MDP_TECH = 'un-mot-de-passe-solide-42';
const MDP_TAB = 'mot-de-passe-de-la-tablette-77';
const COMPTES = lireComptes([creerCompte('julien', MDP_TECH), creerCompte('lea', MDP_TECH), creerCompte('tablette', MDP_TAB)].join(';'));
const LECTEURS = lireLecteurs('tablette');
const NOW = 1791900000000;
const CLE_ZZ = '28409 Professional#2#1791896184';
const CLE_AB = '28409 Professional#1#1791887764';
const empreinte = (t) => crypto.createHash('sha256').update(t).digest('hex');

function stockageMemoire() {
  const blobs = new Map();
  return {
    blobs,
    async ecrire(chemin, objet) {
      if (blobs.has(chemin)) return 'existe';
      blobs.set(chemin, objet);
      return 'cree';
    },
    async lister(prefixe) { return [...blobs.keys()].filter((c) => c.startsWith(prefixe)).sort(); },
    async lire(chemin) { return blobs.has(chemin) ? blobs.get(chemin) : null; },
    async supprimer(chemin) { blobs.delete(chemin); },
  };
}

async function semer(stockage, nomFixture, recu, compte) {
  const r = await recevoirNexptg({
    methode: 'POST', authorization: basic(compte || 'julien', MDP_TECH), corps: fixture(nomFixture),
    comptes: COMPTES, stockage, maintenant: () => recu,
  });
  assert.equal(r.statut, 200);
}

const appel = (stockage, extra) => servirRapports(Object.assign({
  methode: 'GET', authorization: basic('tablette', MDP_TAB), requete: {}, corps: '',
  comptes: COMPTES, lecteurs: LECTEURS, stockage, maintenant: () => NOW,
}, extra));

// --- accès ---

test('les comptes lecteurs sont lus depuis la configuration, noms invalides ignorés', () => {
  assert.deepEqual([...lireLecteurs('tablette, lea ;;Pas Valide')].sort(), ['lea', 'tablette']);
  assert.equal(lireLecteurs(undefined).size, 0);
});

test('sans authentification valide, la lecture est refusée', async () => {
  const s = stockageMemoire();
  for (const authorization of [undefined, basic('tablette', 'faux')]) {
    const r = await appel(s, { authorization, requete: { plaque: 'ZZ999ZZ' } });
    assert.equal(r.statut, 401);
    assert.match(r.entetes['WWW-Authenticate'], /^Basic /);
  }
});

test('un compte authentifié mais non lecteur n\'a aucun accès en lecture', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-mesures-ignorees.json', 1000);
  const r = await appel(s, { authorization: basic('julien', MDP_TECH), requete: { plaque: 'ZZ999ZZ' } });
  assert.equal(r.statut, 403);
  assert.equal(JSON.stringify(r.json).includes('Test relais'), false);
});

test('la lecture n\'est jamais mise en cache', async () => {
  const r = await appel(stockageMemoire(), { requete: { plaque: 'ZZ999ZZ' } });
  assert.equal(r.entetes['Cache-Control'], 'private, no-store');
});

test('seules les méthodes GET, POST et DELETE sont acceptées', async () => {
  const r = await appel(stockageMemoire(), { methode: 'PUT' });
  assert.equal(r.statut, 405);
  assert.equal(r.entetes.Allow, 'GET, POST, DELETE');
});

// --- liste ---

test('la plaque demandée est obligatoire et contrôlée', async () => {
  const s = stockageMemoire();
  for (const plaque of [undefined, '', '../x', 'a b', 'A'.repeat(30)]) {
    const r = await appel(s, { requete: { plaque } });
    assert.equal(r.statut, 400, String(plaque));
  }
});

test('une plaque sans rapport donne une liste vide', async () => {
  const r = await appel(stockageMemoire(), { requete: { plaque: 'ZZ999ZZ' } });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, plaque: 'ZZ999ZZ', rapports: [] });
});

test('la liste donne le rapport complet avec son identité et ses métadonnées', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-mesures-ignorees.json', 1000);
  const r = await appel(s, { requete: { plaque: 'ZZ999ZZ' } });
  assert.equal(r.json.rapports.length, 1);
  const rap = r.json.rapports[0];
  assert.equal(rap.cle, CLE_ZZ);
  assert.equal(rap.plaque, 'ZZ999ZZ');
  assert.equal(rap.par, 'julien');
  assert.equal(rap.recu, 1000);
  assert.equal(rap.reclame, null);
  assert.equal(rap.versions.length, 1);
  assert.equal(rap.brut.name, 'Test relais');
  assert.equal(rap.brut.comment, '');
});

test('plusieurs versions d\'un rapport : la plus récemment reçue est renvoyée, les autres listées', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-mesures-ignorees-v2.json', 5000);
  await semer(s, 'nexptg-rapport-mesures-ignorees.json', 1000);
  const rap = (await appel(s, { requete: { plaque: 'ZZ999ZZ' } })).json.rapports[0];
  assert.equal(rap.brut.comment, 'Blabla');
  assert.equal(rap.recu, 5000);
  assert.deepEqual(rap.versions.map((v) => v.recu), [5000, 1000]);
  assert.equal(rap.versions[0].sha256, rap.sha256);
});

test('deux rapports distincts d\'une même plaque restent distincts', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-mesures-ignorees.json', 1000);
  const autre = JSON.parse(fixture('nexptg-rapport-mesures-ignorees.json'));
  autre.data.reports[0].date = 1791999999;
  const r = await recevoirNexptg({
    methode: 'POST', authorization: basic('julien', MDP_TECH), corps: JSON.stringify(autre),
    comptes: COMPTES, stockage: s, maintenant: () => 2000,
  });
  assert.equal(r.statut, 200);
  const liste = (await appel(s, { requete: { plaque: 'ZZ999ZZ' } })).json.rapports;
  assert.equal(liste.length, 2);
  assert.notEqual(liste[0].cle, liste[1].cle);
});

test('on peut ne demander que les rapports d\'un compte', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-mesures-ignorees.json', 1000, 'julien');
  const autre = JSON.parse(fixture('nexptg-rapport-mesures-ignorees.json'));
  autre.data.reports[0].date = 1791999999;
  await recevoirNexptg({
    methode: 'POST', authorization: basic('lea', MDP_TECH), corps: JSON.stringify(autre),
    comptes: COMPTES, stockage: s, maintenant: () => 2000,
  });
  const deLea = (await appel(s, { requete: { plaque: 'ZZ999ZZ', par: 'lea' } })).json.rapports;
  assert.equal(deLea.length, 1);
  assert.equal(deLea[0].par, 'lea');
  assert.equal((await appel(s, { requete: { plaque: 'ZZ999ZZ' } })).json.rapports.length, 2);
});

test('les rapports sans plaque se consultent à part, pour un rattachement manuel', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport.json', 1000);
  const r = await appel(s, { requete: { plaque: '_sans-plaque' } });
  assert.equal(r.statut, 200);
  assert.equal(r.json.rapports.length, 1);
  assert.ok(r.json.rapports[0].avertissements.includes('plaque absente'));
});

// --- réclamation ---

const reclamer = (s, corps, extra) => appel(s, Object.assign({ methode: 'POST', corps: JSON.stringify(corps) }, extra));

test('un rapport réclamé est marqué pour le dossier, sans être supprimé', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  const r = await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: '2026-10-13-AB123CD' });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, cle: CLE_AB, dossier: '2026-10-13-AB123CD', deja: false });
  assert.ok(s.blobs.has('reclamations/' + empreinte(CLE_AB) + '.json'));
  const rap = (await appel(s, { requete: { plaque: 'AB123CD' } })).json.rapports[0];
  assert.equal(rap.reclame.dossier, '2026-10-13-AB123CD');
  assert.equal(rap.reclame.par, 'tablette');
  assert.equal(rap.reclame.recu, NOW);
});

test('réclamer deux fois pour le même dossier est sans effet', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  const corps = { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D1' };
  await reclamer(s, corps);
  const r = await reclamer(s, corps);
  assert.equal(r.statut, 200);
  assert.equal(r.json.deja, true);
});

test('un rapport déjà réclamé par un autre dossier est refusé', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D1' });
  const r = await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D2' });
  assert.equal(r.statut, 409);
  assert.equal(r.json.dossier, 'D1');
});

test('on ne réclame pas un rapport qui n\'existe pas, et rien n\'est écrit', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  const avant = s.blobs.size;
  const r = await reclamer(s, { cle: 'inconnu#9#1', plaque: 'AB123CD', dossier: 'D1' });
  assert.equal(r.statut, 404);
  assert.equal(s.blobs.size, avant);
});

test('une réclamation mal formée est refusée', async () => {
  const s = stockageMemoire();
  const cas = [
    'pas du json',
    JSON.stringify({}),
    JSON.stringify({ cle: CLE_AB, plaque: 'AB123CD' }),
    JSON.stringify({ cle: CLE_AB, plaque: 'AB123CD', dossier: '../../x' }),
    JSON.stringify({ cle: CLE_AB, plaque: '../x', dossier: 'D1' }),
    JSON.stringify({ cle: 42, plaque: 'AB123CD', dossier: 'D1' }),
  ];
  for (const corps of cas) {
    const r = await appel(s, { methode: 'POST', corps });
    assert.equal(r.statut, 400, corps);
  }
  assert.equal((await appel(s, { methode: 'POST', corps: 'x'.repeat(10000) })).statut, 413);
});

// --- libération ---

test('le dossier qui a réclamé un rapport peut le libérer', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D1' });
  const r = await appel(s, { methode: 'DELETE', requete: { cle: CLE_AB, dossier: 'D1' } });
  assert.equal(r.statut, 200);
  assert.equal(s.blobs.has('reclamations/' + empreinte(CLE_AB) + '.json'), false);
  assert.equal((await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D2' })).statut, 200);
});

test('un autre dossier ne peut pas libérer la réclamation', async () => {
  const s = stockageMemoire();
  await semer(s, 'nexptg-rapport-champ.json', 1000);
  await reclamer(s, { cle: CLE_AB, plaque: 'AB123CD', dossier: 'D1' });
  const r = await appel(s, { methode: 'DELETE', requete: { cle: CLE_AB, dossier: 'D2' } });
  assert.equal(r.statut, 409);
  assert.ok(s.blobs.has('reclamations/' + empreinte(CLE_AB) + '.json'));
});

test('libérer un rapport non réclamé est sans effet', async () => {
  const r = await appel(stockageMemoire(), { methode: 'DELETE', requete: { cle: CLE_AB, dossier: 'D1' } });
  assert.equal(r.statut, 200);
});

test('si le stockage échoue, la réponse est une erreur sans détail interne', async () => {
  const s = stockageMemoire();
  s.lister = async () => { throw new Error('secret interne du fournisseur'); };
  const erreur = console.error;
  console.error = () => {};
  let r;
  try { r = await appel(s, { requete: { plaque: 'ZZ999ZZ' } }); } finally { console.error = erreur; }
  assert.equal(r.statut, 500);
  assert.deepEqual(r.json, { ok: false, erreur: 'stockage indisponible' });
});

// --- techniciens : la liste des comptes d'envoi, tirée de la configuration du relais ---

const techniciens = (extra) => servirTechniciens(Object.assign({
  methode: 'GET', authorization: basic('tablette', MDP_TAB), comptes: COMPTES, lecteurs: LECTEURS,
}, extra));

test('la liste des techniciens contient les comptes d\'envoi, sans les comptes lecteurs', async () => {
  const r = await techniciens();
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, techniciens: ['julien', 'lea'] });
});

test('la liste des techniciens ne révèle ni sel ni empreinte', async () => {
  const texte = JSON.stringify((await techniciens()).json);
  assert.equal(/[0-9a-f]{32}/.test(texte), false);
});

test('la liste des techniciens est réservée aux comptes lecteurs', async () => {
  assert.equal((await techniciens({ authorization: undefined })).statut, 401);
  assert.equal((await techniciens({ authorization: basic('tablette', 'faux') })).statut, 401);
  const r = await techniciens({ authorization: basic('julien', MDP_TECH) });
  assert.equal(r.statut, 403);
  assert.equal(JSON.stringify(r.json).includes('lea'), false);
});

test('la liste des techniciens n\'accepte que GET et n\'est jamais mise en cache', async () => {
  const r = await techniciens({ methode: 'POST' });
  assert.equal(r.statut, 405);
  assert.equal(r.entetes.Allow, 'GET');
  assert.equal((await techniciens()).entetes['Cache-Control'], 'private, no-store');
});
