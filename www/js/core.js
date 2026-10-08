import { CHECK, FL } from './constants.js';

export var $ = function (s, r) { return (r || document).querySelector(s) };
export var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) };
export var api = window.api;
export var S = { list: [], view: 'board', q: '', cur: null, draft: null, tab: 'infos', photos: [], pm: {}, cm: {}, busy: {}, dmg: 'rayure', lb: null, loaded: false, dberr: '', unlocked: null, snap: null, unlockTs: 0, cdraft: null, invalid: [] };
export var queues = {};
export var pend = {};
export var T = { tmr: null };
var U = window.Utils;
export var normPlate = U.normPlate;
export var fmtPlate = U.fmtPlate;
export var fmtD = U.fmtD;
export var due = U.due;
export var limite = U.limite;
export var TAMPON = U.TAMPON;
export var missingForCreate = U.missingForCreate;
export var missingForEntry = U.missingForEntry;
export var entryErrors = U.entryErrors;
export var RULES = U.RULES;
export var formatPlate = U.formatPlate;
export var plateValid = U.plateValid;
export var sanitize = U.sanitize;
export function plateKindOf(v) { return v.plaqueType || U.plateKind(v.plaque) }
export function cleanField(v, f, val) { return f === 'plaque' ? U.formatPlate(val, plateKindOf(v)) : U.RULES[f] ? U.sanitize(val, U.RULES[f]) : val }
export var sortieDefaut = U.sortieDefaut;
export function V(id) { for (var i = 0; i < S.list.length; i++)if (S.list[i].id === id) return S.list[i]; return null }
export function VV() { return S.cur ? V(S.cur) : S.draft }
export function plateHtml(p, lg) { return '<span class="plate' + (lg ? ' lg' : '') + '"><i>F</i><b>' + esc(fmtPlate(p)) + '</b></span>' }
export function fmtDT(ts) { return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
export function todayISO() { return new Date().toLocaleDateString('sv-SE') }
export function limTxt(v) { return v.dateLimite === TAMPON ? 'voiture tampon, aucune date promise' : new Date(v.dateLimite + 'T12:00').toLocaleDateString('fr-FR') }
export function srcOf(p) { if (p.url) return p.url; if (window.api && window.api.photoUrl) return window.api.photoUrl(p); return '/data/vehicules/' + encodeURIComponent(p.vid) + '/photos/' + encodeURIComponent(p.file || p.id) + (p.kind === 'pdf' ? '.pdf' : '.jpg') }
var toastT = null;
export function toast(m) { var t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true }, 3600) }
export function setSave(s) {
  var el = $('#sv'); if (!el) return;
  if (s === 'saving') { el.textContent = 'Enregistrement…'; el.className = 'sv' }
  else if (s === 'ok') { el.textContent = 'Enregistré ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); el.className = 'sv' }
  else { el.textContent = 'Échec de l’enregistrement, vérifier la connexion'; el.className = 'sv err' }
}
export function snapOf(v) { return JSON.parse(JSON.stringify(v)) }
function shorten(x) { x = x == null ? '' : String(x); return x.length > 40 ? x.slice(0, 40) + '…' : x }
function diffText(a, b) {
  var out = [];
  Object.keys(FL).forEach(function (k) { var x = a[k] == null ? '' : a[k], y = b[k] == null ? '' : b[k]; if (String(x) !== String(y)) out.push(FL[k] + ' : « ' + shorten(x) + ' » → « ' + shorten(y) + ' »') });
  var ca = a.chk || {}, cb = b.chk || {};
  CHECK.forEach(function (c) { var x = ca[c.k] || {}, y = cb[c.k] || {}; if ((x.s || '') !== (y.s || '') || (x.n || '') !== (y.n || '')) out.push('Contrôle « ' + c.l.split(':')[0] + ' » : ' + (x.s || 'vide') + ' → ' + (y.s || 'vide') + (y.n ? ' (' + shorten(y.n) + ')' : '')) });
  if (JSON.stringify(a.marks || []) !== JSON.stringify(b.marks || [])) out.push('Schéma des dommages modifié (' + (a.marks || []).length + ' → ' + (b.marks || []).length + ' marques)');
  ['sigRecep', 'sigClient', 'sigSortie'].forEach(function (k) { if (JSON.stringify(a[k] || null) !== JSON.stringify(b[k] || null)) out.push('Signature modifiée (' + k + ')') });
  if (JSON.stringify(a.mes || {}) !== JSON.stringify(b.mes || {})) out.push('Épaisseurs modifiées');
  return out.join(' ; ');
}
export function save(local, wire) {
  var id = S.cur; if (!id) return Promise.resolve();
  var v = V(id); if (!v) return Promise.resolve();
  Object.assign(v, local || {});
  var w = wire || local; if (!w || !Object.keys(w).length) return Promise.resolve();
  if (S.unlocked === id && S.snap) {
    var d = diffText(S.snap, v), h = (v.hist || []).filter(function (x) { return x.corr !== S.unlockTs });
    if (d) h.push({ ts: Date.now(), by: 'Propriétaire (code PIN)', a: 'Corrections : ' + d, corr: S.unlockTs });
    v.hist = h;
  }
  setSave('saving');
  queues[id] = (queues[id] || Promise.resolve()).then(function () { return api.write('vehicules/' + id, snapOf(V(id))) }).then(function () { setSave('ok') }, function (e) { setSave('err', e) });
  return queues[id];
}
export function flush() { clearTimeout(T.tmr); var p = Object.assign({}, pend); Object.keys(pend).forEach(function (k) { delete pend[k] }); if (Object.keys(p).length) return save({}, p); return Promise.resolve() }
export function hist(v, a, by) { return (v.hist || []).concat([{ ts: Date.now(), by: by || v.recep || '', a: a }]) }
export function isLocked(v, area) {
  if (!S.cur || !v || S.unlocked === v.id) return false;
  if (area === 'entry') return !!v.statut && v.statut !== 'brouillon';
  if (area === 'exit') return v.statut === 'sorti';
  return false;
}
export function lastWho() { var l = ''; try { l = localStorage.getItem('rv-recep') || '' } catch (e) { } return l }
