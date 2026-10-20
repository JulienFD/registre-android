import { renderMain } from './board.js';
import { camClose, camImport, camOpen, camShot, camSkip, camSwitch } from './camera.js';
import { cdSave, getCd } from './compl.js';
import { COLS } from './constants.js';
import { $, S, TAMPON, VV, entryErrors, api, flush, hist, save, srcOf, toast } from './core.js';
import { autoCreate, closeSheet, createDossier, lockConfirm, newEntry, openDossier, undoSig, validateEntry } from './dossier.js';
import { installerMiseAJour, verifierMiseAJour } from './maj.js';
import { telAjouter, telBasculer, telChoisir, telMode, telRecuperer } from './photos-tel.js';
import { nxChoisir, nxCommencer, nxMode, nxPoint, nxRecharger, nxTermine, nxTermineOk, nxVerifier } from './nexptg-tab.js';
import { envoiAuto, envoiCopier, envoiMail, envoiOuvrir, envoiPartage, envoiPdf } from './envoi-pdf.js';
import { signalerSortie, sortieAnnuler } from './sortie.js';
import { makePdf } from './pdf.js';
import { canShoot, commitPhoto, complSink, delPhoto, doImport, handlePdf, startQueue } from './photos.js';
import { changePin, chooseArchive, chooseCopie, clearRelais, closeSettings, exportData, importData, modalHide, openSettings, relock, removeCopie, saveRelais, testRelais, unlock } from './pin.js';
import { clearInvalid, exitReady, readiness, renderSheet, showMissing } from './sheet.js';

