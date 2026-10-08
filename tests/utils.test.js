const test = require('node:test');
const assert = require('node:assert/strict');
const { TAMPON, normPlate, fmtPlate, daysTo, due, limite, missingForCreate, missingForEntry, sortieDefaut, formatPlate, plateValid, plateKind, sanitize, RULES, invalidForEntry, entryErrors } = require('../www/utils.js');

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

const COMPLET = {
  plaque: 'AB-123-CD', type: 'formation', resp: 'Jonathan', ops: 'Polissage',
  dateLimite: '2026-10-12', engageValide: 'Hervé', sortiePrevue: '2026-10-12', recep: 'Armand',
};

test('missingForEntry liste dans l\'ordre du formulaire les champs obligatoires vides', () => {
  assert.deepEqual(missingForEntry({}), ['plaque', 'type', 'resp', 'ops', 'dateLimite', 'engageValide', 'sortiePrevue', 'recep']);
  assert.deepEqual(missingForEntry(COMPLET), []);
  assert.deepEqual(missingForEntry({ ...COMPLET, ops: '', recep: '' }), ['ops', 'recep']);
});

test('missingForEntry traite une plaque sans caractère valide et un texte d\'espaces comme vides', () => {
  assert.deepEqual(missingForEntry({ ...COMPLET, plaque: ' - ', ops: '   ' }), ['plaque', 'ops']);
});

test('missingForCreate ne réclame que plaque, nature et réceptionnaire', () => {
  assert.deepEqual(missingForCreate({}), ['plaque', 'type', 'recep']);
  assert.deepEqual(missingForCreate({ plaque: 'ab123cd', type: 'formation', recep: 'Armand' }), []);
  assert.deepEqual(missingForCreate({ plaque: 'ab123cd', recep: 'Armand' }), ['type']);
});

test('sortieDefaut reprend la date limite quand la sortie est vide', () => {
  assert.equal(sortieDefaut({ dateLimite: '2026-10-12', sortiePrevue: '' }, '2026-10-08'), '2026-10-12');
});

test('sortieDefaut ne remplace jamais une sortie déjà saisie', () => {
  assert.equal(sortieDefaut({ dateLimite: '2026-10-12', sortiePrevue: '2026-10-10' }, '2026-10-08'), null);
});

test('sortieDefaut ignore la voiture tampon, une date passée ou une limite vide', () => {
  assert.equal(sortieDefaut({ dateLimite: TAMPON }, '2026-10-08'), null);
  assert.equal(sortieDefaut({ dateLimite: '2026-10-01' }, '2026-10-08'), null);
  assert.equal(sortieDefaut({}, '2026-10-08'), null);
});

test('formatPlate française : tirets après 2 lettres et 3 chiffres, caractères hors format refusés', () => {
  assert.equal(formatPlate('ab', 'fr'), 'AB');
  assert.equal(formatPlate('abc', 'fr'), 'AB');
  assert.equal(formatPlate('ab1', 'fr'), 'AB-1');
  assert.equal(formatPlate('ab123', 'fr'), 'AB-123');
  assert.equal(formatPlate('ab123c', 'fr'), 'AB-123-C');
  assert.equal(formatPlate('ab123cd', 'fr'), 'AB-123-CD');
  assert.equal(formatPlate('ab123cdxyz9', 'fr'), 'AB-123-CD');
  assert.equal(formatPlate('A1B2', 'fr'), 'AB-2');
  assert.equal(formatPlate('<b>12', 'fr'), 'B');
});

test('formatPlate française : les lettres I, O et U n\'existent pas en SIV', () => {
  assert.equal(formatPlate('io', 'fr'), '');
  assert.equal(formatPlate('ab123ou', 'fr'), 'AB-123');
});

test('formatPlate étrangère : majuscules, lettres, chiffres, espace et tiret, 12 caractères', () => {
  assert.equal(formatPlate('b-ab 1234', 'etr'), 'B-AB 1234');
  assert.equal(formatPlate('<script>', 'etr'), 'SCRIPT');
  assert.equal(formatPlate('  --ab  --12', 'etr'), 'AB 12');
  assert.equal(formatPlate('abcdefghijklmnop', 'etr'), 'ABCDEFGHIJKL');
  assert.equal(formatPlate('ñ12 äb', 'etr'), 'Ñ12 ÄB');
});

test('plateValid exige une plaque SIV complète pour la française', () => {
  assert.equal(plateValid('AB-123-CD', 'fr'), true);
  assert.equal(plateValid('AB-123-C', 'fr'), false);
  assert.equal(plateValid('', 'fr'), false);
  assert.equal(plateValid('1234 XY 78', 'fr'), false);
});

test('plateValid accepte toute plaque étrangère d\'au moins 2 caractères', () => {
  assert.equal(plateValid('B-AB 1234', 'etr'), true);
  assert.equal(plateValid('A', 'etr'), false);
  assert.equal(plateValid(' - ', 'etr'), false);
});

test('plateKind déduit le type des anciens dossiers sans type enregistré', () => {
  assert.equal(plateKind('AB-123-CD'), 'fr');
  assert.equal(plateKind('1234 XY 78'), 'etr');
  assert.equal(plateKind(''), 'fr');
});

test('sanitize ne garde que des chiffres, borne la longueur et retire les caractères de contrôle', () => {
  assert.equal(sanitize('12a3.4e5', { digits: true, max: 4 }), '1234');
  assert.equal(sanitize('  Dupont\u0000\u0007', { max: 30 }), 'Dupont');
  assert.equal(sanitize('x'.repeat(50), { max: 30 }).length, 30);
  assert.equal(sanitize(null, { max: 5 }), '');
});

test('sanitize garde les retours à la ligne des zones de texte', () => {
  assert.equal(sanitize('a\nb', { max: 10 }), 'a\nb');
});

test('RULES borne les champs numériques, le téléphone et l\'e-mail', () => {
  assert.equal(sanitize('45 200 km', RULES.km), '45200');
  assert.equal(sanitize('123', RULES.cles), '12');
  assert.equal(sanitize('06 12-34.56 78abc', RULES.clientTel), '06 12-34.56 78');
  assert.equal(sanitize('a b@c.fr', RULES.clientMail), 'ab@c.fr');
});

test('invalidForEntry signale e-mail, téléphone et dates mal formés mais saisis', () => {
  assert.deepEqual(invalidForEntry({}), []);
  assert.deepEqual(invalidForEntry({ clientMail: 'pas-un-mail', clientTel: '12' }), ['clientTel', 'clientMail']);
  assert.deepEqual(invalidForEntry({ clientMail: 'a@b.fr', clientTel: '06 12 34 56 78' }), []);
  assert.deepEqual(invalidForEntry({ dateLimite: '2026-02-30', sortiePrevue: '1999-01-01' }), ['dateLimite', 'sortiePrevue']);
});

test('missingForEntry compte une plaque incomplète comme manquante', () => {
  assert.deepEqual(missingForEntry({ ...COMPLET, plaque: 'AB-12', plaqueType: 'fr' }), ['plaque']);
  assert.deepEqual(missingForEntry({ ...COMPLET, plaque: 'B-AB 1234', plaqueType: 'etr' }), []);
});

test('entryErrors réunit manquants et invalides dans l\'ordre du formulaire', () => {
  assert.deepEqual(entryErrors({ ...COMPLET, ops: '', clientMail: 'x', plaque: '' }), ['plaque', 'ops', 'clientMail']);
});
