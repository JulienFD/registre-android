/* File d'envoi locale (IndexedDB) : une photo prise n'est jamais perdue si le réseau est coupé. */
import { decisionApres } from './pur.mjs';
import { envoyer } from './api.js';

const NOM = 'rp-photos';
const MAG = 'file';
let enCours = false;

function ouvrir() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NOM, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAG, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await ouvrir();
  return new Promise((res, rej) => {
    const t = db.transaction(MAG, mode);
    const r = fn(t.objectStore(MAG));
    t.oncomplete = () => { db.close(); res(r && r.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}

export const ajouter = (rec) => tx('readwrite', (s) => s.add(rec));
export const lister = () => tx('readonly', (s) => s.getAll());
export const retirer = (id) => tx('readwrite', (s) => s.delete(id));
const mettreAJour = (rec) => tx('readwrite', (s) => s.put(rec));

/* Envoie les photos en attente, une par une. Renvoie 'ok', 'connexion' (session à rouvrir) ou 'reseau' (à reprendre plus tard). */
export async function vider() {
  if (enCours) return 'ok';
  enCours = true;
  try {
    const attente = (await lister()).filter((p) => !p.rejetee).sort((a, b) => a.id - b.id);
    for (const p of attente) {
      const statut = await envoyer({ plaque: p.plaque, phase: p.phase, slot: p.slot, label: p.label, prise: p.prise }, p.blob);
      const d = decisionApres(statut);
      if (d === 'ok') await retirer(p.id);
      else if (d === 'rejeter') await mettreAJour(Object.assign({}, p, { rejetee: true, statut: statut }));
      else return d === 'connexion' ? 'connexion' : 'reseau';
    }
    return 'ok';
  } finally { enCours = false; }
}
