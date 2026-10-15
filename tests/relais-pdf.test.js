const test = require('node:test');
const assert = require('node:assert/strict');
const { creerCompte, lireComptes, lireLecteurs } = require('../relais/lib/comptes.js');
const { servirPdf, TAILLE_MAX, DUREE } = require('../relais/lib/pdf.js');

const basic = (nom, mdp) => 'Basic ' + Buffer.from(nom + ':' + mdp).toString('base64');
const COMPTES = lireComptes([creerCompte('julien', 'un-mot-de-passe-solide-42'), creerCompte('tablette', 'mot-de-passe-de-la-tablette-77')].join(';'));
const LECTEURS = lireLecteurs('tablette');
const TAB = basic('tablette', 'mot-de-passe-de-la-tablette-77');
const TECH = basic('julien', 'un-mot-de-passe-solide-42');
const NOW = 1791900000000;
const PDF = Uint8Array.from(Buffer.from('%PDF-1.4\n' + 'x'.repeat(2000) + '\n%%EOF\n'));

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
const appel = (s, extra, maintenant) => servirPdf(Object.assign({
  methode: 'GET', authorization: undefined, origine: undefined, requete: {}, octets: undefined,
  comptes: COMPTES, lecteurs: LECTEURS, stockage: s, maintenant: () => maintenant || NOW,
}, extra));
const deposer = (s, extra, maintenant) => appel(s, Object.assign({
  methode: 'PUT', authorization: TAB, requete: { plaque: 'AB123CD', nom: 'Entree_AB123CD.pdf' }, octets: PDF,
}, extra), maintenant);

test('la tablette dépose un PDF et obtient un identifiant secret et une date d\'expiration', async () => {
  const s = stockageMemoire();
  const r = await deposer(s);
  assert.equal(r.statut, 200);
  assert.match(r.json.id, /^[0-9a-f]{64}$/);
  assert.equal(r.json.expire, NOW + DUREE);
  assert.equal((await s.lireOctets('pdf/' + r.json.id + '.pdf')).length, PDF.length);
});

test('déposer demande le compte de la tablette : sans compte 401, technicien 403', async () => {
  const s = stockageMemoire();
  assert.equal((await deposer(s, { authorization: undefined })).statut, 401);
  assert.equal((await deposer(s, { authorization: TECH })).statut, 403);
  assert.equal(s.blobs.size, 0);
});

test('un fichier qui n\'est pas un PDF, trop gros, ou sans plaque est refusé', async () => {
  const s = stockageMemoire();
  assert.equal((await deposer(s, { octets: Uint8Array.from(Buffer.from('<html>pas un pdf</html>')) })).statut, 415);
  assert.equal((await deposer(s, { octets: new Uint8Array(TAILLE_MAX + 1) })).statut, 413);
  assert.equal((await deposer(s, { requete: { plaque: 'ab-12', nom: 'x.pdf' } })).statut, 400);
  assert.equal((await deposer(s, { octets: undefined })).statut, 400);
  assert.equal(s.blobs.size, 0);
});

test('le lien se télécharge sans compte, avec un nom de fichier sûr', async () => {
  const s = stockageMemoire();
  const { json } = await deposer(s, { requete: { plaque: 'AB123CD', nom: '../Entrée "AB 123"\r\n.pdf' } });
  const r = await appel(s, { requete: { id: json.id } });
  assert.equal(r.statut, 200);
  assert.equal(r.entetes['Content-Type'], 'application/pdf');
  assert.match(r.entetes['Content-Disposition'], /^attachment; filename="[A-Za-z0-9_.-]+\.pdf"$/);
  assert.equal(r.entetes['X-Robots-Tag'], 'noindex');
  assert.deepEqual(Array.from(r.octets), Array.from(PDF));
});

test('un identifiant mal formé ou inconnu donne 400 ou 404 sans rien révéler', async () => {
  const s = stockageMemoire();
  assert.equal((await appel(s, { requete: { id: '../secret' } })).statut, 400);
  assert.equal((await appel(s, { requete: { id: 'a'.repeat(64) } })).statut, 404);
  assert.equal((await appel(s, { requete: {} })).statut, 400);
});

test('un lien expiré donne 410 et le fichier est supprimé', async () => {
  const s = stockageMemoire();
  const { json } = await deposer(s);
  const r = await appel(s, { requete: { id: json.id } }, NOW + DUREE + 1);
  assert.equal(r.statut, 410);
  assert.equal(s.blobs.size, 0);
});

test('un dépôt supprime les PDF expirés des autres liens', async () => {
  const s = stockageMemoire();
  const vieux = (await deposer(s)).json.id;
  const neuf = (await deposer(s, {}, NOW + DUREE + 5)).json.id;
  assert.equal(await s.lireOctets('pdf/' + vieux + '.pdf'), null);
  assert.notEqual(await s.lireOctets('pdf/' + neuf + '.pdf'), null);
});

test('deux dépôts du même fichier donnent deux liens différents', async () => {
  const s = stockageMemoire();
  const a = (await deposer(s)).json.id, b = (await deposer(s)).json.id;
  assert.notEqual(a, b);
});

test('la pré-requête CORS autorise PUT pour l\'application', async () => {
  const r = await servirPdf({ methode: 'OPTIONS', origine: 'https://localhost', origines: new Set(['https://localhost']) });
  assert.equal(r.statut, 204);
  assert.match(r.entetes['Access-Control-Allow-Methods'], /PUT/);
});
