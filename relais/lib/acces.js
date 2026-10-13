'use strict';
// Contrôle d'accès commun aux routes : authentification, puis rôle lecteur. Une réponse de refus est renvoyée toute prête.
const { verifierBasic } = require('./comptes.js');

const SANS_CACHE = { 'Cache-Control': 'private, no-store' };
const reponse = (statut, json, entetes) => ({ statut, json, entetes: Object.assign({}, SANS_CACHE, entetes) });

// Renvoie { compte } ou { refus }.
function authentifier(o) {
  const compte = verifierBasic(o.authorization, o.comptes);
  // Pas d'en-tête WWW-Authenticate : face à un défi Basic, le navigateur ouvrirait sa propre fenêtre d'identifiants par-dessus
  // celle de la PWA (« on me les redemande »). Ces routes sont appelées par du JavaScript, qui envoie Authorization lui-même.
  if (!compte) return { refus: reponse(401, { ok: false, erreur: 'authentification requise' }) };
  return { compte };
}

// Réservé aux comptes de RELAIS_LECTEURS (la tablette).
function exigerLecteur(o) {
  const a = authentifier(o);
  if (a.refus) return a;
  if (!o.lecteurs.has(a.compte)) return { refus: reponse(403, { ok: false, erreur: 'accès en lecture non autorisé' }) };
  return a;
}

module.exports = { reponse, authentifier, exigerLecteur, SANS_CACHE };
