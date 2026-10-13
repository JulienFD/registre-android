const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lireSynchro, etatNexptg, candidats, demandeTermine, versionAjouter, libelleElement, libelleZone, libelleRoue, libelleSaison, lireRapport, statsElement } = require('../www/nexptg.js');

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

// --- état NexPTG d'un dossier ---

const env = (sha, recu, extra) => Object.assign({ sha256: sha, recu, cle: 'S#1#100', par: 'elwen', plaque: 'AB123CD', brut: {} }, extra);

test('un dossier sans mesures est en attente et bloque la signature', () => {
  const e = etatNexptg({}, []);
  assert.equal(e.statut, 'attente');
  assert.equal(e.ok, false);
  assert.equal(e.derniere, null);
});

test('« Commencer les mesures » place le dossier en cours, sans le débloquer', () => {
  const e = etatNexptg({ nexptg: { qui: 'elwen', debutAt: 1000 } }, []);
  assert.equal(e.statut, 'mesures');
  assert.equal(e.ok, false);
});

test('un rapport reçu valide le dossier ; la dernière version reçue est celle affichée', () => {
  const e = etatNexptg({ nexptg: { qui: 'elwen', debutAt: 1000 } }, [env('a', 2000), env('c', 4000), env('b', 3000)]);
  assert.equal(e.statut, 'recu');
  assert.equal(e.ok, true);
  assert.equal(e.derniere.sha256, 'c');
});

test('« Terminé » avec un motif valide le dossier, sans rapport', () => {
  const termine = { at: 5000, motif: 'Appareil en panne, mesures prises à la main', par: 'elwen' };
  const e = etatNexptg({ nexptg: { qui: 'elwen', termine } }, []);
  assert.equal(e.statut, 'termine');
  assert.equal(e.ok, true);
  assert.deepEqual(e.termine, termine);
});

test('un rapport reçu prime sur « Terminé »', () => {
  const e = etatNexptg({ nexptg: { termine: { at: 1, motif: 'x'.repeat(10), par: 'elwen' } } }, [env('a', 2000)]);
  assert.equal(e.statut, 'recu');
});

test('un « Terminé » sans motif exploitable ne valide rien', () => {
  for (const termine of [{ at: 1, motif: '', par: 'e' }, { at: 1, motif: '  ', par: 'e' }, { at: 1 }, null, 'oui']) {
    assert.equal(etatNexptg({ nexptg: { termine } }, []).ok, false, JSON.stringify(termine));
  }
});

// --- « Terminé » avec confirmation et motif obligatoire ---

test('demandeTermine exige un motif d\'au moins 5 caractères et l\'enregistre horodaté', () => {
  const r = demandeTermine({ motif: '  Appareil en panne  ', par: 'elwen', maintenant: 7000 });
  assert.deepEqual(r, { ok: true, termine: { at: 7000, motif: 'Appareil en panne', par: 'elwen' } });
});

test('demandeTermine refuse un motif vide, trop court ou démesuré', () => {
  for (const motif of ['', '   ', 'abc', undefined, 'x'.repeat(301)]) {
    assert.deepEqual(demandeTermine({ motif, par: 'elwen', maintenant: 1 }), { ok: false, erreur: 'motif' }, String(motif));
  }
});

// --- rapports à proposer parmi ceux du relais ---

const rap = (extra) => Object.assign({
  cle: 'S#1#100', plaque: 'AB123CD', par: 'elwen', recu: 2000000, reclame: null,
  brut: { date: 2000 }, // 2 000 s = 2 000 000 ms
}, extra);
const BASE = { plaque: 'ab-123-cd', dossierId: '2026-10-13-AB123CD', creeLe: 1000000, par: 'elwen' };

test('un rapport libre, de la bonne plaque et postérieur au dossier est proposé', () => {
  assert.deepEqual(candidats(Object.assign({ rapports: [rap()] }, BASE)).map((r) => r.cle), ['S#1#100']);
});

test('un rapport déjà réclamé par un autre dossier n\'est jamais proposé', () => {
  const pris = rap({ reclame: { dossier: 'AUTRE', par: 'tablette', recu: 1 } });
  assert.deepEqual(candidats(Object.assign({ rapports: [pris] }, BASE)), []);
});

test('un rapport déjà réclamé par ce dossier reste proposé (reprise après coupure)', () => {
  const mien = rap({ reclame: { dossier: BASE.dossierId, par: 'tablette', recu: 1 } });
  assert.equal(candidats(Object.assign({ rapports: [mien] }, BASE)).length, 1);
});

