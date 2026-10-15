const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { creerCompte, lireComptes, lireLecteurs } = require('../relais/lib/comptes.js');
const { servirPhotos, SLOTS } = require('../relais/lib/photos.js');

const basic = (nom, mdp) => 'Basic ' + Buffer.from(nom + ':' + mdp).toString('base64');
const MDP_TECH = 'un-mot-de-passe-solide-42';
const MDP_TAB = 'mot-de-passe-de-la-tablette-77';
const COMPTES = lireComptes([creerCompte('julien', MDP_TECH), creerCompte('tablette', MDP_TAB)].join(';'));
const LECTEURS = lireLecteurs('tablette');
const NOW = 1791900000000;
const ORIGINE = 'https://localhost';

// JPEG minimal mais structurellement valide : SOI, JFIF, SOF0 (dimensions), SOS, données sans marqueur, EOI.
function jpeg(w, h, extra) {
  const app = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xFF, 0xC0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xFF, 0xDA, 0x00, 0x0C, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0];
  const corps = new Uint8Array(extra === undefined ? 2000 : extra).fill(0x11);
  return Uint8Array.from([0xFF, 0xD8, ...app, ...sof, ...sos, ...corps, 0xFF, 0xD9]);
}
const OK = jpeg(1600, 1200);
const sha = (octets) => crypto.createHash('sha256').update(octets).digest('hex');

function stockageMemoire() {
  const blobs = new Map();
  return {
    blobs,
    async ecrire(c, o) { if (blobs.has(c)) return 'existe'; blobs.set(c, o); return 'cree'; },
    async ecrireOctets(c, o) { if (blobs.has(c)) return 'existe'; blobs.set(c, o); return 'cree'; },
    async lister(p) { return [...blobs.keys()].filter((c) => c.startsWith(p)).sort(); },
    async lire(c) { return blobs.has(c) && !(blobs.get(c) instanceof Uint8Array) ? blobs.get(c) : null; },
    async lireOctets(c) { return blobs.has(c) && blobs.get(c) instanceof Uint8Array ? blobs.get(c) : null; },
    async supprimer(c) { blobs.delete(c); },
  };
}

const appel = (s, extra) => servirPhotos(Object.assign({
  methode: 'GET', authorization: basic('tablette', MDP_TAB), origine: undefined, requete: {}, corps: '', octets: undefined,
  comptes: COMPTES, lecteurs: LECTEURS, stockage: s, maintenant: () => NOW, quotaPlaque: 200,
}, extra));
const televerser = (s, requete, octets, extra) => appel(s, Object.assign({
  methode: 'PUT', authorization: basic('julien', MDP_TECH), requete: Object.assign({ plaque: 'AB123CD', phase: 'entree', slot: 'av' }, requete), octets: octets === undefined ? OK : octets,
}, extra));

// --- cohérence avec l'application ---

test('les emplacements acceptés par le relais sont ceux de l\'application, dans le même ordre', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'constants.js'), 'utf8');
  const bloc = src.slice(src.indexOf('export var SLOTS'), src.indexOf('.map(function (a)'));
  const cles = [...bloc.matchAll(/\['([a-z]+)', '/g)].map((m) => m[1]);
  assert.deepEqual(SLOTS, cles);
});

// --- envoi ---

test('un compte technicien peut envoyer une photo valide : image et métadonnées sont stockées', async () => {
  const s = stockageMemoire();
  const r = await televerser(s, { label: 'Face avant', prise: String(NOW - 5000) });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, sha256: sha(OK), deja: false });
  assert.ok(s.blobs.get('photos/AB123CD/' + sha(OK) + '.jpg') instanceof Uint8Array);
  const meta = s.blobs.get('photos/AB123CD/' + sha(OK) + '.json');
  assert.deepEqual(meta, {
    version: 1, sha256: sha(OK), plaque: 'AB123CD', phase: 'entree', slot: 'av', label: 'Face avant',
    par: 'julien', recu: NOW, prise: NOW - 5000, taille: OK.length, largeur: 1600, hauteur: 1200,
  });
});

test('renvoyer la même photo est sans effet', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const r = await televerser(s, {});
  assert.equal(r.statut, 200);
  assert.equal(r.json.deja, true);
  assert.equal([...s.blobs.keys()].length, 2);
});

test('un envoi sans authentification valide est refusé sans rien écrire', async () => {
  const s = stockageMemoire();
  for (const authorization of [undefined, basic('julien', 'faux')]) {
    const r = await televerser(s, {}, undefined, { authorization });
    assert.equal(r.statut, 401);
    assert.equal(r.entetes['WWW-Authenticate'], undefined);
  }
  assert.equal(s.blobs.size, 0);
});

