/* Logique pure de la PWA photos : sans DOM ni réseau, testée sous Node. */

// Mêmes clés, libellés et ordre que www/js/constants.js (un test le vérifie).
export const SLOTS = [
  ['avg', 'Avant gauche (3/4)'], ['av', 'Face avant'], ['avd', 'Avant droit (3/4)'], ['d', 'Côté droit'],
  ['ard', 'Arrière droit (3/4)'], ['ar', 'Face arrière'], ['arg', 'Arrière gauche (3/4)'], ['g', 'Côté gauche'],
  ['toit', 'Toit et capot'], ['cpt', 'Compteur : km et voyants'], ['ia', 'Intérieur avant'], ['ir', 'Intérieur arrière et coffre'],
].map((a) => ({ k: a[0], l: a[1] }));

export const SORTIE_REQ = 8;
const PHASES = { entree: 'ENTRÉE', sortie: 'SORTIE', mesures: 'MESURES', compl: 'COMPLÉMENT' };

// Saisie de plaque : mêmes règles que le Registre (www/utils.js, un test vérifie la synchro).
export const TYPES_PLAQUE = { fr: { ph: 'AB-123-CD', max: 9, nom: 'Française (AB-123-CD)' }, etr: { ph: 'B-AB 1234', max: 12, nom: 'Étrangère ou autre' } };
const LETTRE_SIV = /[A-HJ-NP-TV-Z]/;
const SIV = /^[A-HJ-NP-TV-Z]{2}\d{3}[A-HJ-NP-TV-Z]{2}$/;

export function formatPlaque(brut, type) {
  let s = String(brut || '').toUpperCase();
  if (type === 'etr') {
    s = s.replace(/[^\p{L}0-9 -]/gu, '').replace(/^[ -]+/, '').replace(/([ -])[ -]+/g, '$1');
    return s.slice(0, 12);
  }
  let out = '';
  s.replace(/[^A-Z0-9]/g, '').split('').forEach((c) => {
    const n = out.length;
    const lettre = n < 2 || n > 4;
    if (n < 7 && (lettre ? LETTRE_SIV.test(c) : /\d/.test(c))) out += c;
  });
  return [out.slice(0, 2), out.slice(2, 5), out.slice(5)].filter(Boolean).join('-');
}

export function plaqueSaisieValide(p, type) {
  const n = String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return type === 'etr' ? n.length >= 2 : SIV.test(n);
}

export function normPlaque(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
export function plaqueValide(p) { return /^[A-Z0-9]{2,15}$/.test(normPlaque(p)) && normPlaque(p) === p; }

function prises(etat, phase) {
  const s = new Set();
  ((etat && etat.photos) || []).forEach((p) => { if (p.phase === phase && p.slot) s.add(p.slot); });
  return s;
}

// Vues du véhicule pas encore prises pour cette phase, dans l'ordre de l'application.
export function manquants(etat, phase) {
  const pris = prises(etat, phase);
  return SLOTS.filter((s) => !pris.has(s.k));
}

export function progression(etat, phase) {
  const pris = prises(etat, phase).size;
  return { pris, total: SLOTS.length, requis: phase === 'sortie' ? SORTIE_REQ : SLOTS.length };
}

// Adresse d'envoi : aucun paramètre vide.
export function urlEnvoi(o) {
  const q = new URLSearchParams();
  q.set('plaque', o.plaque);
  q.set('phase', o.phase);
  if (o.slot) q.set('slot', o.slot);
  if (o.label) q.set('label', o.label);
  if (o.prise) q.set('prise', String(o.prise));
  return '/api/photos?' + q.toString();
}

// ok : retirer de la file ; connexion : identifiants à ressaisir ; rejeter : ne jamais réessayer ; reessayer : garder.
export function decisionApres(statut) {
  if (statut === 200) return 'ok';
  if (statut === 401) return 'connexion';
  if ([400, 413, 415, 429].indexOf(statut) > -1) return 'rejeter';
  return 'reessayer';
}

function plaqueLisible(p) {
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? p.slice(0, 2) + '-' + p.slice(2, 5) + '-' + p.slice(5) : p;
}

// Bandeau inscrit sur l'image, avec la vraie heure de prise de vue.
export function tampon(plaque, ts, qui, phase) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return plaqueLisible(plaque) + '  ·  ' + date + '  ·  ' + qui + '  ·  ' + (PHASES[phase] || phase.toUpperCase());
}

// Un jeton d'accès n'est réutilisé que s'il lui reste plus que la marge (le serveur le refuserait sinon).
export function jetonUtilisable(acces, maintenant, margeMs) {
  return !!acces && typeof acces.jeton === 'string' && acces.jeton.length > 0 && acces.expire - maintenant > margeMs;
}

// Échéance sur l'horloge locale, à partir de la durée de validité annoncée par le serveur (en secondes).
export function expirationLocale(maintenant, expireDansSec) {
  const s = Number(expireDansSec);
  return maintenant + (Number.isFinite(s) && s > 0 ? s * 1000 : 0);
}
