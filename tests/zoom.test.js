const test = require('node:test');
const assert = require('node:assert/strict');
const { ECHELLE_MAX, INITIAL, limiter, zoomerVers, basculer } = require('../www/zoom.js');

const CADRE = { w: 1000, h: 600 };

test('limiter ramène l’échelle entre 1 et le maximum', () => {
  assert.equal(limiter({ echelle: 0.4, x: 0, y: 0 }, CADRE).echelle, 1);
  assert.equal(limiter({ echelle: 99, x: 0, y: 0 }, CADRE).echelle, ECHELLE_MAX);
});

test('limiter garde l’image couvrant le cadre et recentre à l’échelle 1', () => {
  assert.deepEqual(limiter({ echelle: 1, x: 80, y: -40 }, CADRE), INITIAL);
  const l = limiter({ echelle: 2, x: 9999, y: -9999 }, CADRE);
  assert.equal(l.x, 500);
  assert.equal(l.y, -300);
});

test('zoomerVers garde fixe le point sous les doigts', () => {
  const e = zoomerVers(INITIAL, 2, 200, -100, CADRE);
  assert.equal(e.echelle, 2);
  // le point (200, -100) reste à la même place à l’écran : x = 200 - (200 - 0) * 2
  assert.equal(e.x, -200);
  assert.equal(e.y, 100);
});

test('zoomerVers cumule les facteurs sans dépasser le maximum', () => {
  let e = INITIAL;
  for (let i = 0; i < 10; i++) e = zoomerVers(e, 2, 0, 0, CADRE);
  assert.equal(e.echelle, ECHELLE_MAX);
});

test('basculer agrandit depuis l’échelle 1 puis revient à l’état initial', () => {
  const zoome = basculer(INITIAL, 100, 50, CADRE);
  assert.ok(zoome.echelle > 1);
  assert.deepEqual(basculer(zoome, 0, 0, CADRE), INITIAL);
});
