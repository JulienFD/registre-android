const test = require('node:test');
const assert = require('node:assert/strict');
const { plan } = require('../www/photos-tel.js');

const J = 86400000;
const CREE = Date.UTC(2026, 9, 13, 8, 0, 0);
const SLOTS = [{ k: 'avg', l: 'Avant gauche (3/4)' }, { k: 'av', l: 'Face avant' }, { k: 'ar', l: 'Face arrière' }];
const ph = (n, extra) => Object.assign({ sha256: String(n).repeat(64).slice(0, 64), phase: 'entree', slot: 'av', label: '', par: 'elwen', recu: CREE + 3600000, prise: CREE + 3500000, reclame: null }, extra);
const BASE = { dossierId: 'D1', creeLe: CREE, sortieAt: 0, locales: [], slots: SLOTS };
const p = (photos, extra) => plan(Object.assign({}, BASE, { photos }, extra));

test('une photo de véhicule libre, de la bonne période, est à importer à son emplacement', () => {
  const r = p([ph(1)]);
  assert.equal(r.auto.length, 1);
  assert.deepEqual(r.auto[0].item, { phase: 'entree', slot: 'av', label: 'Face avant' });
  assert.deepEqual(r.complements, []);
});

test('une photo déjà réclamée par un autre dossier n\'est jamais reprise', () => {
  const r = p([ph(1, { reclame: { dossier: 'AUTRE', par: 'tablette', recu: 1 } })]);
  assert.deepEqual(r.auto, []);
  assert.equal(r.ignores.autreDossier, 1);
});

test('une photo déjà réclamée par ce dossier mais pas encore enregistrée est reprise', () => {
  const r = p([ph(1, { reclame: { dossier: 'D1', par: 'tablette', recu: 1 } })]);
  assert.equal(r.auto.length, 1);
});

test('une photo déjà importée dans le dossier n\'est pas importée deux fois', () => {
  const x = ph(1);
  const r = p([x], { locales: [{ relais: x.sha256 }] });
  assert.deepEqual(r.auto, []);
  assert.equal(r.ignores.dejaImportees, 1);
});

test('seules les photos reçues à 7 jours près de la création du dossier sont retenues', () => {
  const dedans = ph(1, { recu: CREE + 6 * J });
  const avant = ph(2, { recu: CREE - 8 * J, slot: 'ar' });
  const apres = ph(3, { recu: CREE + 8 * J, slot: 'avg' });
  const r = p([dedans, avant, apres]);
  assert.deepEqual(r.auto.map((a) => a.sha256), [dedans.sha256]);
  assert.equal(r.ignores.horsFenetre, 2);
});

test('pour un dossier sorti, les photos postérieures à la sortie sont écartées (véhicule revenu)', () => {
  const avant = ph(1, { recu: CREE + 2 * J });
  const apres = ph(2, { recu: CREE + 4 * J, slot: 'ar' });
  const r = p([avant, apres], { sortieAt: CREE + 3 * J });
  assert.deepEqual(r.auto.map((a) => a.sha256), [avant.sha256]);
});

test('plusieurs photos pour la même vue : seule la dernière reçue est importée', () => {
  const vieille = ph(1, { recu: CREE + 1000 });
  const recente = ph(2, { recu: CREE + 9000 });
  const r = p([vieille, recente]);
  assert.deepEqual(r.auto.map((a) => a.sha256), [recente.sha256]);
  assert.equal(r.ignores.remplacees, 1);
});

test('entrée et sortie sont des phases distinctes pour une même vue', () => {
  const r = p([ph(1), ph(2, { phase: 'sortie' })]);
  assert.deepEqual(r.auto.map((a) => a.item.phase).sort(), ['entree', 'sortie']);
});

test('toutes les photos NexPTG sont importées, avec leur légende', () => {
  const r = p([ph(1, { phase: 'mesures', slot: null, label: 'capot repeint' }), ph(2, { phase: 'mesures', slot: null, recu: CREE + 7000000 })]);
  assert.equal(r.auto.length, 2);
  assert.equal(r.auto[0].item.phase, 'mesures');
  assert.equal(r.auto[0].item.label, 'capot repeint');
  assert.equal(r.auto[1].item.label, 'Photo NexPTG');
  assert.ok(r.auto.every((a) => a.item.slot === null || a.item.slot === undefined));
});

test('les photos complémentaires sont proposées au choix, jamais importées toutes seules', () => {
  const c = ph(1, { phase: 'compl', slot: null, label: 'impact porte' });
  const r = p([c, ph(2)]);
  assert.deepEqual(r.complements.map((x) => x.sha256), [c.sha256]);
  assert.equal(r.auto.length, 1);
});

test('une vue inconnue de l\'application n\'est pas importée', () => {
  const r = p([ph(1, { slot: 'zzz' })]);
  assert.deepEqual(r.auto, []);
  assert.equal(r.ignores.inconnues, 1);
});

test('les photos à importer sont triées dans l\'ordre de l\'application', () => {
  const r = p([ph(1, { slot: 'ar' }), ph(2, { slot: 'avg' }), ph(3, { slot: 'av' })]);
  assert.deepEqual(r.auto.map((a) => a.item.slot), ['avg', 'av', 'ar']);
});
