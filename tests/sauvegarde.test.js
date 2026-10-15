const test = require('node:test');
const assert = require('node:assert/strict');
const { cheminSauvegardeValide, enteteSauvegarde, lireEnteteSauvegarde, nomSauvegarde, crc32, zipEnteteLocale, zipEntreeCentrale, zipFin, zipLireFin, zipLireCentrale, zipDebutDonnees } = require('../www/sauvegarde.js');

test('cheminSauvegardeValide accepte les fichiers de dossiers, photos, compléments, rapports NexPTG et archives', () => {
  for (const p of [
    'vehicules/a1/dossier.json',
    'vehicules/a1/photos/p_2.json',
    'vehicules/a1/photos/p_2.jpg',
    'vehicules/a1/photos/p_2.pdf',
    'vehicules/a1/compl/c1.json',
    'vehicules/a1/nexptg/e5491ac50712a9437a855088ac0e761e78147da9f608c6de5ccef9c661f26d3f.json',
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
    'vehicules/a1/nexptg/x.jpg',
    'vehicules/a1/nexptg/../../config.json',
    'vehicules/a1/nexptg/a/b.json',
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

test('nomSauvegarde porte la date du jour et l\'extension demandée', () => {
  const d = new Date('2026-10-12T09:00:00');
  assert.equal(nomSauvegarde(d, 'registre'), 'registre-sauvegarde_2026-10-12.registre');
  assert.equal(nomSauvegarde(d, 'zip'), 'registre-sauvegarde_2026-10-12.zip');
});

test('crc32 : valeur de référence', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

function fabriquerZip(fichiers) {
  const morceaux = [], centrale = [];
  let pos = 0;
  for (const f of fichiers) {
    const crc = crc32(f.octets), tete = zipEnteteLocale(f.chemin, crc, f.octets.length);
    centrale.push(zipEntreeCentrale(f.chemin, crc, f.octets.length, pos));
    morceaux.push(tete, f.octets); pos += tete.length + f.octets.length;
  }
  const tailleCentrale = centrale.reduce((n, c) => n + c.length, 0);
  return Buffer.concat([...morceaux, ...centrale, zipFin(fichiers.length, tailleCentrale, pos)]);
}

test('zip : on relit l\'index et les données d\'un zip fabriqué (aller-retour)', () => {
  const a = new TextEncoder().encode('{"plaque":"AB-123-CD"}'), b = Uint8Array.from([0, 255, 1, 2, 3]);
  const zip = fabriquerZip([{ chemin: 'vehicules/a1/dossier.json', octets: a }, { chemin: 'vehicules/a1/photos/p1.jpg', octets: b }]);
  const fin = zipLireFin(zip);
  assert.equal(fin.nb, 2);
  const idx = zipLireCentrale(zip.subarray(fin.offset, fin.offset + fin.taille), fin.nb);
  assert.deepEqual(idx.map((e) => [e.chemin, e.methode, e.taille]), [['vehicules/a1/dossier.json', 0, a.length], ['vehicules/a1/photos/p1.jpg', 0, b.length]]);
  const e = idx[1], debut = e.debut + zipDebutDonnees(zip.subarray(e.debut, e.debut + 30));
  assert.deepEqual([...zip.subarray(debut, debut + e.taille)], [...b]);
});

test('zip : un zip sans fin de répertoire est refusé', () => {
  assert.equal(zipLireFin(new Uint8Array(100)), null);
});

test('zip : un zip vide a 0 entrée', () => {
  assert.equal(zipLireFin(fabriquerZip([])).nb, 0);
});
