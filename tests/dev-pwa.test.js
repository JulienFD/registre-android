const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerServeur, COMPTE_DEMO, MDP_DEMO } = require('../scripts/dev-pwa.js');

const AUTH = 'Basic ' + Buffer.from(COMPTE_DEMO + ':' + MDP_DEMO).toString('base64');

function jpeg(w, h) {
  const app = [0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof = [0xFF, 0xC0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const sos = [0xFF, 0xDA, 0x00, 0x0C, 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3F, 0];
  return Uint8Array.from([0xFF, 0xD8, ...app, ...sof, ...sos, ...new Uint8Array(2000).fill(0x11), 0xFF, 0xD9]);
}

async function avecServeur(fn) {
  const serveur = creerServeur();
  await new Promise((res) => serveur.listen(0, '127.0.0.1', res));
  const base = 'http://127.0.0.1:' + serveur.address().port;
  try { await fn(base, serveur); } finally { await new Promise((res) => serveur.close(res)); }
}

test('le serveur de développement n\'écoute que sur la boucle locale', async () => {
  await avecServeur(async (base, s) => { assert.equal(s.address().address, '127.0.0.1'); });
});

test('la page d\'accueil de la PWA est servie avec la CSP de production', async () => {
  const csp = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'relais', 'vercel.json'), 'utf8'))
    .headers[0].headers.filter((h) => h.key === 'Content-Security-Policy')[0].value;
  await avecServeur(async (base) => {
    const r = await fetch(base + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('content-security-policy'), csp);
    assert.match(await r.text(), /Photos du dossier/);
  });
});

test('les modules et le manifeste ont le bon type MIME', async () => {
  await avecServeur(async (base) => {
    assert.match((await fetch(base + '/js/app.js')).headers.get('content-type'), /javascript/);
    assert.match((await fetch(base + '/js/pur.mjs')).headers.get('content-type'), /javascript/);
    assert.match((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), /manifest\+json|json/);
    assert.match((await fetch(base + '/icon-192.png')).headers.get('content-type'), /image\/png/);
  });
});

test('le service worker est désactivé en développement, pour ne jamais servir une version périmée', async () => {
  await avecServeur(async (base) => { assert.equal((await fetch(base + '/sw.js')).status, 404); });
});

test('aucun fichier hors de public/ n\'est servi', async () => {
  await avecServeur(async (base) => {
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/js/../../package.json']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 404, p);
    }
  });
});

test('l\'API des photos exige les identifiants de démonstration', async () => {
  await avecServeur(async (base) => {
    const sans = await fetch(base + '/api/photos?plaque=AB123CD&vue=etat');
    assert.equal(sans.status, 401);
    const faux = await fetch(base + '/api/photos?plaque=AB123CD&vue=etat', { headers: { Authorization: 'Basic ' + Buffer.from('demo:mauvais').toString('base64') } });
    assert.equal(faux.status, 401);
    const ok = await fetch(base + '/api/photos?plaque=AB123CD&vue=etat', { headers: { Authorization: AUTH } });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()).photos, []);
  });
});

test('une photo envoyée est validée par le vrai code du relais puis visible dans l\'état de la plaque', async () => {
  await avecServeur(async (base) => {
    const url = base + '/api/photos?plaque=AB123CD&phase=entree&slot=av&label=Face+avant';
    const put = await fetch(url, { method: 'PUT', headers: { Authorization: AUTH, 'Content-Type': 'image/jpeg' }, body: jpeg(1600, 1200) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).deja, false);
    const mauvais = await fetch(url, { method: 'PUT', headers: { Authorization: AUTH }, body: Uint8Array.from([0x89, 0x50, 0x4E, 0x47, ...new Uint8Array(3000)]) });
    assert.equal(mauvais.status, 415);
    const etat = await (await fetch(base + '/api/photos?plaque=AB123CD&vue=etat', { headers: { Authorization: AUTH } })).json();
    assert.deepEqual(etat.photos.map((p) => [p.phase, p.slot, p.label]), [['entree', 'av', 'Face avant']]);
  });
});

test('chaque serveur a son propre stockage en mémoire', async () => {
  await avecServeur(async (base) => {
    await fetch(base + '/api/photos?plaque=AB123CD&phase=compl', { method: 'PUT', headers: { Authorization: AUTH }, body: jpeg(1600, 1200) });
  });
  await avecServeur(async (base) => {
    const etat = await (await fetch(base + '/api/photos?plaque=AB123CD&vue=etat', { headers: { Authorization: AUTH } })).json();
    assert.deepEqual(etat.photos, []);
  });
});
