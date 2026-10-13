const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lireSynchro } = require('../www/nexptg.js');

const fixture = (nom) => fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8');
const rapport = () => lireSynchro(fixture('nexptg-rapport.json')).rapports[0];
const rapportAvecChamp = () => lireSynchro(fixture('nexptg-rapport-champ.json')).rapports[0];

test('une synchro vide ne contient ni historique ni rapport', () => {
  assert.deepEqual(lireSynchro(fixture('nexptg-vide.json')), { historique: [], rapports: [] });
});

test('l\'historique des mesures libres est lu avec dates en millisecondes', () => {
  const { historique, rapports } = lireSynchro(fixture('nexptg-historique.json'));
  assert.equal(rapports.length, 0);
  assert.equal(historique.length, 1);
  assert.equal(historique[0].nom, 'Général');
  assert.deepEqual(historique[0].brut, JSON.parse(fixture('nexptg-historique.json')).data.history[0]);
  assert.equal(historique[0].mesures.length, 8);
  assert.deepEqual(historique[0].mesures[0], { valeur: 85, texte: '85', materiau: 'Fe', interpretation: 1, ts: 1791885950000, position: null });
});

test('un rapport est identifié par appareil, id et date de création', () => {
  const r = rapport();
  assert.equal(r.cle, '28409 Professional#1#1791887764');
  assert.equal(r.serie, '28409 Professional');
  assert.equal(r.id, 1);
});

test('une version modifiée du même rapport garde la même identité', () => {
  const v1 = lireSynchro(fixture('nexptg-rapport-mesures-ignorees.json')).rapports[0];
  const v2 = lireSynchro(fixture('nexptg-rapport-mesures-ignorees-v2.json')).rapports[0];
  assert.equal(v1.cle, '28409 Professional#2#1791896184');
  assert.equal(v2.cle, v1.cle);
  assert.equal(v1.commentaire, '');
  assert.equal(v2.commentaire, 'Blabla');
});

test('le même id sur un autre rapport (application réinstallée) a une autre identité', () => {
  const brut = JSON.parse(fixture('nexptg-rapport-mesures-ignorees.json'));
  const autre = JSON.parse(JSON.stringify(brut));
  autre.data.reports[0].date = 1791999999;
  assert.notEqual(lireSynchro(brut).rapports[0].cle, lireSynchro(autre).rapports[0].cle);
});

test('les données du véhicule et du rapport sont lues', () => {
  const r = rapport();
  assert.equal(r.nom, 'Peugeot 207');
  assert.equal(r.date, 1791887764000);
  assert.equal(r.unite, 'μm');
  assert.equal(r.commentaire, 'Blablanla');
  assert.deepEqual(r.vehicule, {
    marque: 'Peugeot', modele: '207', carrosserie: 'BREAK', cylindree: '200', puissance: '600',
    vin: 'JSP', energie: 'Gasoil', millesime: '2026',
  });
});

test('les mesures externes sont regroupées par zone puis par élément', () => {
  const r = rapport();
  assert.deepEqual(r.externe.map((z) => z.zone), ['left', 'right', 'top', 'back']);
  const gauche = r.externe[0];
  assert.deepEqual(gauche.elements.map((e) => e.type), [
    'LEFT_FRONT_FENDER', 'LEFT_FRONT_DOOR', 'LEFT_REAR_DOOR', 'LEFT_PILLAR', 'LEFT_REAR_FENDER',
  ]);
  assert.equal(gauche.elements[0].valeurs.length, 4);
  assert.deepEqual(gauche.elements[0].valeurs[0], { valeur: 193, texte: '193', materiau: 'Fe', interpretation: 2, ts: 1791887572000, position: 1 });
});

test('les mesures internes sont lues comme les externes', () => {
  const r = rapport();
  assert.deepEqual(r.interne.map((z) => z.zone), ['left', 'right', 'top', 'back']);
  assert.deepEqual(r.interne[2].elements.map((e) => e.type), ['ENGINE_COMPARTMENT']);
  assert.equal(r.interne[0].elements[0].valeurs.length, 8);
});

test('les pneus gardent leur emplacement et les valeurs absentes sont vides', () => {
  const r = rapport();
  assert.equal(r.pneus.length, 4);
  assert.deepEqual(r.pneus[0], {
    emplacement: 'Left front', fabricant: 'Barum', saison: 'All season',
    largeur: '12', profil: '14', diametre: '14', valeur1: '125', valeur2: '125',
  });
  assert.equal(r.pneus[1].valeur1, '');
});

