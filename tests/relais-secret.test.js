const test = require('node:test');
const assert = require('node:assert/strict');
const { obtenirSecret, oublierCache, CHEMIN_SECRET } = require('../relais/lib/secret.js');
const { secretValide } = require('../relais/lib/jeton.js');

function stockageMemoire() {
  const m = new Map();
  const journal = { lectures: 0, ecritures: 0 };
  return {
    m, journal,
    async lire(c) { journal.lectures++; return m.get(c) || null; },
    async ecrire(c, o) { journal.ecritures++; if (m.has(c)) return 'existe'; m.set(c, o); return 'cree'; },
  };
}

test.beforeEach(() => oublierCache());

test('un secret configuré explicitement est utilisé tel quel, sans toucher au stockage', async () => {
  const s = stockageMemoire();
  const env = 'secret-explicite-de-plus-de-trente-deux-caracteres';
  assert.equal(await obtenirSecret(s, env), env);
  assert.deepEqual(s.journal, { lectures: 0, ecritures: 0 });
});

test('sans secret configuré, le relais en génère un solide à la première utilisation et le conserve', async () => {
  const s = stockageMemoire();
  const secret = await obtenirSecret(s, undefined);
  assert.equal(secretValide(secret), true);
  assert.ok(secret.length >= 60);
  assert.equal(s.m.get(CHEMIN_SECRET).secret, secret);
});

test('le secret est réutilisé aux appels suivants, sans nouvel accès au stockage', async () => {
  const s = stockageMemoire();
  const a = await obtenirSecret(s, undefined);
  const avant = { ...s.journal };
  assert.equal(await obtenirSecret(s, undefined), a);
  assert.deepEqual(s.journal, avant);
});

test('après un redémarrage, le même secret est relu depuis le stockage', async () => {
  const s = stockageMemoire();
  const a = await obtenirSecret(s, undefined);
  oublierCache();
  assert.equal(await obtenirSecret(s, undefined), a);
  assert.equal(s.journal.ecritures, 1);
});

test('deux instances qui démarrent en même temps obtiennent le même secret', async () => {
  const s = stockageMemoire();
  const [a, b, c] = await Promise.all([obtenirSecret(s, undefined), obtenirSecret(s, undefined), obtenirSecret(s, undefined)]);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.equal(s.m.size, 1);
});

test('une variable trop courte est ignorée au profit du secret généré', async () => {
  const s = stockageMemoire();
  const secret = await obtenirSecret(s, 'court');
  assert.notEqual(secret, 'court');
  assert.equal(secretValide(secret), true);
});

test('un secret stocké illisible ou trop faible n\'est jamais utilisé', async () => {
  const s = stockageMemoire();
  s.m.set(CHEMIN_SECRET, { secret: 'faible' });
  await assert.rejects(obtenirSecret(s, undefined), /secret indisponible/);
});

test('si le stockage est indisponible, aucune valeur de repli n\'est inventée', async () => {
  const casse = { async lire() { throw new Error('panne'); }, async ecrire() { throw new Error('panne'); } };
  await assert.rejects(obtenirSecret(casse, undefined), /panne/);
});