test('un fichier qui n\'est pas un JPEG complet et plausible est refusé', async () => {
  const s = stockageMemoire();
  const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, ...new Uint8Array(3000)]);
  const tronque = OK.slice(0, OK.length - 2);
  const minuscule = jpeg(64, 48);
  const enorme = jpeg(9000, 9000);
  for (const [nom, octets] of [['png', png], ['tronqué', tronque], ['vide', new Uint8Array(0)], ['trop petit', minuscule], ['dimensions excessives', enorme]]) {
    const r = await televerser(s, {}, octets);
    assert.equal(r.statut, 415, nom);
  }
  assert.equal(s.blobs.size, 0);
});

test('un fichier trop lourd est refusé', async () => {
  const s = stockageMemoire();
  const r = await televerser(s, {}, jpeg(1600, 1200, 3 * 1024 * 1024));
  assert.equal(r.statut, 413);
  assert.equal(s.blobs.size, 0);
});

test('plaque, phase et emplacement sont contrôlés', async () => {
  const s = stockageMemoire();
  const cas = [
    [{ plaque: '../x' }], [{ plaque: 'A' }], [{ plaque: undefined }],
    [{ phase: 'autre' }], [{ phase: undefined }],
    [{ slot: undefined }], [{ slot: 'inconnu' }],
    [{ phase: 'sortie', slot: 'zzz' }],
  ];
  for (const [req] of cas.map((c) => [c[0]])) {
    const r = await televerser(s, req);
    assert.equal(r.statut, 400, JSON.stringify(req));
  }
  assert.equal(s.blobs.size, 0);
});

test('les photos de mesure et de complément n\'ont pas d\'emplacement et gardent une légende nettoyée', async () => {
  const s = stockageMemoire();
  const r = await televerser(s, { phase: 'compl', slot: 'av', label: '  Impact\u0000 porte\n arrière  ' + 'x'.repeat(100) });
  assert.equal(r.statut, 200);
  const meta = s.blobs.get('photos/AB123CD/' + sha(OK) + '.json');
  assert.equal(meta.slot, null);
  assert.ok(meta.label.length <= 60);
  assert.equal([...meta.label].some((c) => c.charCodeAt(0) < 32), false);
  assert.match(meta.label, /^Impact porte arrière/);
});

test('la date de prise de vue du téléphone n\'est retenue que si elle est plausible', async () => {
  const s = stockageMemoire();
  const cas = [[String(NOW - 60000), NOW - 60000], ['abc', NOW], [String(NOW + 3600000), NOW], [String(NOW - 40 * 86400000), NOW]];
  let i = 0;
  for (const [prise, attendu] of cas) {
    const o = jpeg(1600, 1200, 2000 + ++i);
    await televerser(s, { prise }, o);
    assert.equal(s.blobs.get('photos/AB123CD/' + sha(o) + '.json').prise, attendu, prise);
  }
});

test('le nombre de photos par plaque est limité', async () => {
  const s = stockageMemoire();
  for (let i = 0; i < 3; i++) await televerser(s, {}, jpeg(1600, 1200, 2000 + i), { quotaPlaque: 3 });
  const r = await televerser(s, {}, jpeg(1600, 1200, 2500), { quotaPlaque: 3 });
  assert.equal(r.statut, 429);
});

// --- état d'avancement (tout compte authentifié) ---

test('l\'état d\'une plaque donne les emplacements pris, sans empreinte ni auteur', async () => {
  const s = stockageMemoire();
  await televerser(s, { slot: 'av' }, jpeg(1600, 1200, 2001));
  await televerser(s, { slot: 'ar' }, jpeg(1600, 1200, 2002));
  await televerser(s, { phase: 'sortie', slot: 'av' }, jpeg(1600, 1200, 2003));
  const r = await appel(s, { authorization: basic('julien', MDP_TECH), requete: { plaque: 'AB123CD', vue: 'etat' } });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json.photos.map((p) => [p.phase, p.slot]).sort(), [['entree', 'ar'], ['entree', 'av'], ['sortie', 'av']]);
  const texte = JSON.stringify(r.json);
  assert.equal(/[0-9a-f]{64}/.test(texte), false);
  assert.equal(texte.includes('julien'), false);
});

// --- lecture par la tablette ---