test('sans champ supplémentaire, la plaque est absente et signalée', () => {
  const r = rapport();
  assert.equal(r.plaque, '');
  assert.deepEqual(r.champs, []);
  assert.ok(r.avertissements.includes('plaque absente'));
});

test('le champ « Immatriculation » fournit la plaque normalisée', () => {
  const r = rapportAvecChamp();
  assert.deepEqual(r.champs, [{ titre: 'Immatriculation', texte: 'AB123CD' }]);
  assert.equal(r.plaque, 'AB123CD');
  assert.deepEqual(r.avertissements, []);
});

test('le titre du champ plaque est reconnu sans tenir compte de la casse ni des accents', () => {
  for (const titre of ['IMMAT', 'Plaque', 'N° d\'immatriculation', 'immatriculation véhicule']) {
    const brut = JSON.parse(fixture('nexptg-rapport-champ.json'));
    brut.data.reports[0].extraFields = [{ title: titre, text: 'ab-123-cd', type: 0 }];
    assert.equal(lireSynchro(brut).rapports[0].plaque, 'AB123CD', titre);
  }
});

test('une plaque hors format est conservée mais signalée', () => {
  const brut = JSON.parse(fixture('nexptg-rapport-champ.json'));
  brut.data.reports[0].extraFields = [{ title: 'Immatriculation', text: 'JSP', type: 0 }];
  const r = lireSynchro(brut).rapports[0];
  assert.equal(r.plaque, 'JSP');
  assert.ok(r.avertissements.includes('plaque hors format SIV'));
});

test('le rapport d\'origine est conservé tel quel, sans perte', () => {
  const brut = JSON.parse(fixture('nexptg-rapport-champ.json'));
  const r = lireSynchro(fixture('nexptg-rapport-champ.json')).rapports[0];
  assert.deepEqual(r.brut, brut.data.reports[0]);
});

test('un rapport incomplet est lu quand même et signalé, jamais rejeté', () => {
  const r = lireSynchro({ data: { history: [], reports: [{ id: 3, unexpected: { a: 1 } }] } }).rapports[0];
  assert.equal(r.cle, '#3#');
  assert.deepEqual(r.externe, []);
  assert.deepEqual(r.pneus, []);
  assert.ok(r.avertissements.includes('numéro de série absent'));
  assert.deepEqual(r.brut, { id: 3, unexpected: { a: 1 } });
});

test('une valeur non numérique garde son texte et n\'a pas de valeur', () => {
  const brut = JSON.parse(fixture('nexptg-rapport.json'));
  brut.data.reports[0].data[0].data[0].values[0].value = '∞';
  const v = lireSynchro(brut).rapports[0].externe[0].elements[0].valeurs[0];
  assert.equal(v.valeur, null);
  assert.equal(v.texte, '∞');
});

// Rapport réel reçu en production : seules les mesures du capot ont été prises, le reste est ignoré.
const rapportPartiel = () => lireSynchro(fixture('nexptg-rapport-mesures-ignorees.json')).rapports[0];

test('une mesure ignorée dans NexPTG n\'a ni valeur, ni matériau, ni date', () => {
  const v = rapportPartiel().externe[0].elements[0].valeurs[0];
  assert.deepEqual(v, { valeur: null, texte: ' - ', materiau: '-', interpretation: -2, ts: 0, position: 1 });
});

test('un rapport partiel garde ses mesures réelles et ses sections vides', () => {
  const r = rapportPartiel();
  assert.equal(r.plaque, 'ZZ999ZZ');
  assert.deepEqual(r.avertissements, []);
  const capot = r.externe[2].elements[0];
  assert.equal(capot.type, 'HOOD');
  assert.deepEqual(capot.valeurs.map((v) => v.valeur), [70, 71, 73, 74, 74]);
  assert.deepEqual(r.interne, []);
  assert.deepEqual(r.pneus, []);
  assert.equal(r.vehicule.marque, '');
  assert.equal(r.vehicule.carrosserie, 'BREAK');
});

test('une entrée qui n\'est pas une synchro NexPTG est refusée', () => {
  assert.throws(() => lireSynchro('pas du json'), /JSON invalide/);
  assert.throws(() => lireSynchro('{}'), /Structure NexPTG inattendue/);
  assert.throws(() => lireSynchro('[]'), /Structure NexPTG inattendue/);
  assert.throws(() => lireSynchro('null'), /Structure NexPTG inattendue/);
});

test('une synchro sans historique ni rapports est tolérée', () => {
  assert.deepEqual(lireSynchro({ data: {} }), { historique: [], rapports: [] });
});
