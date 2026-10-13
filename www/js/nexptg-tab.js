import { $, S, VV, api, fmtPlate, hist, save, toast } from './core.js';
import { modalHide, modalShow } from './pin.js';
import { refreshChrome, renderSheet } from './sheet.js';

/* Onglet NexPTG : le rendu vient de nexptg-vue.js (pur) ; ici, le relais, l'enregistrement et les actions. */
var N = window.Nexptg, R = window.Relais, W = window.NexptgVue;
var INTERVALLE = 8000;
var E = { configure: true, tech: null, techErr: '', erreur: '', derniere: 0, candidats: [], occupe: false, timer: null, chargement: false };

function versions(v) { return S.nm[v.id] || [] }
function etat(v) { return N.etatNexptg(v, versions(v)) }

export function nexptgHtml(v) {
  return W.vue(etat(v), {
    plaque: fmtPlate(v.plaque), dossierId: v.id, relaisConfigure: E.configure, techniciens: E.tech, erreurTechniciens: E.techErr,
    erreur: E.erreur, derniereVerif: E.derniere, candidats: E.candidats, occupe: E.occupe,
  }, v);
}

/* Met à jour seulement la section NexPTG (pas de saut de page pendant la vérification automatique). */
function rendre() {
  var el = $('#pg-nx'), v = VV();
  if (el && v && S.tab === 'mes') el.innerHTML = nexptgHtml(v);
  refreshChrome();
}

async function client() {
  var conf = await api.relaisConf();
  if (!conf || !conf.url || !conf.compte || !conf.motDePasse) return null;
  try { return R.creerClient(conf) } catch (e) { E.erreur = R.messageErreur(e); return null }
}

async function chargerTechniciens() {
  if (E.chargement) return;
  E.chargement = true;
  var c = await client();
  E.configure = !!c;
  if (!c) { E.tech = null; E.techErr = '' }
  else {
    try { E.tech = await c.techniciens(); E.techErr = '' } catch (e) { E.tech = null; E.techErr = R.messageErreur(e) }
  }
  E.chargement = false;
  rendre();
}

/* Écrit le rapport dans le dossier : la copie sur la tablette est l'exemplaire conservé (le relais est un tampon). */
async function ranger(v, r, premiere) {
  var env = { version: 1, recu: r.recu, par: r.par, sha256: r.sha256, cle: r.cle, plaque: r.plaque, avertissements: r.avertissements || [], brut: r.brut };
  await api.write('vehicules/' + v.id + '/nexptg/' + r.sha256, env);
  (S.nm[v.id] = S.nm[v.id] || []).push(env);
  var nom = (r.brut && r.brut.name) || 'sans nom';
  save({
    nexptg: Object.assign({}, v.nexptg || {}, { cle: r.cle }),
    hist: hist(v, premiere ? 'Rapport NexPTG reçu : ' + nom + ' (technicien ' + r.par + ')' : 'Nouvelle version du rapport NexPTG reçue : ' + nom),
  });
}

async function rattacher(v, r, c) {
  var rep = await c.reclamer(r.cle, v.plaque, v.id);
  if (rep.conflit) {
    E.erreur = 'Ce rapport est déjà rattaché à un autre dossier (' + (rep.dossier || '—') + ').';
    E.candidats = E.candidats.filter(function (x) { return x.cle !== r.cle });
    return false;
  }
  if (rep.introuvable) { E.erreur = 'Rapport introuvable sur le relais.'; return false }
  try { await ranger(v, r, true) } catch (e) {
    try { await c.liberer(r.cle, v.id) } catch (x) { /* la réclamation sera libérée au prochain essai */ }
    E.erreur = 'Rapport reçu mais non enregistré sur la tablette : réessayer.';
    return false;
  }
  E.candidats = []; E.erreur = '';
  toast('Rapport NexPTG reçu');
  return true;
}

