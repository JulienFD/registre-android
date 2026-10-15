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

// --- dépôt en plusieurs parties (PDF de plus de 4 Mo) ---

const ENVOI = 'b'.repeat(32);
const morceaux = (n, taille) => Array.from({ length: n }, (_, i) => {
  const o = new Uint8Array(taille).fill(65 + i);
  if (i === 0) o.set(Buffer.from('%PDF-1.7\n'));
  return o;
});
const partie = (s, i, sur, octets, extra) => deposer(s, Object.assign({
  requete: { plaque: 'AB123CD', nom: 'Complet.pdf', envoi: ENVOI, partie: String(i), sur: String(sur) }, octets: octets,
}, extra));

test('un PDF envoyé en plusieurs parties est réassemblé dans l\'ordre, puis les parties sont supprimées', async () => {
  const s = stockageMemoire();
  const m = morceaux(3, 3000000);
  const a = await partie(s, 1, 3, m[0]);
  assert.equal(a.statut, 200);
  assert.equal(a.json.id, undefined);
  assert.equal((await partie(s, 2, 3, m[1])).json.id, undefined);
  const fin = await partie(s, 3, 3, m[2]);
  assert.equal(fin.statut, 200);
  const stocke = await s.lireOctets('pdf/' + fin.json.id + '.pdf');
  assert.equal(stocke.length, 9000000);
  assert.deepEqual(Array.from(stocke.slice(0, 12)), Array.from(Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('AAA')])));
  assert.equal(stocke[3000000], 66);
  assert.equal(stocke[8999999], 67);
  assert.equal([...s.blobs.keys()].filter((c) => c.startsWith('pdf-parties/')).length, 0);
});

test('la dernière partie sans les précédentes est refusée', async () => {
  const s = stockageMemoire();
  const m = morceaux(3, 1000);
  await partie(s, 1, 3, m[0]);
  const r = await partie(s, 3, 3, m[2]);
  assert.equal(r.statut, 409);
});

test('les paramètres de parties sont contrôlés', async () => {
  const s = stockageMemoire();
  const m = morceaux(1, 1000)[0];
  const mauvais = (requete) => deposer(s, { requete: Object.assign({ plaque: 'AB123CD', nom: 'x.pdf', envoi: ENVOI, partie: '1', sur: '2' }, requete), octets: m });
  assert.equal((await mauvais({ envoi: '../x' })).statut, 400);
  assert.equal((await mauvais({ partie: '0' })).statut, 400);
  assert.equal((await mauvais({ partie: '3', sur: '2' })).statut, 400);
  assert.equal((await mauvais({ sur: '99' })).statut, 400);
});

test('un PDF réassemblé trop gros ou qui n\'est pas un PDF est refusé', async () => {
  const s = stockageMemoire();
  const pasPdf = [new Uint8Array(2000).fill(1), new Uint8Array(2000).fill(2)];
  await partie(s, 1, 2, pasPdf[0]);
  assert.equal((await partie(s, 2, 2, pasPdf[1])).statut, 415);
  const t = stockageMemoire(), q = { plaque: 'AB123CD', nom: 'x.pdf', envoi: 'c'.repeat(32), sur: '6' };
  let dernier;
  for (let i = 1; i <= 6; i++) dernier = await partie(t, i, 6, morceaux(1, 4000000)[0], { requete: Object.assign({ partie: String(i) }, q) });
  assert.equal(dernier.statut, 413);
});

// --- envoi du mail par le relais ---

function courrier() {
  const envoyes = [];
  return { envoyes, envoyer: async (m) => { envoyes.push(m); } };
}
const envoyerMail = (s, corps, extra, maintenant) => appel(s, Object.assign({
  methode: 'POST', authorization: TAB, corps: JSON.stringify(corps), base: 'https://relais.example.test',
}, extra), maintenant);

test('le relais envoie le mail avec le lien, sans pièce jointe par défaut', async () => {
  const s = stockageMemoire(), c = courrier();
  const { json } = await deposer(s);
  const r = await envoyerMail(s, { id: json.id, mail: 'client@example.test' }, { envoyerMail: c.envoyer });
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, envoye: true, joint: false });
  assert.equal(c.envoyes.length, 1);
  const m = c.envoyes[0];
  assert.equal(m.to, 'client@example.test');
  assert.match(m.subject, /AB-123-CD/);
  assert.ok(m.text.includes('https://relais.example.test/api/pdf?id=' + json.id));
  assert.equal(m.attachments, undefined);
});

