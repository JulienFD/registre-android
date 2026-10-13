const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { vue, categorie } = require('../www/nexptg-vue.js');
const { etatNexptg } = require('../www/nexptg.js');

const fixture = (nom) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8'));
const brutComplet = fixture('nexptg-rapport.json').data.reports[0];

const CTX = {
  plaque: 'AB-123-CD', dossierId: 'D1', relaisConfigure: true, techniciens: ['elwen', 'julien'],
  erreurTechniciens: '', erreur: '', derniereVerif: 0, candidats: [], occupe: false,
};
const env = (extra) => Object.assign({ sha256: 'a'.repeat(64), recu: 1791887764000, cle: 'S#1#100', par: 'elwen', plaque: 'AB123CD', brut: brutComplet, avertissements: [] }, extra);
const rendre = (dossier, versions, ctx) => vue(etatNexptg(dossier, versions), Object.assign({}, CTX, ctx), dossier);

test('en attente, on choisit qui mesure parmi les techniciens du relais', () => {
  const h = rendre({}, []);
  assert.match(h, /Qui va prendre les mesures/);
  assert.match(h, /<select id="nx-qui"/);
  assert.match(h, /<option value="elwen">elwen<\/option>/);
  assert.match(h, /<option value="julien">julien<\/option>/);
  assert.match(h, /data-act="nxCommencer"/);
  assert.match(h, /data-act="nxTermine"/);
});

test('sans relais configuré, on est renvoyé aux réglages et « Terminé » reste possible', () => {
  const h = rendre({}, [], { relaisConfigure: false, techniciens: null });
  assert.match(h, /Réglages/);
  assert.equal(/data-act="nxCommencer"/.test(h), false);
  assert.match(h, /data-act="nxTermine"/);
});

test('une erreur de chargement des techniciens est affichée, avec possibilité de réessayer', () => {
  const h = rendre({}, [], { techniciens: null, erreurTechniciens: 'Relais injoignable : vérifier la connexion de la tablette' });
  assert.match(h, /Relais injoignable/);
  assert.match(h, /data-act="nxRecharger"/);
});

test('pendant les mesures, on attend le rapport du technicien choisi', () => {
  const h = rendre({ nexptg: { qui: 'elwen', debutAt: 1 } }, [], { derniereVerif: 1791887764000 });
  assert.match(h, /En attente du rapport de <b>elwen<\/b>/);
  assert.match(h, /AB-123-CD/);
  assert.match(h, /Immatriculation/);
  assert.match(h, /data-act="nxVerifier"/);
  assert.match(h, /data-act="nxTermine"/);
  assert.equal(/<select id="nx-qui"/.test(h), false);
});

test('une erreur de vérification est montrée sans interrompre l\'attente', () => {
  const h = rendre({ nexptg: { qui: 'elwen', debutAt: 1 } }, [], { erreur: 'Identifiants refusés par le relais' });
  assert.match(h, /Identifiants refusés par le relais/);
  assert.match(h, /data-act="nxVerifier"/);
});

test('plusieurs rapports possibles : l\'utilisateur choisit, rien n\'est rattaché tout seul', () => {
  const a = { sha256: 'a'.repeat(64), cle: 'S#1#100', par: 'elwen', recu: 1791887764000, brut: { name: 'Rapport A', date: 1791887700 } };
  const b = { sha256: 'b'.repeat(64), cle: 'S#2#100', par: 'elwen', recu: 1791887999000, brut: { name: 'Rapport B', date: 1791887900 } };
  const h = rendre({ nexptg: { qui: 'elwen', debutAt: 1 } }, [], { candidats: [a, b] });
  assert.match(h, /Plusieurs rapports/);
  assert.match(h, /Rapport A/);
  assert.match(h, /Rapport B/);
  assert.equal((h.match(/data-act="nxChoisir"/g) || []).length, 2);
  assert.match(h, new RegExp('data-sha="' + 'a'.repeat(64) + '"'));
});

test('un rapport reçu affiche ses mesures par zone avec libellés français et statistiques', () => {
  const h = rendre({ nexptg: { qui: 'elwen', debutAt: 1 } }, [env()]);
  assert.match(h, /Rapport NexPTG reçu/);
  assert.match(h, /Peugeot 207/);
  assert.match(h, /Côté gauche/);
  assert.match(h, /Aile avant gauche/);
  assert.match(h, /Capot/);
  assert.match(h, /Compartiment moteur|Intérieur/);
});

test('les mesures sont classées par la couleur de l\'interprétation, avec un libellé en clair', () => {
  const partiel = fixture('nexptg-rapport-mesures-ignorees.json').data.reports[0];
  const h = rendre({}, [env({ brut: partiel })]);
  assert.match(h, /nx-i-1/);
  assert.match(h, /nx-i-ignore/);
  assert.match(h, /title="Peinture d&#39;origine"/);
});

test('plusieurs versions reçues : la dernière est affichée et le nombre de versions est indiqué', () => {
  const v1 = env({ sha256: '1'.repeat(64), recu: 1000, brut: Object.assign({}, brutComplet, { comment: 'ancien' }) });
  const v2 = env({ sha256: '2'.repeat(64), recu: 2000, brut: Object.assign({}, brutComplet, { comment: 'récent' }) });
  const h = rendre({}, [v1, v2]);
  assert.match(h, /récent/);
  assert.equal(/ancien/.test(h), false);
  assert.match(h, /2 versions/);
});

test('« Terminé » sans rapport affiche le motif et signale l\'absence de mesures', () => {
  const h = rendre({ nexptg: { termine: { at: 1791887764000, motif: 'Appareil en panne', par: 'elwen' } } }, []);
  assert.match(h, /sans rapport/i);
  assert.match(h, /Appareil en panne/);
  assert.match(h, /elwen/);
});

test('aucune donnée venant du relais ou de la saisie n\'est insérée sans échappement', () => {
  const piege = '<img src=x onerror=alert(1)>';
  const brut = Object.assign({}, brutComplet, { name: piege, comment: piege });
  const h1 = rendre({}, [env({ brut, par: piege })]);
  const h2 = rendre({ nexptg: { termine: { at: 1, motif: piege + ' motif', par: piege } } }, []);
  const h3 = rendre({ nexptg: { qui: piege, debutAt: 1 } }, [], { erreur: piege, candidats: [] });
  for (const h of [h1, h2, h3]) assert.equal(h.includes('<img'), false);
});

test('categorie associe un code d\'interprétation à un libellé et une classe', () => {
  assert.deepEqual(categorie(1), { classe: 'nx-i-1', libelle: 'Peinture d\'origine' });
  assert.equal(categorie(2).libelle, 'Seconde couche');
  assert.equal(categorie(5).classe, 'nx-i-5');
  assert.equal(categorie(-2).libelle, 'Mesure ignorée');
  assert.equal(categorie(99).libelle, 'Non classée');
});