async function verifier() {
  var v = VV(); if (!v || E.occupe) return;
  var c = await client();
  if (!c) { E.configure = false; rendre(); return }
  E.configure = true; E.occupe = true; rendre();
  try {
    var st = etat(v), qui = (v.nexptg && v.nexptg.qui) || '';
    var rapports = await c.rapports(v.plaque, qui);
    E.erreur = ''; E.derniere = Date.now();
    if (st.statut === 'recu') {
      var mien = rapports.filter(function (r) { return r.cle === st.derniere.cle })[0];
      if (mien && N.versionAjouter(mien, versions(v))) { await ranger(v, mien, false); toast('Nouvelle version du rapport NexPTG') }
    } else if (st.statut === 'mesures') {
      var cand = N.candidats({ rapports: rapports, plaque: v.plaque, dossierId: v.id, creeLe: v.createdAt || 0, par: qui });
      if (cand.length === 1) await rattacher(v, cand[0], c);
      else E.candidats = cand;
    }
  } catch (e) { E.erreur = R.messageErreur(e) }
  E.occupe = false;
  var apres = etat(VV() || v);
  if (apres.statut === 'recu') renderSheet(true); else rendre();
}

function suivre() {
  if (E.timer) return;
  E.timer = setInterval(function () {
    var v = VV();
    var ouvert = v && S.cur === v.id && S.tab === 'mes' && !$('#sheet').hidden;
    var st = v ? etat(v).statut : '';
    var utile = st === 'mesures' || (st === 'recu' && v.statut === 'brouillon');
    if (!ouvert || !utile) { clearInterval(E.timer); E.timer = null; return }
    verifier();
  }, INTERVALLE);
}

/* Appelé après chaque affichage de l'onglet : charge les techniciens si besoin et lance la vérification. */
export function nexptgMonter(v) {
  var st = etat(v).statut;
  if (st === 'attente' && E.tech === null && !E.techErr) chargerTechniciens();
  if (st === 'mesures') { suivre(); if (!E.derniere) verifier() }
  if (st === 'recu' && v.statut === 'brouillon') suivre();
}

export async function nxCommencer() {
  var v = VV(); if (!v) return;
  var sel = $('#nx-qui'), qui = sel ? sel.value : '';
  if (!qui) { toast('Choisir qui va prendre les mesures'); return }
  E.erreur = ''; E.candidats = []; E.derniere = 0;
  await save({ nexptg: { qui: qui, debutAt: Date.now() }, hist: hist(v, 'Mesures NexPTG commencées (technicien ' + qui + ')') });
  renderSheet(true);
  nexptgMonter(VV());
}

export function nxVerifier() { E.derniere = 0; verifier() }

export function nxRecharger() { E.tech = null; E.techErr = ''; chargerTechniciens() }

export async function nxChoisir(sha) {
  var v = VV(), r = E.candidats.filter(function (x) { return x.sha256 === sha })[0];
  if (!v || !r) return;
  var c = await client(); if (!c) return;
  try { await rattacher(v, r, c) } catch (e) { E.erreur = R.messageErreur(e) }
  renderSheet(true);
}

export function nxTermine() {
  modalShow('<h2>Terminé sans rapport NexPTG</h2>' +
    '<p class="hint">Les mesures NexPTG sont obligatoires avant la signature. Indiquer pourquoi le dossier continue sans rapport : le motif est inscrit dans l’historique du dossier.</p>' +
    '<label class="fld"><span>Motif <em>*</em></span><textarea id="nx-motif" rows="3" maxlength="300" autocomplete="off"></textarea></label>' +
    '<div class="mrow2"><button class="btn" data-act="closemodal">Annuler</button><button class="btn pri" data-act="nxTermineOk">Confirmer</button></div>');
}

export async function nxTermineOk() {
  var v = VV(); if (!v) return;
  var champ = $('#nx-motif');
  var r = N.demandeTermine({ motif: champ ? champ.value : '', par: (v.nexptg && v.nexptg.qui) || v.recep || '', maintenant: Date.now() });
  if (!r.ok) { toast('Motif obligatoire (5 caractères minimum)'); return }
  await save({ nexptg: Object.assign({}, v.nexptg || {}, { termine: r.termine }), hist: hist(v, 'Mesures NexPTG terminées sans rapport. Motif : ' + r.termine.motif) });
  modalHide();
  renderSheet(true);
}
