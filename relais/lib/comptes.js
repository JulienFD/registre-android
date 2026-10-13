'use strict';
// Comptes des techniciens (identifiant + mot de passe de NexPTG). Seule l'empreinte scrypt est conservée.
const crypto = require('node:crypto');

const NOM = /^[a-z0-9_-]{1,32}$/;
const MDP_MIN = 12;
const MDP_MAX = 256;
const FAUX = { sel: Buffer.alloc(16), hash: Buffer.alloc(32) };

function empreinte(motDePasse, sel) {
  return crypto.scryptSync(motDePasse, sel, 32);
}

// Renvoie « nom:sel:empreinte », à ajouter à RELAIS_COMPTES (entrées séparées par « ; »).
function creerCompte(nom, motDePasse) {
  if (!NOM.test(nom)) throw new Error('Nom de compte invalide : 1 à 32 caractères parmi a-z, 0-9, _ et -');
  if (String(motDePasse).length < MDP_MIN) throw new Error('Mot de passe trop court (' + MDP_MIN + ' caractères minimum)');
  const sel = crypto.randomBytes(16);
  return nom + ':' + sel.toString('hex') + ':' + empreinte(motDePasse, sel).toString('hex');
}

// Une entrée illisible est ignorée : le compte est alors refusé, jamais accepté par défaut.
function lireComptes(texte) {
  const comptes = new Map();
  String(texte || '').split(';').map((e) => e.trim()).filter(Boolean).forEach((entree) => {
    const [nom, sel, hash] = entree.split(':');
    if (NOM.test(nom || '') && /^[0-9a-f]{32}$/.test(sel || '') && /^[0-9a-f]{64}$/.test(hash || '')) {
      comptes.set(nom, { sel: Buffer.from(sel, 'hex'), hash: Buffer.from(hash, 'hex') });
    }
  });
  return comptes;
}

// Comptes autorisés à LIRE (la tablette) : liste de noms séparés par « , » ou « ; ». Vide = personne.
function lireLecteurs(texte) {
  const noms = String(texte || '').split(/[;,]/).map((n) => n.trim()).filter((n) => NOM.test(n));
  return new Set(noms);
}

// Renvoie le nom du compte, ou null. Le calcul est fait même pour un compte inconnu (temps constant).
function verifierBasic(entete, comptes) {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(String(entete || '').trim());
  if (!m) return null;
  const decode = Buffer.from(m[1], 'base64').toString('utf8');
  const i = decode.indexOf(':');
  if (i < 1) return null;
  const nom = decode.slice(0, i);
  const motDePasse = decode.slice(i + 1);
  if (motDePasse.length > MDP_MAX) return null;
  const compte = comptes.get(nom);
  const ref = compte || FAUX;
  const egal = crypto.timingSafeEqual(empreinte(motDePasse, ref.sel), ref.hash);
  return compte && egal ? nom : null;
}

module.exports = { creerCompte, lireComptes, lireLecteurs, verifierBasic };
