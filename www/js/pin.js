import { $, S, VV, api, esc, flush, fmtPlate, hist, save, snapOf, toast } from './core.js';
import { renderSheet } from './sheet.js';

var avant = null;
export function modalShow(html) {
  var m = $('#modal');
  if (m.hidden) avant = document.activeElement;
  m.innerHTML = '<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mtitle" tabindex="-1">' + html + '</div>';
  var h = m.querySelector('h2'); if (h) h.id = 'mtitle';
  m.hidden = false; m.firstChild.focus();
}
export function modalHide() {
  var m = $('#modal'); m.hidden = true; m.innerHTML = ''; m.onclick = null;
  if (avant && avant.focus) avant.focus();
  avant = null;
}
var KEYLAB = { '⌫': 'Effacer', 'OK': 'Valider le code' };
function pinEntry(title, sub, o) {
  o = o || {};
  return new Promise(function (res) {
    var val = '';
    function paint() { var h = ''; for (var i = 0; i < Math.max(4, val.length); i++)h += '<i class="' + (i < val.length ? 'on' : '') + '"></i>'; var e = $('#pdots'); if (e) e.innerHTML = h; var st = $('#pstat'); if (st) st.textContent = val.length + ' chiffre' + (val.length > 1 ? 's' : '') + ' saisi' + (val.length > 1 ? 's' : '') }
    modalShow('<h2>' + esc(title) + '</h2>' + (sub ? '<p class="hint">' + esc(sub) + '</p>' : '') + '<div class="pinbox" id="pdots" aria-hidden="true"></div><span class="sr" id="pstat" role="status"></span><div class="perr" id="perr" role="alert">' + esc(o.msg || '') + '</div><div class="keypad">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map(function (k) { return '<button type="button" data-pin="' + k + '"' + (KEYLAB[k] ? ' aria-label="' + KEYLAB[k] + '"' : '') + '>' + k + '</button>' }).join('') + '</div>' + (o.cancel === false ? '' : '<div class="seg" style="justify-content:center"><button class="btn" data-pin="cancel">Annuler</button></div>'));
    paint();
    function done(r) { document.removeEventListener('keydown', kd, true); $('#modal').onclick = null; res(r) }
    function press(k) {
      if (k === 'cancel') { done(null); return }
      if (k === '⌫' || k === 'Backspace') { val = val.slice(0, -1); paint(); return }
      if (k === 'OK' || k === 'Enter') { if (val.length < 4) { $('#perr').textContent = '4 chiffres minimum'; return } done(val); return }
      if (/^\d$/.test(k) && val.length < 8) { val += k; paint() }
    }
    function kd(e) {
      if (e.key === 'Escape' && o.cancel !== false) { e.preventDefault(); done(null); return }
      if (/^\d$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); press(e.key) }
    }
    document.addEventListener('keydown', kd, true);
    $('#modal').onclick = function (e) { var b = e.target.closest('[data-pin]'); if (b) press(b.dataset.pin) };
  });
}
export async function askPin(title, sub) {
  var msg = '';
  for (; ;) {
    var p = await pinEntry(title, sub, { msg: msg });
    if (p === null) { modalHide(); return null }
    var r = await api.pinVerify(p);
    if (r.ok) { modalHide(); return p }
    if (r.none) { modalHide(); toast('Aucun code PIN défini'); return null }
    msg = r.wait ? 'Trop d’essais : patienter ' + r.wait + ' s' : 'Code incorrect' + (r.left != null ? ' (' + r.left + ' essai' + (r.left > 1 ? 's' : '') + ' restant' + (r.left > 1 ? 's' : '') + ')' : '');
  }
}
export async function newPin(first) {
  var msg = '';
  for (; ;) {
    var a = await pinEntry(first ? 'Créer le code PIN propriétaire' : 'Nouveau code PIN', first ? 'Ce code sera le code PIN administrateur de l’application (le code propriétaire). Il protège les corrections, le retrait d’éléments et les réglages. 4 à 8 chiffres. À ne donner à personne d’autre.' : '4 à 8 chiffres', { cancel: !first, msg: msg });
    if (a === null) { modalHide(); return null }
    var b = await pinEntry('Confirmer le code PIN', 'Saisir le même code une seconde fois', { cancel: !first });
    if (b === null) { modalHide(); return null }
    if (a === b) { modalHide(); return a }
    msg = 'Les deux codes sont différents, recommencer';
  }
}
var SETPIN = null;
export async function openSettings() {
  var pin = await askPin('Réglages', 'Code PIN propriétaire'); if (!pin) return;
  SETPIN = pin; drawSettings();
}
async function drawSettings() {
  var s = await api.settings();
  modalShow('<h2>Réglages</h2><p class="hint">Dossier des données de ce poste :</p><div class="path">' + esc(s.dataDir) + '</div><p class="hint">Dossier des archives PDF (lecture seule, avec registre d’intégrité) :</p><div class="path">' + esc(s.archiveDir) + '</div>' +
    '<p class="hint">Pour sauvegarder sur Google Drive : choisir ici un sous-dossier du dossier « Google Drive » créé par l’application Drive pour ordinateur, puis partager ce dossier en « Lecteur » avec l’équipe. Seul le propriétaire du Drive peut alors le modifier.</p>' +
    '<div class="seg"><button class="btn" data-act="openarch">Ouvrir les archives</button><button class="btn" data-act="chooseArch">Changer le dossier d’archives</button><button class="btn" data-act="changepin">Changer le code PIN</button><button class="btn" data-act="majcheck">Rechercher une mise à jour</button></div>' +
    '<p class="sv">Version ' + esc(s.version) + '</p><div class="seg"><button class="btn pri" data-act="closemodal">Fermer</button></div>');
}
export async function unlock() {
  var v = VV(); if (!v) return;
  var pin = await askPin('Code PIN propriétaire', 'Ouvrir le mode correction du dossier ' + fmtPlate(v.plaque)); if (!pin) return;
  await flush();
  S.unlocked = v.id; S.snap = snapOf(v); S.unlockTs = Date.now();
  save({ hist: hist(v, 'Mode correction ouvert avec le code PIN propriétaire', 'Propriétaire (code PIN)') });
  renderSheet(true);
}
export function relock() {
  var v = VV(); if (!v) return;
  flush().then(function () {
    save({ hist: hist(v, 'Mode correction terminé', 'Propriétaire (code PIN)') });
    S.unlocked = null; S.snap = null; renderSheet(true); toast('Dossier verrouillé');
  });
}

export function closeSettings() { SETPIN = null; modalHide() }
export function chooseArchive() {
  api.chooseArchive(SETPIN).then(function (r) { if (r && r.ok) drawSettings(); else toast('Opération refusée') });
}
export async function changePin() {
  var old = await askPin('Code PIN actuel', 'Pour le modifier'); if (!old) return;
  var nw = await newPin(false); if (!nw) return;
  var r = await api.pinChange(old, nw);
  toast(r && r.ok ? 'Code PIN modifié' : (r && r.error) || 'Modification refusée');
}
