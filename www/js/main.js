import { act } from './actions.js';
import { renderMain } from './board.js';
import { getCd } from './compl.js';
import { initCopie } from './copie.js';
import { $, S, T, VV, api, flush, fmtDT, cleanField, formatPlate, pend, sanitize, sortieDefaut, todayISO, toast } from './core.js';
import { PLAQUE } from './constants.js';
import { autoCreate } from './dossier.js';
import { verifierMiseAJour } from './maj.js';
import { renommerPhoto } from './photos.js';
import { newPin } from './pin.js';
import { clearInvalid, refreshChrome, refreshPhotos, renderSheet, updateLightbox } from './sheet.js';

document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]');
  if (!b) { return }
  if (b.dataset.act === 'view' && (b.dataset.slot || b.dataset.pid)) {
    S.lb = b.dataset.pid || (b.dataset.phase + '_' + b.dataset.slot); updateLightbox(); return
  }
  act(b.dataset.act, b);
});
/* Les points des schémas NexPTG sont des éléments SVG : Entrée et Espace doivent les activer comme un bouton. */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var b = e.target.closest && e.target.closest('g[role="button"][data-act]');
  if (!b) return;
  e.preventDefault();
  act(b.dataset.act, b);
});
/* Brouillon : créé dès qu'on quitte un champ, ou quand l'app passe en arrière-plan. */
document.addEventListener('change', function (e) { if (S.draft && e.target && e.target.dataset && e.target.dataset.f) autoCreate() });
document.addEventListener('change', function (e) { var t = e.target; if (t.dataset && t.dataset.filter) { S.f[t.dataset.filter] = t.value; renderMain() } });
document.addEventListener('change', function (e) {
  var t = e.target; if (!t.dataset || !t.dataset.pl) return;
  renommerPhoto(t.dataset.pl, t.value).then(function () { var p = S.photos.filter(function (x) { return x.id === t.dataset.pl })[0]; if (p) t.value = p.label; if (!$('#lightbox').hidden) refreshPhotos() });
});
document.addEventListener('visibilitychange', function () { if (document.hidden) { autoCreate(); flush() } });
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'q') { S.q = t.value; renderMain(); return }
  if (t.id === 'cd-by') { getCd().by = t.value; return }
  if (t.id === 'cd-text') { getCd().text = t.value; return }
  if (t.id === 'cd-kind') { getCd().kind = t.value; return }
  if (t.dataset && t.dataset.f) {
    var v = VV(); if (!v) return; var f = t.dataset.f, val = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'plaqueType') {
      val = val === 'etr' ? 'etr' : 'fr'; v.plaqueType = val;
      var pe = $('#f-plaque'), np = formatPlate(v.plaque || '', val); v.plaque = np;
      if (pe) { pe.value = np; pe.placeholder = PLAQUE[val].ph; pe.maxLength = PLAQUE[val].max }
      if (S.cur) pend.plaque = np; clearInvalid('plaque');
    } else if (typeof val === 'string') { var clean = cleanField(v, f, val); if (clean !== val) { val = clean; t.value = clean } }
    v[f] = val; clearInvalid(f);
    if (f === 'dateLimite') { var sd = sortieDefaut(v, todayISO()); if (sd) { v.sortiePrevue = sd; if (S.cur) pend.sortiePrevue = sd; var se = $('#f-sortiePrevue'); if (se) se.value = sd; clearInvalid('sortiePrevue') } }
    if (S.cur) { pend[f] = val; clearTimeout(T.tmr); T.tmr = setTimeout(function () { flush().then(refreshChrome) }, 500) }
    if (t.type === 'checkbox') { if (S.cur) { flush() } renderSheet(true) }
    else if (S.cur) setTimeout(refreshChrome, 0);
    return;
  }
  if (t.dataset && t.dataset.mesk) { t.value = sanitize(t.value, { digits: true, max: 4 }); var v4 = VV(); v4.mes = Object.assign({}, v4.mes || {}); v4.mes[t.dataset.mesk] = t.value; pend.mes = Object.assign({}, pend.mes || {}); pend.mes[t.dataset.mesk] = t.value; clearTimeout(T.tmr); T.tmr = setTimeout(flush, 500); return }
});

/* ---------- démarrage ---------- */
initCopie();
renderMain();
(async function () {
  try {
    var all = await api.loadAll();
    S.list = Object.keys(all.vehicules).map(function (id) { var o = all.vehicules[id]; o.id = id; return o });
    Object.keys(all.photos).forEach(function (id) { S.pm[id] = Object.keys(all.photos[id]).map(function (pid) { var o = all.photos[id][pid]; o.id = pid; o.vid = id; return o }) });
    Object.keys(all.compl).forEach(function (id) { S.cm[id] = Object.keys(all.compl[id]).map(function (cid) { var o = all.compl[id][cid]; o.id = cid; return o }) });
    Object.keys(all.nexptg || {}).forEach(function (id) { S.nm[id] = Object.keys(all.nexptg[id]).map(function (sha) { return all.nexptg[id][sha] }) });
  } catch (e) { S.dberr = 'Lecture des dossiers impossible : ' + (e && e.message || 'erreur') }
  S.loaded = true; renderMain();
  setInterval(function () { var c = $('#clk'); if (c) c.textContent = fmtDT(Date.now()) }, 15000);
  try { var ps = await api.pinStatus(); if (!ps.set) { var p = await newPin(true); var r = await api.pinSet(p); toast(r && r.ok ? 'Code PIN enregistré' : (r && r.error) || 'Code PIN non enregistré') } } catch (e) { }
  verifierMiseAJour(false);
})();
