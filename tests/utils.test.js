const test = require('node:test');
const assert = require('node:assert/strict');
const { TAMPON, normPlate, fmtPlate, daysTo, due, limite, missingForCreate, missingForEntry, sortieDefaut, formatPlate, plateValid, plateKind, sanitize, RULES, invalidForEntry, entryErrors, matchVehicle, parseVersion, versionCode, miseAJourDisponible, verifierVersion } = require('../www/utils.js');

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

const VEH = { plaque: 'AB123CD', marque: 'Peugeot', modele: '208', clientNom: 'Hélène Dupont', clientTel: '06 12 34 56 78', resp: 'Hervé', type: 'formation', sortiePrevue: '2026-10-07' };

test('matchVehicle sans critère garde tout', () => {
  assert.equal(matchVehicle(VEH, {}, NOW), true);
});

test('matchVehicle cherche par nom de client, sans accent ni casse', () => {
  assert.equal(matchVehicle(VEH, { q: 'helene' }, NOW), true);
  assert.equal(matchVehicle(VEH, { q: 'DUPONT' }, NOW), true);
});

test('matchVehicle exige tous les mots, dans n\'importe quel champ', () => {
  assert.equal(matchVehicle(VEH, { q: 'peugeot dupont' }, NOW), true);
  assert.equal(matchVehicle(VEH, { q: 'peugeot martin' }, NOW), false);
});

test('matchVehicle trouve une plaque saisie avec tirets et un téléphone espacé', () => {
  assert.equal(matchVehicle(VEH, { q: 'ab-123-cd' }, NOW), true);
  assert.equal(matchVehicle(VEH, { q: '0612345678' }, NOW), true);
});

test('matchVehicle filtre par type et par responsable', () => {
  assert.equal(matchVehicle(VEH, { type: 'formation' }, NOW), true);
  assert.equal(matchVehicle(VEH, { type: 'parcours' }, NOW), false);
  assert.equal(matchVehicle(VEH, { resp: 'Hervé' }, NOW), true);
  assert.equal(matchVehicle(VEH, { resp: 'Armand' }, NOW), false);
});

test('matchVehicle filtre les véhicules en retard', () => {
  assert.equal(matchVehicle(VEH, { retard: true }, NOW), true);
  assert.equal(matchVehicle({ ...VEH, sortiePrevue: '2026-10-09' }, { retard: true }, NOW), false);
  assert.equal(matchVehicle({ ...VEH, sortiePrevue: '' }, { retard: true }, NOW), false);
});

test('matchVehicle combine recherche et filtres', () => {
  assert.equal(matchVehicle(VEH, { q: 'dupont', type: 'parcours' }, NOW), false);
});

test('parseVersion lit un tag vX.Y.Z et rejette le reste', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseVersion('1.10.0'), [1, 10, 0]);
  assert.equal(parseVersion('v1.2'), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(null), null);
});

test('versionCode croît avec la version (contrainte Android pour mettre à jour)', () => {
  assert.equal(versionCode('v1.2.3'), 10203);
  assert.ok(versionCode('v1.10.0') > versionCode('v1.9.9'));
  assert.ok(versionCode('v2.0.0') > versionCode('v1.99.99'));
  assert.equal(versionCode('abc'), null);
});

const URL_APK = 'https://github.com/JulienFD/registre-android/releases/download/v1.1.0/registre-vehicules-v1.1.0.apk';
const release = (over) => Object.assign({
  tag_name: 'v1.1.0', draft: false, prerelease: false,
  assets: [{ name: 'registre-vehicules-v1.1.0.apk', browser_download_url: URL_APK }],
}, over);

test('miseAJourDisponible renvoie la version et l\'URL de l\'APK quand elle est plus récente', () => {
  assert.deepEqual(miseAJourDisponible(release(), '1.0.0'), { version: '1.1.0', url: URL_APK });
});

test('miseAJourDisponible ne propose rien si la version est identique ou plus ancienne', () => {
  assert.equal(miseAJourDisponible(release(), '1.1.0'), null);
  assert.equal(miseAJourDisponible(release(), '1.2.0'), null);
});

test('miseAJourDisponible ignore brouillons, préversions, release sans APK ou réponse invalide', () => {
  assert.equal(miseAJourDisponible(release({ draft: true }), '1.0.0'), null);
  assert.equal(miseAJourDisponible(release({ prerelease: true }), '1.0.0'), null);
  assert.equal(miseAJourDisponible(release({ assets: [] }), '1.0.0'), null);
  assert.equal(miseAJourDisponible(null, '1.0.0'), null);
  assert.equal(miseAJourDisponible(release({ tag_name: 'nightly' }), '1.0.0'), null);
});

test('miseAJourDisponible refuse un APK hors du dépôt officiel', () => {
  const hors = release({ assets: [{ name: 'x.apk', browser_download_url: 'https://evil.example/x.apk' }] });
  assert.equal(miseAJourDisponible(hors, '1.0.0'), null);
});

test('verifierVersion accepte une version supérieure à tous les tags existants', () => {
  assert.deepEqual(verifierVersion('1.1.0', ['v1.0.0', 'v1.0.5']), { ok: true });
  assert.deepEqual(verifierVersion('1.0.0', []), { ok: true });
});

test('verifierVersion refuse une version déjà publiée, antérieure ou mal formée', () => {
  assert.equal(verifierVersion('1.0.5', ['v1.0.0', 'v1.0.5']).ok, false);
  assert.equal(verifierVersion('1.0.1', ['v1.0.0', 'v1.0.5']).ok, false);
  assert.equal(verifierVersion('1.10.0', ['v1.9.0']).ok, true);
  assert.equal(verifierVersion('1.0', []).ok, false);
});

test('verifierVersion ignore les tags qui ne sont pas des versions', () => {
  assert.equal(verifierVersion('1.0.1', ['v1.0.0', 'nightly']).ok, true);
});

test('verifierVersion explique le refus', () => {
  assert.match(verifierVersion('1.0.0', ['v1.0.0']).erreur, /1\.0\.0/);
});
