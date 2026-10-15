/* Accès au relais avec une session persistante : le mot de passe sert une fois, puis un jeton de rafraîchissement
   (conservé sur le téléphone, sans expiration, révocable) renouvelle de courts jetons d'accès. */
import { decisionApres, expirationLocale, jetonUtilisable, urlEnvoi } from './pur.mjs';

const CLE = 'rp-session';
const ANCIENNE_CLE = 'rp-auth';
const MARGE_MS = 60000;
let acces = null; // jeton d'accès courant, gardé en mémoire seulement

export function lireSession() {
  try { const s = JSON.parse(localStorage.getItem(CLE)); return s && s.compte && s.refresh ? s : null; } catch { return null; }
}
function ecrireSession(s) { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch { /* stockage indisponible : reconnexion à chaque ouverture */ } }
function effacerSession() { acces = null; try { localStorage.removeItem(CLE); } catch { /* rien à effacer */ } }
export function compteCourant() { const s = lireSession(); return s ? s.compte : ''; }

async function post(chemin, corps) {
  try {
    const r = await fetch(chemin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps), cache: 'no-store', credentials: 'omit' });
    return { statut: r.status, json: await r.json().catch(() => null) };
  } catch { return { statut: 0, json: null }; }
}

function retenir(json) { acces = { jeton: json.access, expire: expirationLocale(Date.now(), json.expireDans) }; }

// Ouvre une session avec le mot de passe ; renvoie le statut HTTP (0 = réseau).
export async function ouvrirSession(compte, mdp) {
  const r = await post('/api/session', { compte, mdp });
  if (r.statut === 200 && r.json && r.json.refresh) { ecrireSession({ compte: r.json.compte, refresh: r.json.refresh }); retenir(r.json); }
  return r.statut;
}

// Ferme la session : le jeton de rafraîchissement est supprimé du relais, donc inutilisable même s'il avait été copié.
export async function quitter() {
  const s = lireSession();
  effacerSession();
  if (s) await post('/api/session?action=quitter', { refresh: s.refresh });
}

// { jeton } ou { erreur: 'connexion' (session révoquée ou absente) | 'reseau' (réessayer plus tard, session conservée) }.
async function obtenirJeton() {
  if (jetonUtilisable(acces, Date.now(), MARGE_MS)) return { jeton: acces.jeton };
  const s = lireSession();
  if (!s) return { erreur: 'connexion' };
  const r = await post('/api/session?action=refresh', { refresh: s.refresh });
  if (r.statut === 200 && r.json && r.json.access) { retenir(r.json); return { jeton: acces.jeton }; }
  if (r.statut === 401) { effacerSession(); return { erreur: 'connexion' }; }
  return { erreur: 'reseau' };
}

// Appel authentifié ; un jeton refusé par le serveur est renouvelé une fois.
async function appeler(chemin, init) {
  for (let essai = 0; essai < 2; essai++) {
    const j = await obtenirJeton();
    if (j.erreur) return { statut: j.erreur === 'connexion' ? 401 : 0, json: null };
    try {
      const r = await fetch(chemin, Object.assign({ cache: 'no-store', credentials: 'omit' }, init, { headers: Object.assign({}, init.headers, { Authorization: 'Bearer ' + j.jeton }) }));
      if (r.status === 401 && essai === 0) { acces = null; continue; }
      return { statut: r.status, json: await r.json().catch(() => null) };
    } catch { return { statut: 0, json: null }; }
  }
  return { statut: 401, json: null };
}

export function etat(plaque) {
  return appeler('/api/photos?plaque=' + encodeURIComponent(plaque) + '&vue=etat', { method: 'GET', headers: {} });
}

// Envoie une photo ; renvoie le statut HTTP (0 = réseau, 401 = session à rouvrir).
export async function envoyer(meta, blob) {
  return (await appeler(urlEnvoi(meta), { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob })).statut;
}

// Anciennes versions : le mot de passe était conservé sur le téléphone. On l'échange contre une session puis on l'efface.
export async function migrerAncienneConnexion() {
  let brut;
  try { brut = localStorage.getItem(ANCIENNE_CLE); } catch { return; }
  if (!brut) return;
  let a = null;
  try { a = JSON.parse(brut); } catch { /* entrée illisible : supprimée ci-dessous */ }
  const statut = a && a.compte && a.mdp ? await ouvrirSession(a.compte, a.mdp) : 401;
  if (statut !== 0) { try { localStorage.removeItem(ANCIENNE_CLE); } catch { /* sans effet */ } }
}

export { decisionApres };