test('avec « joindre », le PDF est en pièce jointe en plus du lien', async () => {
  const s = stockageMemoire(), c = courrier();
  const { json } = await deposer(s);
  const r = await envoyerMail(s, { id: json.id, mail: 'client@example.test', joindre: true }, { envoyerMail: c.envoyer });
  assert.deepEqual(r.json, { ok: true, envoye: true, joint: true });
  const pj = c.envoyes[0].attachments[0];
  assert.equal(pj.filename, 'Entree_AB123CD.pdf');
  assert.deepEqual(Array.from(pj.content), Array.from(PDF));
  assert.ok(c.envoyes[0].text.includes('/api/pdf?id=' + json.id));
});

test('sans service de mail configuré, le relais répond 503 sans rien envoyer', async () => {
  const s = stockageMemoire();
  const { json } = await deposer(s);
  const r = await envoyerMail(s, { id: json.id, mail: 'client@example.test' }, {});
  assert.equal(r.statut, 503);
});

test('l\'envoi de mail refuse adresse invalide, lien inconnu ou expiré, et exige la tablette', async () => {
  const s = stockageMemoire(), c = courrier();
  const { json } = await deposer(s);
  const e = (corps, extra, t) => envoyerMail(s, corps, Object.assign({ envoyerMail: c.envoyer }, extra), t);
  assert.equal((await e({ id: json.id, mail: 'pas une adresse' })).statut, 400);
  assert.equal((await e({ id: json.id, mail: 'a@example.test\r\nBcc: x@example.test' })).statut, 400);
  assert.equal((await e({ id: json.id, mail: 'a@b.test, c@d.test' })).statut, 400);
  assert.equal((await e({ id: 'z', mail: 'a@example.test' })).statut, 400);
  assert.equal((await e({ id: 'a'.repeat(64), mail: 'a@example.test' })).statut, 404);
  assert.equal((await e({ id: json.id, mail: 'a@example.test' }, { authorization: undefined })).statut, 401);
  assert.equal((await e({ id: json.id, mail: 'a@example.test' }, { authorization: TECH })).statut, 403);
  assert.equal((await e({ id: json.id, mail: 'a@example.test' }, {}, NOW + DUREE + 1)).statut, 410);
  assert.equal(c.envoyes.length, 0);
});

test('un même lien ne peut pas servir à envoyer plus de 5 mails', async () => {
  const s = stockageMemoire(), c = courrier();
  const { json } = await deposer(s);
  for (let i = 0; i < 5; i++) assert.equal((await envoyerMail(s, { id: json.id, mail: 'a@example.test' }, { envoyerMail: c.envoyer })).statut, 200);
  assert.equal((await envoyerMail(s, { id: json.id, mail: 'a@example.test' }, { envoyerMail: c.envoyer })).statut, 429);
  assert.equal(c.envoyes.length, 5);
});

test('une panne du service de mail donne 502, sans détail technique', async () => {
  const s = stockageMemoire();
  const { json } = await deposer(s);
  const r = await envoyerMail(s, { id: json.id, mail: 'a@example.test' }, { envoyerMail: async () => { throw new Error('auth user=secret pass=hunter2'); } });
  assert.equal(r.statut, 502);
  assert.equal(JSON.stringify(r.json).includes('hunter2'), false);
});

// --- configuration SMTP ---

test('la configuration SMTP vient de variables d\'environnement et exige tous les champs', () => {
  const { lireConfigSmtp } = require('../relais/lib/mail.js');
  const ok = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: 'Atelier <atelier@example.test>' };
  assert.deepEqual(lireConfigSmtp(ok), { host: 'smtp.example.test', port: 465, secure: true, user: 'u', pass: 'p', from: 'Atelier <atelier@example.test>' });
  assert.equal(lireConfigSmtp({ ...ok, SMTP_PORT: undefined }).port, 587);
  assert.equal(lireConfigSmtp({ ...ok, SMTP_PORT: undefined }).secure, false);
  for (const manquant of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) {
    assert.equal(lireConfigSmtp({ ...ok, [manquant]: '' }), null, manquant);
  }
  assert.equal(lireConfigSmtp({ ...ok, SMTP_FROM: 'a@b.test\r\nBcc: x@y.test' }), null);
  assert.equal(lireConfigSmtp({}), null);
  assert.equal(lireConfigSmtp(undefined), null);
});