test('seuls les rapports du technicien choisi sont proposés', () => {
  const autre = rap({ cle: 'S#2#100', par: 'julien' });
  assert.deepEqual(candidats(Object.assign({ rapports: [rap(), autre] }, BASE)).map((r) => r.par), ['elwen']);
});

test('un rapport créé avant le dossier est écarté, avec 10 minutes de tolérance sur les horloges', () => {
  const avant = rap({ cle: 'S#3#100', brut: { date: 1000 - 11 * 60 } });   // 11 min avant la création
  const proche = rap({ cle: 'S#4#100', brut: { date: 1000 - 5 * 60 } });  // 5 min avant : toléré
  const noms = candidats(Object.assign({ rapports: [avant, proche] }, BASE)).map((r) => r.cle);
  assert.deepEqual(noms, ['S#4#100']);
});

test('la plaque doit correspondre, quelle que soit sa mise en forme', () => {
  const autre = rap({ cle: 'S#5#100', plaque: 'ZZ999ZZ' });
  assert.deepEqual(candidats(Object.assign({ rapports: [rap(), autre] }, BASE)).map((r) => r.cle), ['S#1#100']);
});

test('les candidats sont triés du plus récent au plus ancien, plusieurs candidats ne sont pas départagés', () => {
  const a = rap({ cle: 'S#6#100', recu: 3000000 });
  const b = rap({ cle: 'S#7#100', recu: 5000000 });
  assert.deepEqual(candidats(Object.assign({ rapports: [a, rap(), b] }, BASE)).map((r) => r.cle), ['S#7#100', 'S#6#100', 'S#1#100']);
});

// --- versions déjà stockées ---

test('versionAjouter signale une version du relais absente du dossier', () => {
  assert.equal(versionAjouter(rap({ sha256: 'n' }), [env('a', 1)]), true);
  assert.equal(versionAjouter(rap({ sha256: 'a' }), [env('a', 1)]), false);
  assert.equal(versionAjouter(rap({ sha256: 'a' }), []), true);
});

// --- libellés et statistiques pour l'affichage ---

test('les éléments NexPTG ont un libellé français, un type inconnu garde son nom brut', () => {
  assert.equal(libelleElement('LEFT_FRONT_FENDER'), 'Aile avant gauche');
  assert.equal(libelleElement('RIGHT_REAR_DOOR'), 'Porte arrière droite');
  assert.equal(libelleElement('HOOD'), 'Capot');
  assert.equal(libelleElement('ENGINE_COMPARTMENT'), 'Compartiment moteur');
  assert.equal(libelleElement('SOMETHING_NEW'), 'SOMETHING_NEW');
});

test('les zones ont un libellé français', () => {
  assert.deepEqual(['left', 'right', 'top', 'back'].map(libelleZone), ['Côté gauche', 'Côté droit', 'Haut', 'Dos']);
  assert.equal(libelleZone('autre'), 'autre');
});

test('statsElement calcule minimum, maximum, moyenne et nombre de mesures ignorées', () => {
  const el = rapport().externe[0].elements[0]; // 193, 195, 258, 1609 (Fe)
  assert.deepEqual(statsElement(el.valeurs), { n: 4, min: 193, max: 1609, moyenne: 564, ignorees: 0 });
});

test('statsElement ne compte pas les mesures ignorées dans les statistiques', () => {
  const el = rapportPartiel().externe[2].elements[0]; // capot : 70, 71, 73, 74, 74
  assert.deepEqual(statsElement(el.valeurs), { n: 5, min: 70, max: 74, moyenne: 72, ignorees: 0 });
  const roof = rapportPartiel().externe[2].elements[1]; // toit : 5 mesures ignorées
  assert.deepEqual(statsElement(roof.valeurs), { n: 0, min: null, max: null, moyenne: null, ignorees: 5 });
});

test('les roues et saisons ont un libellé français, une valeur inconnue garde son texte', () => {
  assert.deepEqual(['Left front', 'Right front', 'Left rear', 'Right rear'].map(libelleRoue), ['Avant gauche', 'Avant droite', 'Arrière gauche', 'Arrière droite']);
  assert.equal(libelleRoue('Spare'), 'Spare');
  assert.equal(libelleSaison('All season'), 'Toute la saison');
  assert.equal(libelleSaison('Mud'), 'Mud');
});

test('lireRapport normalise un rapport brut seul, comme lireSynchro', () => {
  const brut = fixture('nexptg-rapport-champ.json');
  const seul = lireRapport(JSON.parse(brut).data.reports[0]);
  assert.deepEqual(seul, lireSynchro(brut).rapports[0]);
});
