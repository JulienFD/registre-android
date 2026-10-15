'use strict';
// CORS : la WebView de l'application (origine https://localhost) appelle le relais, donc cross-origine.
// Liste blanche d'origines, jamais de joker : seules les origines connues obtiennent une autorisation.
const ORIGINE_APPLICATION = 'https://localhost';
const ORIGINE_VALIDE = /^https?:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/;

// RELAIS_ORIGINES (facultatif) : origines supplémentaires, séparées par « , » ou « ; ». Toute entrée invalide est ignorée.
function lireOrigines(texte) {
  const noms = String(texte || '').split(/[;,]/).map((o) => o.trim()).filter((o) => ORIGINE_VALIDE.test(o));
  return new Set(noms.length ? noms : [ORIGINE_APPLICATION]);
}

function entetesCors(origine, origines) {
  const autorisees = origines || lireOrigines();
  if (typeof origine !== 'string' || !autorisees.has(origine)) return {};
  return { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' };
}

// Réponse à la pré-requête (OPTIONS) du navigateur : aucune authentification, aucun accès aux données.
function preflight(origine, origines) {
  const base = entetesCors(origine, origines);
  const entetes = Object.assign({ 'Cache-Control': 'private, no-store' }, base);
  if (base['Access-Control-Allow-Origin']) {
    entetes['Access-Control-Allow-Methods'] = 'GET, PUT, POST, DELETE, OPTIONS';
    entetes['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    entetes['Access-Control-Max-Age'] = '600';
  }
  return { statut: 204, json: null, entetes };
}

// Enveloppe une fonction de service : pré-requête traitée avant tout contrôle, autorisation CORS ajoutée aux autres réponses (erreurs comprises).
function avecCors(fn) {
  return async function (o) {
    if (o.methode === 'OPTIONS') return preflight(o.origine, o.origines);
    const r = await fn(o);
    return Object.assign({}, r, { entetes: Object.assign({}, r.entetes, entetesCors(o.origine, o.origines)) });
  };
}

module.exports = { lireOrigines, entetesCors, preflight, avecCors, ORIGINE_APPLICATION };
