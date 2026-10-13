/* Logique pure de la PWA photos : sans DOM ni réseau, testée sous Node. */

// Mêmes clés, libellés et ordre que www/js/constants.js (un test le vérifie).
export const SLOTS = [
  ['avg', 'Avant gauche (3/4)'], ['av', 'Face avant'], ['avd', 'Avant droit (3/4)'], ['d', 'Côté droit'],
  ['ard', 'Arrière droit (3/4)'], ['ar', 'Face arrière'], ['arg', 'Arrière gauche (3/4)'], ['g', 'Côté gauche'],
  ['toit', 'Toit et capot'], ['cpt', 'Compteur : km et voyants'], ['ia', 'Intérieur avant'], ['ir', 'Intérieur arrière et coffre'],
].map((a) => ({ k: a[0], l: a[1] }));

export const SORTIE_REQ = 8;
const PHASES = { entree: 'ENTRÉE', sortie: 'SORTIE', mesures: 'MESURES', compl: 'COMPLÉMENT' };

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
