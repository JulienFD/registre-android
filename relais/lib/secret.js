'use strict';
// Secret de signature des jetons d'accès. Il n'est lié ni aux comptes ni à une variable à configurer : le relais le génère à la
// première utilisation et le range dans le store privé. Une variable RELAIS_SECRET (≥ 32 caractères) reste possible et prioritaire.
const crypto = require('node:crypto');
const { secretValide } = require('./jeton.js');

const CHEMIN_SECRET = 'secret/signature.json';
let cache = null; // par instance : un seul accès au stockage par démarrage à froid

async function obtenirSecret(stockage, env) {
  if (secretValide(env)) return env;
  if (cache) return cache;
  let s = await stockage.lire(CHEMIN_SECRET);
  if (!s || !secretValide(s.secret)) {
    if (s) throw new Error('secret indisponible'); // fichier présent mais inutilisable : jamais remplacé en silence
    // Écriture sans écrasement : si une autre instance l'a créé entre-temps, c'est le sien qui fait foi.
    await stockage.ecrire(CHEMIN_SECRET, { version: 1, secret: crypto.randomBytes(48).toString('base64url'), creeLe: Date.now() });
    s = await stockage.lire(CHEMIN_SECRET);
  }
  if (!s || !secretValide(s.secret)) throw new Error('secret indisponible');
  cache = s.secret;
  return cache;
}

function oublierCache() { cache = null; }

module.exports = { obtenirSecret, oublierCache, CHEMIN_SECRET };
