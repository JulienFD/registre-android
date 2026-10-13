const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { creerCompte, lireComptes, lireLecteurs, verifierMotDePasse, empreinteCompte } = require('../relais/lib/comptes.js');
const { creerJeton, lireJeton, servirSession } = require('../relais/lib/session.js');
const { servirPhotos } = require('../relais/lib/photos.js');

const MDP = 'un-mot-de-passe-solide-42';
const SECRET = 'secret-de-signature-de-test-0123456789abcdef';
const NOW = 1791900000000;
const ENTREE = creerCompte('julien', MDP);
const COMPTES = lireComptes(ENTREE);
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function stockageMemoire() {
  const m = new Map();
  return {
    m,
    async ecrire(c, o) { if (m.has(c)) return 'existe'; m.set(c, o); return 'cree'; },
    async ecrireOctets(c, o) { m.set(c, o); return 'cree'; },
    async lister(p) { return [...m.keys()].filter((c) => c.startsWith(p)); },
    async lire(c) { return m.has(c) && !(m.get(c) instanceof Uint8Array) ? m.get(c) : null; },
    async lireOctets(c) { return m.get(c) || null; },
    async supprimer(c) { m.delete(c); },
  };
}

const session = (s, extra) => servirSession(Object.assign({
  methode: 'POST', requete: {}, corps: '', comptes: COMPTES, stockage: s, secret: SECRET, maintenant: () => NOW,
}, extra));
const ouvrir = (s, corps, extra) => session(s, Object.assign({ corps: JSON.stringify(corps || { compte: 'julien', mdp: MDP }) }, extra));

// --- comptes ---

test('verifierMotDePasse accepte le bon couple et refuse le reste', () => {
  assert.equal(verifierMotDePasse('julien', MDP, COMPTES), 'julien');
  assert.equal(verifierMotDePasse('julien', 'faux', COMPTES), null);
  assert.equal(verifierMotDePasse('inconnu', MDP, COMPTES), null);
  assert.equal(verifierMotDePasse('julien', 'x'.repeat(500), COMPTES), null);
  assert.equal(verifierMotDePasse(42, MDP, COMPTES), null);
});

test('l\'empreinte d\'un compte change quand son mot de passe change', () => {
  const a = empreinteCompte('julien', COMPTES);
  const b = empreinteCompte('julien', lireComptes(creerCompte('julien', MDP)));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, b);
  assert.equal(empreinteCompte('inconnu', COMPTES), null);
});

// --- jetons d'accès ---

test('un jeton signé est relu tant qu\'il n\'a pas expiré et que le compte est inchangé', () => {
  const j = creerJeton({ compte: 'julien', empreinte: empreinteCompte('julien', COMPTES), secret: SECRET, maintenant: NOW, dureeMs: 60000 });
  assert.equal(lireJeton(j, SECRET, COMPTES, NOW + 30000), 'julien');
  assert.equal(lireJeton(j, SECRET, COMPTES, NOW + 61000), null);
});

test('un jeton falsifié, mal signé ou malformé est refusé', () => {
  const j = creerJeton({ compte: 'julien', empreinte: empreinteCompte('julien', COMPTES), secret: SECRET, maintenant: NOW, dureeMs: 60000 });
  const [v, p, s] = j.split('.');
  const autre = Buffer.from(JSON.stringify({ c: 'julien', e: NOW + 9e9, f: empreinteCompte('julien', COMPTES) })).toString('base64url');
  for (const x of [v + '.' + autre + '.' + s, j + 'x', 'n\'importe quoi', '', v + '.' + p, null, undefined]) {
    assert.equal(lireJeton(x, SECRET, COMPTES, NOW + 1000), null, String(x).slice(0, 30));
  }
  assert.equal(lireJeton(j, 'un-autre-secret-de-signature-0123456789', COMPTES, NOW + 1000), null);
});

test('un jeton ne survit ni à la suppression du compte ni au changement de son mot de passe', () => {
  const j = creerJeton({ compte: 'julien', empreinte: empreinteCompte('julien', COMPTES), secret: SECRET, maintenant: NOW, dureeMs: 60000 });
  assert.equal(lireJeton(j, SECRET, lireComptes(creerCompte('autre', MDP)), NOW + 1000), null);
  assert.equal(lireJeton(j, SECRET, lireComptes(creerCompte('julien', MDP)), NOW + 1000), null);
});

// --- ouverture, rafraîchissement, fermeture ---