test('la liste complète est réservée aux comptes lecteurs', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const refus = await appel(s, { authorization: basic('julien', MDP_TECH), requete: { plaque: 'AB123CD' } });
  assert.equal(refus.statut, 403);
  const r = await appel(s, { requete: { plaque: 'AB123CD' } });
  assert.equal(r.statut, 200);
  assert.equal(r.json.photos.length, 1);
  const p = r.json.photos[0];
  assert.equal(p.sha256, sha(OK));
  assert.equal(p.par, 'julien');
  assert.equal(p.reclame, null);
  assert.equal(r.entetes['Cache-Control'], 'private, no-store');
});

test('un lecteur récupère les octets d\'une photo, jamais ceux d\'une autre plaque', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const r = await appel(s, { requete: { plaque: 'AB123CD', sha: sha(OK) } });
  assert.equal(r.statut, 200);
  assert.equal(r.entetes['Content-Type'], 'image/jpeg');
  assert.deepEqual(Array.from(r.octets), Array.from(OK));
  assert.equal((await appel(s, { requete: { plaque: 'ZZ999ZZ', sha: sha(OK) } })).statut, 404);
  assert.equal((await appel(s, { requete: { plaque: 'AB123CD', sha: 'x'.repeat(64) } })).statut, 400);
  assert.equal((await appel(s, { requete: { plaque: 'AB123CD', sha: 'a'.repeat(64) } })).statut, 404);
  assert.equal((await appel(s, { authorization: basic('julien', MDP_TECH), requete: { plaque: 'AB123CD', sha: sha(OK) } })).statut, 403);
});

// --- réclamation ---

const reclamer = (s, corps, extra) => appel(s, Object.assign({ methode: 'POST', corps: JSON.stringify(corps) }, extra));

test('une photo se réclame pour un dossier, une seule fois', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const base = { sha256: sha(OK), plaque: 'AB123CD' };
  const a = await reclamer(s, { ...base, dossier: 'D1' });
  assert.deepEqual(a.json, { ok: true, sha256: sha(OK), dossier: 'D1', deja: false });
  assert.equal((await reclamer(s, { ...base, dossier: 'D1' })).json.deja, true);
  const c = await reclamer(s, { ...base, dossier: 'D2' });
  assert.equal(c.statut, 409);
  assert.equal(c.json.dossier, 'D1');
  const liste = await appel(s, { requete: { plaque: 'AB123CD' } });
  assert.equal(liste.json.photos[0].reclame.dossier, 'D1');
});

test('on ne réclame pas une photo inconnue ; une réclamation mal formée est refusée', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const avant = s.blobs.size;
  assert.equal((await reclamer(s, { sha256: 'a'.repeat(64), plaque: 'AB123CD', dossier: 'D1' })).statut, 404);
  assert.equal((await reclamer(s, { sha256: 'zz', plaque: 'AB123CD', dossier: 'D1' })).statut, 400);
  assert.equal((await reclamer(s, { sha256: sha(OK), plaque: 'AB123CD', dossier: '../x' })).statut, 400);
  assert.equal((await appel(s, { methode: 'POST', corps: 'pas du json' })).statut, 400);
  assert.equal(s.blobs.size, avant);
});

test('seul le dossier qui a réclamé une photo peut la libérer', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  await reclamer(s, { sha256: sha(OK), plaque: 'AB123CD', dossier: 'D1' });
  const q = { sha256: sha(OK) };
  assert.equal((await appel(s, { methode: 'DELETE', requete: { ...q, dossier: 'D2' } })).statut, 409);
  assert.equal((await appel(s, { methode: 'DELETE', requete: { ...q, dossier: 'D1' } })).statut, 200);
  assert.equal((await appel(s, { requete: { plaque: 'AB123CD' } })).json.photos[0].reclame, null);
});

// --- CORS ---

test('les réponses portent l\'autorisation CORS de l\'application, la pré-requête est acceptée', async () => {
  const s = stockageMemoire();
  await televerser(s, {});
  const r = await appel(s, { origine: ORIGINE, requete: { plaque: 'AB123CD' } });
  assert.equal(r.entetes['Access-Control-Allow-Origin'], ORIGINE);
  const p = await appel(s, { methode: 'OPTIONS', origine: ORIGINE, authorization: undefined });
  assert.equal(p.statut, 204);
  assert.match(p.entetes['Access-Control-Allow-Methods'], /DELETE/);
});

test('les méthodes inconnues sont refusées', async () => {
  const r = await appel(stockageMemoire(), { methode: 'PATCH' });
  assert.equal(r.statut, 405);
});
