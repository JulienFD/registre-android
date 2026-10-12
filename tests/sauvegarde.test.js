const test = require('node:test');
const assert = require('node:assert/strict');
const { cheminSauvegardeValide, enteteSauvegarde, lireEnteteSauvegarde, nomSauvegarde } = require('../www/utils.js');

test('cheminSauvegardeValide accepte les fichiers de dossiers, photos, compléments et archives', () => {
  for (const p of [
    'vehicules/a1/dossier.json',
    'vehicules/a1/photos/p_2.json',
    'vehicules/a1/photos/p_2.jpg',
    'vehicules/a1/photos/p_2.pdf',
    'vehicules/a1/compl/c1.json',
    'archives/Entrees/2026/EDL-ENTREE_AB123CD_2026-10-08.pdf',
    'archives/Dossiers/2026/DOSSIER-COMPLET_AB123CD_2026-10-08_1760000000000.pdf',
    'archives/REGISTRE-INTEGRITE.csv',
  ]) assert.equal(cheminSauvegardeValide(p), true, p);
});

test('cheminSauvegardeValide refuse la configuration (PIN) et tout chemin hors de ces dossiers', () => {
  for (const p of [
    'config.json',
    'vehicules/a1/config.json',
    'vehicules/../config.json',
    'vehicules/a1/../../config.json',
    'vehicules/a1/photos/../../x.json',
    'vehicules/a1/compl/c1.jpg',
    'vehicules/a1/photos/p.exe',
    '/vehicules/a1/dossier.json',
    'archives/../config.json',
    'archives/Autre/2026/x.pdf',
    'archives/Entrees/2026/x.exe',
    '',
    null,
  ]) assert.equal(cheminSauvegardeValide(p), false, String(p));
});

test('enteteSauvegarde puis lireEnteteSauvegarde restituent le chemin et la taille', () => {
  const ligne = enteteSauvegarde('vehicules/a1/dossier.json', 42);
  assert.ok(ligne.endsWith('\n'));
  assert.deepEqual(lireEnteteSauvegarde(ligne), { chemin: 'vehicules/a1/dossier.json', taille: 42 });
});

test('lireEnteteSauvegarde refuse une ligne illisible, un chemin interdit ou une taille invalide', () => {
  assert.equal(lireEnteteSauvegarde('pas du json'), null);
  assert.equal(lireEnteteSauvegarde('{"p":"config.json","n":3}'), null);
  assert.equal(lireEnteteSauvegarde('{"p":"vehicules/a1/dossier.json","n":-1}'), null);
  assert.equal(lireEnteteSauvegarde('{"p":"vehicules/a1/dossier.json","n":1.5}'), null);
  assert.equal(lireEnteteSauvegarde('{"p":"vehicules/a1/dossier.json"}'), null);
});

test('enteteSauvegarde refuse un chemin interdit', () => {
  assert.throws(() => enteteSauvegarde('config.json', 1));
});

test('nomSauvegarde porte la date du jour', () => {
  assert.equal(nomSauvegarde(new Date('2026-10-12T09:00:00')), 'registre-sauvegarde_2026-10-12.registre');
});