test('ouvrir une session donne un jeton d\'accès court et un jeton de rafraîchissement, stocké sous forme d\'empreinte', async () => {
  const s = stockageMemoire();
  const r = await ouvrir(s);
  assert.equal(r.statut, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.compte, 'julien');
  assert.ok(r.json.expireDans > 0 && r.json.expireDans <= 3600);
  assert.match(r.json.refresh, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(lireJeton(r.json.access, SECRET, COMPTES, NOW + 1000), 'julien');
  // Le jeton de rafraîchissement lui-même n'est jamais stocké, seulement son empreinte.
  const cles = [...s.m.keys()];
  assert.deepEqual(cles, ['sessions/' + sha(r.json.refresh) + '.json']);
  assert.equal(JSON.stringify([...s.m.values()]).includes(r.json.refresh), false);
  assert.equal(r.entetes['Cache-Control'], 'private, no-store');
});

test('des identifiants faux n\'ouvrent aucune session et ne laissent aucune trace', async () => {
  const s = stockageMemoire();
  for (const corps of [{ compte: 'julien', mdp: 'faux' }, { compte: 'inconnu', mdp: MDP }, { compte: 'julien' }, {}, 'pas un objet']) {
    const r = await ouvrir(s, corps);
    assert.equal(r.statut, 401, JSON.stringify(corps));
    assert.equal(r.json.refresh, undefined);
  }
  assert.equal((await session(s, { corps: 'pas du json' })).statut, 400);
  assert.equal(s.m.size, 0);
});

test('le jeton de rafraîchissement donne un nouveau jeton d\'accès, indéfiniment', async () => {
  const s = stockageMemoire();
  const { refresh } = (await ouvrir(s)).json;
  for (const delai of [3600000, 86400000 * 30, 86400000 * 400]) {
    const r = await session(s, { requete: { action: 'refresh' }, corps: JSON.stringify({ refresh }), maintenant: () => NOW + delai });
    assert.equal(r.statut, 200, 'après ' + delai);
    assert.equal(lireJeton(r.json.access, SECRET, COMPTES, NOW + delai + 1000), 'julien');
    assert.equal(r.json.refresh, undefined);
  }
});

test('un jeton de rafraîchissement inconnu ou malformé est refusé', async () => {
  const s = stockageMemoire();
  for (const refresh of ['x'.repeat(43), '', 12, null, '../../x']) {
    const r = await session(s, { requete: { action: 'refresh' }, corps: JSON.stringify({ refresh }) });
    assert.equal(r.statut, 401, String(refresh));
  }
});

test('retirer le compte ou changer son mot de passe révoque ses sessions', async () => {
  const s = stockageMemoire();
  const { refresh } = (await ouvrir(s)).json;
  const demande = (comptes) => session(s, { requete: { action: 'refresh' }, corps: JSON.stringify({ refresh }), comptes });
  assert.equal((await demande(lireComptes(creerCompte('julien', 'nouveau-mot-de-passe-solide')))).statut, 401);
  assert.equal(s.m.size, 0); // session supprimée, plus de reprise possible même si l'ancien mot de passe revenait
  assert.equal((await demande(COMPTES)).statut, 401);
});

test('quitter supprime la session : le jeton de rafraîchissement ne sert plus', async () => {
  const s = stockageMemoire();
  const { refresh } = (await ouvrir(s)).json;
  const q = await session(s, { requete: { action: 'quitter' }, corps: JSON.stringify({ refresh }) });
  assert.equal(q.statut, 200);
  assert.equal(s.m.size, 0);
  assert.equal((await session(s, { requete: { action: 'refresh' }, corps: JSON.stringify({ refresh }) })).statut, 401);
  assert.equal((await session(s, { requete: { action: 'quitter' }, corps: JSON.stringify({ refresh }) })).statut, 200); // idempotent
});

test('sans secret de signature configuré, aucune session n\'est émise', async () => {
  const s = stockageMemoire();
  const r = await ouvrir(s, undefined, { secret: undefined });
  assert.equal(r.statut, 503);
  const court = await ouvrir(s, undefined, { secret: 'court' });
  assert.equal(court.statut, 503);
  assert.equal(s.m.size, 0);
});

test('seule la méthode POST est acceptée, le corps est limité', async () => {
  const s = stockageMemoire();
  assert.equal((await session(s, { methode: 'GET' })).statut, 405);
  assert.equal((await session(s, { corps: 'x'.repeat(5000) })).statut, 413);
});

// --- accès aux routes avec le jeton d'accès ---

function jpeg(w, h) {
  const app = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xFF, 0xC0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xFF, 0xDA, 0x00, 0x0C, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0];
  return Uint8Array.from([0xFF, 0xD8, ...app, ...sof, ...sos, ...new Uint8Array(2000).fill(0x11), 0xFF, 0xD9]);
}
const envoi = (s, authorization, extra) => servirPhotos(Object.assign({
  methode: 'PUT', authorization, requete: { plaque: 'AB123CD', phase: 'compl' }, octets: jpeg(1600, 1200), corps: '',
  comptes: COMPTES, lecteurs: lireLecteurs(''), stockage: s, secret: SECRET, maintenant: () => NOW,
}, extra));

test('une route accepte un jeton d\'accès valide à la place du mot de passe', async () => {
  const s = stockageMemoire();
  const { access } = (await ouvrir(s)).json;
  const r = await envoi(s, 'Bearer ' + access);
  assert.equal(r.statut, 200);
  assert.equal([...s.m.values()].find((v) => v && v.par).par, 'julien');
});

test('un jeton expiré, falsifié ou sans secret configuré est refusé', async () => {
  const s = stockageMemoire();
  const { access } = (await ouvrir(s)).json;
  assert.equal((await envoi(s, 'Bearer ' + access, { maintenant: () => NOW + 2 * 3600000 })).statut, 401);
  assert.equal((await envoi(s, 'Bearer ' + access.slice(0, -2) + 'xx')).statut, 401);
  assert.equal((await envoi(s, 'Bearer ' + access, { secret: undefined })).statut, 401);
  assert.equal((await envoi(s, 'Bearer ')).statut, 401);
});

test('le mot de passe en Basic continue de fonctionner (NexPTG, tablette)', async () => {
  const s = stockageMemoire();
  const basic = 'Basic ' + Buffer.from('julien:' + MDP).toString('base64');
  assert.equal((await envoi(s, basic)).statut, 200);
});
