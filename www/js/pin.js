import { $, S, VV, api, esc, flush, fmtPlate, hist, save, snapOf, toast } from './core.js';
import { renderSheet } from './sheet.js';

var avant = null;
export function modalShow(html, cls) {
  var m = $('#modal');
  if (m.hidden) avant = document.activeElement;
  m.innerHTML = '<div class="mbox' + (cls ? ' ' + cls : '') + '" role="dialog" aria-modal="true" aria-labelledby="mtitle" tabindex="-1">' + html + '</div>';
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
function ligne(act, titre, desc, cls) {
  return '<button class="btn setrow' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"><b>' + titre + '</b><span>' + desc + '</span></button>';
}
function section(titre, corps) { return '<section class="setsec"><h3>' + titre + '</h3>' + corps + '</section>' }
async function drawSettings() {
  var s = await api.settings(), rl = (await api.relaisConf()) || {};
  modalShow('<header class="sethead"><h2>Réglages</h2><button class="btn pri" data-act="closemodal">Fermer</button></header>' +
    '<div class="setgrid">' +
    section('Données et changement de tablette',
      '<p class="hint">Pour changer de tablette sans rien perdre : exporter les données (dossiers, photos, archives) dans un fichier, l’enregistrer sur Drive ou une clé USB, puis l’importer sur la nouvelle tablette.</p>' +
      ligne('exportZip', 'Exporter en .zip', 'Photos et PDF consultables depuis un ordinateur ; réimportable dans l’application') +
      ligne('exportRegistre', 'Exporter en .registre', 'Fichier unique réservé à l’application') +
      ligne('importData', 'Importer les données', 'Restaure un fichier .zip ou .registre. Les dossiers de même identifiant sont remplacés') +
      '<p class="hint">Le code PIN et le dossier de copie ne sont pas transférés : les recréer sur la nouvelle tablette.</p>') +
    section('Copie automatique des PDF',
      '<p class="hint">Un sous-dossier par fiche : PDF d’entrée et compléments figés, dossier complet mis à jour après chaque modification.</p>' +
      '<div class="path">' + esc(s.copie ? s.copie.nom : 'Aucun dossier choisi') + '</div>' +
      ligne('chooseCopie', s.copie ? 'Changer le dossier de copie' : 'Choisir le dossier de copie', 'Par exemple un dossier Google Drive') +
      (s.copie ? ligne('removeCopie', 'Arrêter la copie', 'Les PDF ne seront plus copiés automatiquement', 'bad') : '')) +
    section('Archives',
      '<p class="hint">' + esc(s.archiveDir) + '</p>' +
      ligne('openarch', 'Ouvrir les archives', 'Registre d’intégrité des PDF archivés') +
      ligne('chooseArch', 'Changer le dossier d’archives', 'Protégé par le code PIN')) +
    section('Relais NexPTG',
      '<p class="hint">Reçoit les mesures de NexPTG. L’adresse doit commencer par https://. Le mot de passe reste sur cette tablette : il n’est jamais inclus dans une sauvegarde.</p>' +
      '<label class="fld"><span>Adresse du relais</span><input id="rl-url" type="url" inputmode="url" autocomplete="off" value="' + esc(rl.url || '') + '" placeholder="https://…"></label>' +
      '<label class="fld"><span>Compte de la tablette</span><input id="rl-compte" type="text" autocomplete="off" value="' + esc(rl.compte || '') + '"></label>' +
      '<label class="fld"><span>Mot de passe</span><input id="rl-mdp" type="password" autocomplete="off" placeholder="' + (rl.motDePasse ? 'Laisser vide pour conserver l’actuel' : '') + '"></label>' +
      ligne('relaisSave', 'Enregistrer', 'Protégé par le code PIN') +
      ligne('relaisTest', 'Tester la connexion', 'Interroge le relais avec les valeurs ci-dessus, sans les enregistrer') +
      (rl.url ? ligne('relaisClear', 'Supprimer la configuration', 'Les mesures ne seront plus reçues', 'bad') : '')) +
    section('Sécurité',
      '<p class="hint">Le code PIN protège les corrections, le retrait d’éléments et ces réglages.</p>' +
      ligne('changepin', 'Changer le code PIN', 'Demande l’ancien code puis le nouveau')) +
    section('Application',
      '<p class="hint">Données stockées : ' + esc(s.dataDir) + '</p>' +
      ligne('majcheck', 'Rechercher une mise à jour', 'Version installée : ' + esc(s.version))) +
    '</div>', 'full');
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
/* Valeurs du formulaire ; un mot de passe laissé vide conserve celui déjà enregistré. */
async function confRelaisSaisie() {
  var val = function (id) { var e = $('#' + id); return e ? e.value.trim() : '' };
  var ancien = (await api.relaisConf()) || {};
  return { url: val('rl-url'), compte: val('rl-compte'), motDePasse: ($('#rl-mdp') ? $('#rl-mdp').value : '') || ancien.motDePasse || '' };
}
export async function saveRelais() {
  var conf = await confRelaisSaisie();
  try { window.Relais.creerClient(conf) } catch (e) { toast(window.Relais.messageErreur(e)); return }
  var r = await api.relaisSet(SETPIN, conf);
  if (r && r.ok) { toast('Relais enregistré'); drawSettings() } else toast('Opération refusée');
}
export async function testRelais() {
  var client;
  try { client = window.Relais.creerClient(await confRelaisSaisie()) } catch (e) { toast(window.Relais.messageErreur(e)); return }
  toast('Test de la connexion…');
  try {
    var t = await client.techniciens();
    toast('Connexion réussie : ' + t.length + ' technicien' + (t.length > 1 ? 's' : '') + (t.length ? ' (' + t.join(', ') + ')' : ''));
  } catch (e) { toast(window.Relais.messageErreur(e)) }
}
export function clearRelais() {
  api.relaisSet(SETPIN, null).then(function (r) { if (r && r.ok) drawSettings(); else toast('Opération refusée') });
}
export function chooseArchive() {
  api.chooseArchive(SETPIN).then(function (r) { if (r && r.ok) drawSettings(); else toast('Opération refusée') });
}
export function chooseCopie() {
  api.chooseCopie(SETPIN).then(function (r) { if (r && r.ok) drawSettings(); else if (!r || !r.annule) toast('Opération refusée') });
}
export function removeCopie() {
  api.removeCopie(SETPIN).then(function (r) { if (r && r.ok) drawSettings(); else toast('Opération refusée') });
}
export async function changePin() {
  var old = await askPin('Code PIN actuel', 'Pour le modifier'); if (!old) return;
  var nw = await newPin(false); if (!nw) return;
  var r = await api.pinChange(old, nw);
  toast(r && r.ok ? 'Code PIN modifié' : (r && r.error) || 'Modification refusée');
}
export function exportData(format) {
  toast('Préparation de la sauvegarde…');
  api.exportData(format).then(function (r) { toast('Sauvegarde prête (' + r.count + ' fichiers)') }, function (e) { if (!/cancel/i.test(e && e.message)) toast('Export impossible : ' + (e && e.message || 'erreur')) });
}
export function importData() {
  api.importData().then(function (r) {
    if (r.annule) return;
    if (!r.ok) { toast(r.error || 'Import impossible'); return }
    toast(r.count + ' fichiers importés, rechargement…');
    setTimeout(function () { location.reload() }, 1500);
  }, function (e) { toast('Import impossible : ' + (e && e.message || 'erreur')) });
}
