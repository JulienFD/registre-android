import { S, VV, api, esc, fmtDT, hist, save, toast } from './core.js';
import { SLOTS } from './constants.js';
import { getCd } from './compl.js';
import { canShoot, commitPhoto } from './photos.js';
import { modalHide, modalShow } from './pin.js';
import { renderSheet } from './sheet.js';

/* Photos prises avec le téléphone (PWA) : récupération par la tablette. Les règles de rattachement sont dans photos-tel.js (racine). */
var T = window.PhotosTel, R = window.Relais;
var tel = { cand: [], urls: {}, octets: {} };

async function client() {
  var conf = await api.relaisConf();
  if (!conf || !conf.url || !conf.compte || !conf.motDePasse) return null;
  try { return R.creerClient(conf) } catch (e) { return null }
}

function contexte(v, liste) {
  return T.plan({ photos: liste, dossierId: v.id, creeLe: v.createdAt || 0, sortieAt: v.sortieAt || 0, locales: S.photos, slots: SLOTS });
}

/* Importe d'un coup les vues du véhicule et les photos NexPTG ; les compléments se choisissent à part. */
export async function telRecuperer() {
  var v = VV(); if (!v || !S.cur) return;
  var c = await client();
  if (!c) { toast('Relais non configuré : Réglages, section Relais NexPTG'); return }
  toast('Recherche des photos du téléphone…');
  var liste;
  try { liste = await c.photos(v.plaque) } catch (e) { toast(R.messageErreur(e)); return }
  var p = contexte(v, liste);
  var permis = {}, ok = 0, bloquees = 0, prises = 0, echecs = 0;
  var peut = function (ph) { if (!(ph in permis)) permis[ph] = canShoot(ph); return permis[ph] };
  for (var i = 0; i < p.auto.length; i++) {
    var a = p.auto[i];
    if (!peut(a.item.phase)) { bloquees++; continue }
    try {
      var rep = await c.reclamerPhoto(a.sha256, v.plaque, v.id);
      if (!rep.ok) { prises++; continue }
      var octets = await c.photo(v.plaque, a.sha256);
      var r = octets ? await commitPhoto(null, { phase: a.item.phase, slot: a.item.slot || ('t' + a.sha256.slice(0, 10)), label: a.item.label },
        { octets: octets, par: a.par, ts: a.prise || a.recu, relais: a.sha256, imported: true, name: 'téléphone' }) : null;
      if (r) ok++;
      else { echecs++; try { await c.libererPhoto(a.sha256, v.id) } catch (e) { /* libérée à la prochaine tentative */ } }
    } catch (e) { echecs++; toast(R.messageErreur(e)); break }
  }
  if (ok) save({ hist: hist(v, ok + ' photo' + (ok > 1 ? 's' : '') + ' récupérée' + (ok > 1 ? 's' : '') + ' depuis le téléphone') });
  renderSheet(true);
  var msg = ok ? ok + ' photo' + (ok > 1 ? 's' : '') + ' récupérée' + (ok > 1 ? 's' : '') + ' du téléphone' : 'Aucune nouvelle photo du téléphone pour ce véhicule';
  if (p.complements.length) msg += ' · ' + p.complements.length + ' complémentaire' + (p.complements.length > 1 ? 's' : '') + ' à choisir dans Compléments';
  if (bloquees) msg += ' · ' + bloquees + ' non importée' + (bloquees > 1 ? 's' : '') + ' (dossier verrouillé)';
  if (prises) msg += ' · ' + prises + ' déjà utilisée' + (prises > 1 ? 's' : '') + ' ailleurs';
  if (echecs) msg += ' · ' + echecs + ' en échec, réessayer';
  toast(msg);
}

/* Compléments : l'utilisateur choisit parmi les photos disponibles pour la plaque, pas encore utilisées. */
export async function telChoisir() {
  var v = VV(); if (!v || !S.cur) return;
  var c = await client();
  if (!c) { toast('Relais non configuré : Réglages, section Relais NexPTG'); return }
  modalShow('<h2>Photos du téléphone</h2><p class="hint">Chargement…</p><div class="mrow2"><button class="btn" data-act="closemodal">Annuler</button></div>');
  try {
    var liste = await c.photos(v.plaque);
    tel.cand = contexte(v, liste).complements;
    for (var i = 0; i < tel.cand.length; i++) {
      var x = tel.cand[i];
      if (tel.octets[x.sha256]) continue;
      var o = await c.photo(v.plaque, x.sha256);
      if (!o) continue;
      tel.octets[x.sha256] = o;
      tel.urls[x.sha256] = URL.createObjectURL(new Blob([o], { type: 'image/jpeg' }));
    }
  } catch (e) { modalHide(); toast(R.messageErreur(e)); return }
  var dispo = tel.cand.filter(function (x) { return tel.octets[x.sha256] });
  if (!dispo.length) { modalHide(); toast('Aucune photo complémentaire disponible pour ce véhicule'); return }
  modalShow('<h2>Photos du téléphone</h2><p class="hint">Cocher les photos à ajouter à ce complément. Une photo ajoutée n’est plus proposée pour un autre dossier.</p>' +
    '<div class="tiles">' + dispo.map(function (x) {
      return '<label class="tile has tel"><input type="checkbox" data-sha="' + esc(x.sha256) + '"><img class="ph" alt="" src="' + esc(tel.urls[x.sha256]) + '">' +
        '<span class="lb">' + esc(x.label || 'Complément') + ' · ' + esc(fmtDT(x.recu)) + ' · ' + esc(x.par) + '</span></label>';
    }).join('') + '</div>' +
    '<div class="mrow2"><button class="btn" data-act="closemodal">Annuler</button><button class="btn pri" data-act="telAjouter">Ajouter au complément</button></div>');
}

export function telAjouter() {
  var d = getCd();
  document.querySelectorAll('#modal input[data-sha]:checked').forEach(function (cb) {
    var x = tel.cand.filter(function (c) { return c.sha256 === cb.dataset.sha })[0];
    if (!x || !tel.octets[x.sha256] || d.pics.some(function (p) { return p.relais === x.sha256 })) return;
    d.pics.push({ bytes: tel.octets[x.sha256], url: tel.urls[x.sha256], label: x.label || 'Complément', ts: x.prise || x.recu, imported: true, origName: 'téléphone', relais: x.sha256 });
  });
  modalHide();
  renderSheet(true);
}

/* Appelé à l'enregistrement du complément : les photos du téléphone sont réclamées à ce moment, jamais avant. */
export async function reclamerTel(pics, v) {
  if (!pics.some(function (p) { return p.relais })) return pics;
  var c = await client();
  if (!c) { toast('Relais injoignable : photos du téléphone non ajoutées'); return pics.filter(function (p) { return !p.relais }) }
  var gardees = [];
  for (var i = 0; i < pics.length; i++) {
    var p = pics[i];
    if (!p.relais) { gardees.push(p); continue }
    try {
      var r = await c.reclamerPhoto(p.relais, v.plaque, v.id);
      if (r.ok) gardees.push(p); else toast('Une photo du téléphone est déjà utilisée par un autre dossier : écartée');
    } catch (e) { toast(R.messageErreur(e)) }
  }
  return gardees;
}
