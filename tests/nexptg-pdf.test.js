const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planSynthese, COULEURS } = require('../www/nexptg-pdf.js');
const { lireRapport } = require('../www/nexptg.js');

const brut = (nom) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8')).data.reports[0];
const OPTS = { recu: 1791887764000, par: 'elwen', nbVersions: 2, avertissements: [] };
const complet = () => planSynthese(lireRapport(brut('nexptg-rapport.json')), OPTS);
const partiel = () => planSynthese(lireRapport(brut('nexptg-rapport-mesures-ignorees.json')), OPTS);
const valeursDu = (b) => ['data', 'dataInside'].reduce((n, k) => n + b[k].reduce((m, z) => m + z.data.reduce((q, e) => q + e.values.length, 0), 0), 0);

test('l\'en-tête reprend le rapport, le technicien, la réception et les données du véhicule', () => {
  const p = complet();
  assert.equal(p.titre, 'Peugeot 207');
  const infos = Object.fromEntries(p.infos);
  assert.equal(infos.Technicien, 'elwen');
  assert.equal(infos.Appareil, '28409 Professional');
  assert.equal(infos['Versions reçues'], '2');
  assert.equal(infos.Marque, 'Peugeot');
  assert.equal(infos.VIN, 'JSP');
  assert.ok(infos['Reçu le']);
  assert.equal(p.commentaire, 'Blablanla');
});

test('les champs supplémentaires du rapport figurent dans l\'en-tête', () => {
  const p = planSynthese(lireRapport(brut('nexptg-rapport-champ.json')), OPTS);
  assert.equal(Object.fromEntries(p.infos).Immatriculation, 'AB123CD');
});

test('aucune mesure n\'est perdue : chaque relevé du rapport figure dans les tableaux', () => {
  const b = brut('nexptg-rapport.json');
  const p = planSynthese(lireRapport(b), OPTS);
  const n = p.tableaux.reduce((m, t) => m + t.lignes.reduce((q, l) => q + l.releves.length, 0), 0);
  assert.equal(n, valeursDu(b));
});

test('un relevé ignoré est écrit « – », et compté séparément dans les statistiques', () => {
  const p = partiel();
  const gauche = p.tableaux.filter((t) => t.titre === 'Mesures externes : Côté gauche')[0];
  const aile = gauche.lignes.filter((l) => l.element === 'Aile avant gauche')[0];
  assert.deepEqual(aile.releves.map((r) => r.texte), ['–', '–', '–', '–']);
  assert.equal(aile.min, '–');
  const haut = p.tableaux.filter((t) => t.titre === 'Mesures externes : Haut')[0];
  const capot = haut.lignes.filter((l) => l.element === 'Capot')[0];
  assert.deepEqual(capot.releves.map((r) => r.texte), ['70', '71', '73', '74', '74']);
  assert.equal(capot.min, '70');
  assert.equal(capot.max, '74');
  assert.equal(capot.moy, '72');
});

test('un élément sans schéma figure quand même dans les tableaux', () => {
  const b = brut('nexptg-rapport.json');
  b.data[0].data.push({ type: 'LEFT_MIRROR', values: [{ value: '90', interpretation: 1, type: 'Fe', timestamp: 1, position: 1 }] });
  const p = planSynthese(lireRapport(b), OPTS);
  const gauche = p.tableaux.filter((t) => t.titre === 'Mesures externes : Côté gauche')[0];
  assert.ok(gauche.lignes.some((l) => l.element === 'LEFT_MIRROR'));
});

test('les schémas portent des couleurs RVB prêtes à tracer, reprises de la palette de l\'application', () => {
  const p = complet();
  const gauche = p.schemas.filter((s) => s.id === 'ext-left')[0];
  const aile = gauche.formes[0];
  assert.equal(aile.type, 'LEFT_FRONT_FENDER');
  assert.deepEqual(aile.stroke, COULEURS.bad);   // pire mesure : 1609 µm
  assert.ok(aile.fill.every((c) => c > 150));    // teinte claire
  const pt = gauche.points.filter((q) => q.type === 'LEFT_FRONT_FENDER' && q.n === 1)[0];
  assert.deepEqual(pt.stroke, COULEURS.warn);    // seconde couche
  assert.equal(pt.plein, false);
  const epais = gauche.points.filter((q) => q.type === 'LEFT_FRONT_FENDER' && q.n === 4)[0];
  assert.equal(epais.plein, true);
});

test('un point de mesure ignorée est pointillé et grisé', () => {
  const g = partiel().schemas.filter((s) => s.id === 'ext-left')[0];
  const pt = g.points[0];
  assert.equal(pt.ignore, true);
  assert.deepEqual(pt.stroke, COULEURS.gris);
});

test('les pneus renseignés sont décrits, les roues vides sont omises', () => {
  const p = complet();
  assert.equal(p.pneus.length, 4);
  assert.equal(p.pneus[0].roue, 'Avant gauche');
  assert.match(p.pneus[0].description, /Barum/);
  assert.match(p.pneus[0].description, /12\/14 R14/);
  assert.equal(partiel().pneus.length, 0);
});

test('la légende liste les catégories avec leur couleur', () => {
  const l = complet().legende;
  assert.ok(l.length >= 5);
  assert.ok(l.some((x) => x.libelle === 'Peinture d\'origine' && x.couleur === COULEURS.ok));
});

test('les avertissements du rapport sont conservés', () => {
  const p = planSynthese(lireRapport(brut('nexptg-rapport.json')), Object.assign({}, OPTS, { avertissements: ['plaque absente'] }));
  assert.deepEqual(p.avertissements, ['plaque absente']);
});

test('le plan reprend le cadre de chaque schéma, pour ne pas imprimer de vide', () => {
  const g = complet().schemas.filter((s) => s.id === 'ext-left')[0];
  assert.ok(g.cadre.w > 0 && g.cadre.h > 0 && g.cadre.h < g.h);
});
