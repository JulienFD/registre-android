const test = require('node:test');
const assert = require('node:assert/strict');
const { nomPdf, doitCopier, copieDiffere } = require('../www/utils.js');

const V = { plaque: 'ab-123-cd', createdAt: new Date('2026-10-08T15:30:00').getTime() };
const NOW = new Date('2026-11-02T09:00:00').getTime();

test('nomPdf nomme les PDF d\'entrée et complet avec plaque et date de création', () => {
  assert.equal(nomPdf(V, 'entree', 0, NOW), 'EDL-ENTREE_AB123CD_2026-10-08.pdf');
  assert.equal(nomPdf(V, 'full', 0, NOW), 'DOSSIER-COMPLET_AB123CD_2026-10-08.pdf');
});

test('nomPdf numérote les compléments sur deux chiffres', () => {
  assert.equal(nomPdf(V, 'compl', 2, NOW), 'COMPLEMENT-02_AB123CD_2026-10-08.pdf');
  assert.equal(nomPdf(V, 'compl', 12, NOW), 'COMPLEMENT-12_AB123CD_2026-10-08.pdf');
});

test('nomPdf retombe sur la date du jour sans date de création', () => {
  assert.equal(nomPdf({ plaque: 'AB-123-CD' }, 'full', 0, NOW), 'DOSSIER-COMPLET_AB123CD_2026-11-02.pdf');
});

test('doitCopier : seulement une fiche verrouillée (entrée validée)', () => {
  assert.equal(doitCopier(null), false);
  assert.equal(doitCopier({}), false);
  assert.equal(doitCopier({ statut: 'brouillon' }), false);
  assert.equal(doitCopier({ statut: 'atelier' }), true);
  assert.equal(doitCopier({ statut: 'sorti' }), true);
});

test('copieDiffere regroupe les changements rapprochés en une seule écriture', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const appels = [];
  const c = copieDiffere(async (id) => { appels.push(id) }, 5000);
  c.planifier('a');
  t.mock.timers.tick(3000);
  c.planifier('a');
  t.mock.timers.tick(3000);
  assert.deepEqual(appels, []);
  t.mock.timers.tick(2000);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(appels, ['a']);
});

test('copieDiffere traite chaque fiche en attente, l\'une après l\'autre', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const appels = [];
  const c = copieDiffere(async (id) => { appels.push(id) }, 5000);
  c.planifier('a');
  c.planifier('b');
  c.planifier('a');
  await c.vider();
  assert.deepEqual(appels, ['a', 'b']);
});

test('copieDiffere.vider écrit tout de suite et annule le délai', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const appels = [];
  const c = copieDiffere(async (id) => { appels.push(id) }, 5000);
  c.planifier('a');
  await c.vider();
  assert.deepEqual(appels, ['a']);
  t.mock.timers.tick(10000);
  await c.vider();
  assert.deepEqual(appels, ['a']);
});

test('copieDiffere : l\'échec d\'une fiche n\'empêche pas les suivantes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const appels = [], erreurs = [];
  const c = copieDiffere(async (id) => { if (id === 'a') throw new Error('x'); appels.push(id) }, 5000, (e, id) => erreurs.push(id));
  c.planifier('a');
  c.planifier('b');
  await c.vider();
  assert.deepEqual(appels, ['b']);
  assert.deepEqual(erreurs, ['a']);
});
