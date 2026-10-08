const test = require('node:test');
const assert = require('node:assert/strict');
const { TAMPON, normPlate, fmtPlate, daysTo, due, limite } = require('../www/utils.js');

const NOW = new Date('2026-10-08T15:30:00');

test('normPlate retire séparateurs et passe en majuscules', () => {
  assert.equal(normPlate('ab-123-cd'), 'AB123CD');
  assert.equal(normPlate(null), '');
});

test('fmtPlate formate une plaque SIV et laisse le reste intact', () => {
  assert.equal(fmtPlate('ab123cd'), 'AB-123-CD');
  assert.equal(fmtPlate('1234 XY 78'), '1234 XY 78');
  assert.equal(fmtPlate(''), '—');
});

test('daysTo compte les jours calendaires, quelle que soit l\'heure', () => {
  assert.equal(daysTo('2026-10-08', NOW), 0);
  assert.equal(daysTo('2026-10-09', NOW), 1);
  assert.equal(daysTo('2026-10-05', NOW), -3);
});

test('due décrit l\'échéance de sortie', () => {
  assert.deepEqual(due({}, NOW), { t: 'Sortie à fixer', c: 'warn' });
  assert.deepEqual(due({ sortiePrevue: '2026-10-06' }, NOW), { t: 'En retard de 2 j', c: 'bad' });
  assert.deepEqual(due({ sortiePrevue: '2026-10-08' }, NOW), { t: "Sort aujourd'hui", c: 'warn' });
  assert.deepEqual(due({ sortiePrevue: '2026-10-09' }, NOW), { t: 'Sort demain', c: 'ok' });
  assert.equal(due({ sortiePrevue: '2026-10-20' }, NOW).c, 'ok');
});

test('limite gère absence, voiture tampon, dépassement et proximité', () => {
  assert.equal(limite({}, NOW), null);
  assert.deepEqual(limite({ dateLimite: TAMPON }, NOW), { t: 'Voiture tampon', c: '' });
  assert.equal(limite({ dateLimite: '2026-10-01' }, NOW).c, 'bad');
  assert.equal(limite({ dateLimite: '2026-10-09' }, NOW).c, 'warn');
  assert.equal(limite({ dateLimite: '2026-10-30' }, NOW).c, '');
});
