const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const charger = () => import('../relais/public/js/pur.mjs');

test('les vues du véhicule de la PWA sont celles de l\'application, mêmes clés, libellés et ordre', async () => {
  const { SLOTS } = await charger();
  const src = fs.readFileSync(path.join(__dirname, '..', 'www', 'js', 'constants.js'), 'utf8');
  const bloc = src.slice(src.indexOf('export var SLOTS'), src.indexOf('.map(function (a)'));
  const attendu = [...bloc.matchAll(/\['([a-z]+)', '([^']+)'\]/g)].map((m) => ({ k: m[1], l: m[2] }));
  assert.deepEqual(SLOTS, attendu);
});

test('normPlaque et plaqueValide suivent les règles du relais', async () => {
  const { normPlaque, plaqueValide } = await charger();
  assert.equal(normPlaque(' ab-123-cd '), 'AB123CD');
  assert.equal(plaqueValide('AB123CD'), true);
  assert.equal(plaqueValide('B1234'), true);
  assert.equal(plaqueValide('A'), false);
  assert.equal(plaqueValide('A'.repeat(16)), false);
  assert.equal(plaqueValide(''), false);
});

test('manquants liste les vues pas encore prises pour la phase, dans l\'ordre', async () => {
  const { manquants, SLOTS } = await charger();
  const etat = { photos: [{ phase: 'entree', slot: 'av' }, { phase: 'entree', slot: 'toit' }, { phase: 'sortie', slot: 'ar' }] };
  const e = manquants(etat, 'entree').map((s) => s.k);
  assert.equal(e.length, SLOTS.length - 2);
  assert.equal(e.includes('av'), false);
  assert.equal(e.includes('toit'), false);
  assert.equal(e[0], 'avg');
  assert.equal(manquants(etat, 'sortie').map((s) => s.k).includes('ar'), false);
  assert.equal(manquants({ photos: [] }, 'entree').length, SLOTS.length);
  assert.equal(manquants(null, 'entree').length, SLOTS.length);
});

test('progression compte les vues prises et le minimum exigé à la sortie', async () => {
  const { progression } = await charger();
  const etat = { photos: [{ phase: 'entree', slot: 'av' }, { phase: 'entree', slot: 'av' }, { phase: 'sortie', slot: 'ar' }] };
  assert.deepEqual(progression(etat, 'entree'), { pris: 1, total: 12, requis: 12 });
  assert.deepEqual(progression(etat, 'sortie'), { pris: 1, total: 12, requis: 8 });
});

test('urlEnvoi construit l\'adresse sans paramètre vide', async () => {
  const { urlEnvoi } = await charger();
  assert.equal(urlEnvoi({ plaque: 'AB123CD', phase: 'entree', slot: 'av', label: 'Face avant', prise: 123 }),
    '/api/photos?plaque=AB123CD&phase=entree&slot=av&label=Face+avant&prise=123');
  assert.equal(urlEnvoi({ plaque: 'AB123CD', phase: 'compl', label: '', prise: 5 }), '/api/photos?plaque=AB123CD&phase=compl&prise=5');
});

test('decisionApres dit quoi faire d\'une photo selon la réponse du relais', async () => {
  const { decisionApres } = await charger();
  assert.equal(decisionApres(200), 'ok');
  assert.equal(decisionApres(401), 'connexion');
  for (const s of [400, 413, 415, 429]) assert.equal(decisionApres(s), 'rejeter', String(s));
  for (const s of [0, 500, 502, 503, 504]) assert.equal(decisionApres(s), 'reessayer', String(s));
});

test('le tampon reprend plaque, date, auteur et phase comme dans le Registre', async () => {
  const { tampon } = await charger();
  const ts = new Date('2026-10-13T14:02:00').getTime();
  assert.equal(tampon('AB123CD', ts, 'elwen', 'entree'), 'AB-123-CD  ·  13/10/2026 14:02  ·  elwen  ·  ENTRÉE');
  assert.match(tampon('B1234', ts, 'elwen', 'compl'), /^B1234 {2}·.*COMPLÉMENT$/);
  assert.match(tampon('AB123CD', ts, 'elwen', 'mesures'), /MESURES$/);
});
