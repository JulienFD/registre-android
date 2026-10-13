/* Accès au relais : identifiants conservés sur le téléphone, appels authentifiés. */
import { decisionApres, urlEnvoi } from './pur.mjs';

const CLE = 'rp-auth';

export function lireAuth() {
  try { const a = JSON.parse(localStorage.getItem(CLE)); return a && a.compte && a.mdp ? a : null; } catch { return null; }
}
export function ecrireAuth(a) { try { localStorage.setItem(CLE, JSON.stringify(a)); } catch { /* stockage indisponible : reconnexion à chaque ouverture */ } }
export function effacerAuth() { try { localStorage.removeItem(CLE); } catch { /* rien à effacer */ } }

function entete(a) {
  const octets = new TextEncoder().encode(a.compte + ':' + a.mdp);
  let s = '';
  octets.forEach((o) => { s += String.fromCharCode(o); });
  return 'Basic ' + btoa(s);
}

// Renvoie { statut, json } ; statut 0 = relais injoignable.
export async function etat(auth, plaque) {
  try {
    const r = await fetch('/api/photos?plaque=' + encodeURIComponent(plaque) + '&vue=etat', { headers: { Authorization: entete(auth) }, cache: 'no-store', credentials: 'omit' });
    return { statut: r.status, json: await r.json().catch(() => null) };
  } catch { return { statut: 0, json: null }; }
}

// Envoie une photo ; renvoie le statut HTTP (0 = réseau).
export async function envoyer(auth, meta, blob) {
  try {
    const r = await fetch(urlEnvoi(meta), { method: 'PUT', headers: { Authorization: entete(auth), 'Content-Type': 'image/jpeg' }, body: blob, cache: 'no-store', credentials: 'omit' });
    return r.status;
  } catch { return 0; }
}

export { decisionApres };