export function act(a, b) {
  var d = b.dataset;
  if (a === 'view') { S.view = d.v; $('#q').value = ''; renderMain(); return }
  if (a === 'filter') { S.f[d.k] = d.k === 'retard' ? !S.f.retard : (S.f[d.k] === d.v ? '' : d.v); renderMain(); return }
  if (a === 'filter-reset') { S.f = { type: '', resp: '', retard: false }; renderMain(); return }
  if (a === 'new') { newEntry(); return }
  if (a === 'open') { openDossier(d.id); return }
  if (a === 'close') { closeSheet(); return }
  if (a === 'tab') { flush(); S.tab = d.v; renderSheet(); return }
  if (a === 'type') { var v = VV(); v.type = d.v; clearInvalid('type'); if (S.cur) save({ type: d.v }); else autoCreate(); renderSheet(true); return }
  if (a === 'create') { createDossier(); return }
  if (a === 'tampon') { var vt = VV(); vt.dateLimite = TAMPON; if (S.cur) save({ dateLimite: TAMPON }); renderSheet(true); toast('Voiture tampon : 01/01/2100'); return }
  if (a === 'status') { var v2 = VV(); save({ statut: d.v, hist: hist(v2, 'Statut : ' + (COLS.filter(function (c) { return c[0] === d.v })[0] || [0, d.v])[1]) }); renderSheet(true); return }
  if (a === 'validate') {
    var v3 = VV(), miss = entryErrors(v3);
    if (miss.length) { showMissing(miss); toast(miss.length + (miss.length > 1 ? ' champs à remplir ou corriger' : ' champ à remplir ou corriger')); return }
    var todo = readiness(v3).filter(function (x) { return !x.ok })[0];
    if (todo) { S.tab = todo.tab; renderSheet(); toast('À compléter : ' + todo.t); return }
    lockConfirm(null); return
  }
  if (a === 'lockok') { modalHide(); validateEntry(); return }
  if (a === 'lockcancel') { modalHide(); if (d.f) undoSig(d.f); return }
  if (a === 'next') { startQueue(d.phase, null); return }
  if (a === 'shoot') { startQueue(d.phase, d.slot); return }
  if (a === 'retake') { $('#lightbox').hidden = true; S.lb = null; startQueue(d.phase, d.slot); return }
  if (a === 'extra') {
    if (!canShoot(d.phase)) return; var inp = $('#xl-' + d.phase), lab = (inp && inp.value.trim()) || 'Détail'; if (inp) inp.value = '';
    camOpen({ free: true, phase: d.phase, title: d.phase === 'mesures' ? 'Photos de mesure' : 'Photos de détail', defLabel: lab, caption: lab === 'Détail' ? '' : lab, sink: commitPhoto }); return
  }
  if (a === 'extragal') {
    if (!canShoot(d.phase)) return; var inp2 = $('#xl-' + d.phase), lab2 = inp2 && inp2.value.trim(); if (inp2) inp2.value = '';
    doImport(function (f, i) { return { phase: d.phase, slot: 'x' + Date.now() + '_' + i, label: lab2 || f.name.replace(/\.[^.]+$/, '') || 'Détail' } }, commitPhoto).then(function (n) { if (n) toast(n + ' image(s) importée(s)') }); return
  }
  if (a === 'lbclose') { S.lb = null; $('#lightbox').hidden = true; return }
  if (a === 'delphoto') { delPhoto(d.pid); return }
  if (a === 'clearpad') { var cv = $('canvas.pad[data-pad="' + d.f + '"]'); if (cv) { var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); cv.dataset.dirty = '' } return }
  if (a === 'resig') { var o = {}; o[d.f] = null; save(o); renderSheet(true); return }
  if (a === 'savesig') {
    var cv2 = $('canvas.pad[data-pad="' + d.f + '"]'); if (!cv2 || !cv2.dataset.dirty) { toast('Signer d’abord dans le cadre'); return }
    var nm = ($('#sn-' + d.f) || {}).value || ''; var img = cv2.toDataURL('image/png');
    var sg = { img: img, nom: nm, ts: Date.now() }, o2 = {}; o2[d.f] = sg; save(o2); renderSheet(true); toast('Signature enregistrée');
    var vs = VV(); if (S.cur && vs.statut === 'brouillon' && readiness(vs).every(function (x) { return x.ok })) lockConfirm(d.f); return
  }
  if (a === 'validateexit') {
    var v7 = VV(); if (!exitReady(v7).every(function (x) { return x.ok })) { toast('Il reste des points à compléter'); return }
    S.unlocked = null; S.snap = null;
    save({ statut: 'sorti', sortieAt: Date.now(), hist: hist(v7, 'Sortie validée : véhicule rendu par ' + (v7.remisPar || '—') + ', récupéré par ' + (v7.remisA || '—'), v7.remisPar || undefined) }).then(function () { toast('Sortie validée'); signalerSortie(v7.plaque); return makePdf('full', true) }).then(function (r) { return envoiAuto('full', r) }); renderSheet(); return
  }
  if (a === 'pdf') { makePdf(d.mode, false); return }
  if (a === 'envoiOuvrir') { envoiOuvrir(); return }
  if (a === 'envoiPdf') { envoiPdf(d.mode); return }
  if (a === 'envoiMail') { envoiMail(); return }
  if (a === 'envoiPartage') { envoiPartage(); return }
  if (a === 'envoiCopier') { envoiCopier(); return }
  if (a === 'addpdf') { handlePdf(); return }
  if (a === 'openpdf') { var pp = S.photos.filter(function (x) { return x.id === d.pid })[0]; if (pp) { if (api.openPdf) api.openPdf(pp); else window.open(srcOf(pp)) } return }
  if (a === 'unlock') { unlock(); return }
  if (a === 'cancelexit') { sortieAnnuler(); return }
  if (a === 'relock') { relock(); return }
  if (a === 'cdshoot') { getCd(); camOpen({ free: true, phase: 'compl', title: 'Photos du complément', defLabel: 'Complément', sink: complSink }); return }
  if (a === 'cdimport') { getCd(); doImport(function (f, i) { return { phase: 'compl', slot: 'x' + i, label: f.name.replace(/\.[^.]+$/, '') || 'Complément' } }, complSink).then(function (n) { if (n) { renderSheet(true); toast(n + ' image(s) ajoutée(s)') } }); return }
  if (a === 'cdclear') { if (S.cdraft) S.cdraft.pics = []; renderSheet(true); return }
  if (a === 'cdsave') { cdSave(); return }
  if (a === 'camshot') { camShot(); return }
  if (a === 'camskip') { camSkip(); return }
  if (a === 'camclose') { camClose(); return }
  if (a === 'camswitch') { camSwitch(); return }
  if (a === 'camimport') { camImport(); return }
  if (a === 'settings') { openSettings(); return }
  if (a === 'closemodal') { closeSettings(); return }
  if (a === 'openarch') { api.openArchive(); return }
  if (a === 'chooseArch') { chooseArchive(); return }
  if (a === 'chooseCopie') { chooseCopie(); return }
  if (a === 'removeCopie') { removeCopie(); return }
  if (a === 'photosMode') { telMode(d.phase, d.mode); return }
  if (a === 'telRecuperer') { telRecuperer(); return }
  if (a === 'telChoisir') { telChoisir(); return }
  if (a === 'telBasculer') { telBasculer(b); return }
  if (a === 'telAjouter') { telAjouter(); return }
  if (a === 'nxMode') { nxMode(d.mode); return }
  if (a === 'nxCommencer') { nxCommencer(); return }
  if (a === 'nxVerifier') { nxVerifier(); return }
  if (a === 'nxPoint') { nxPoint(d); return }
  if (a === 'nxRecharger') { nxRecharger(); return }
  if (a === 'nxChoisir') { nxChoisir(d.sha); return }
  if (a === 'nxTermine') { nxTermine(); return }
  if (a === 'nxTermineOk') { nxTermineOk(); return }
  if (a === 'relaisSave') { saveRelais(); return }
  if (a === 'relaisTest') { testRelais(); return }
  if (a === 'relaisClear') { clearRelais(); return }
  if (a === 'exportZip') { exportData('zip'); return }
  if (a === 'exportRegistre') { exportData('registre'); return }
  if (a === 'importData') { importData(); return }
  if (a === 'changepin') { changePin(); return }
  if (a === 'majcheck') { verifierMiseAJour(true); return }
  if (a === 'majinstall') { installerMiseAJour(d.url); return }
}

