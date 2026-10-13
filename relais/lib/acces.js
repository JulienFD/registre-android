'use strict';
// Contrôle d'accès commun aux routes : authentification, puis rôle lecteur. Une réponse de refus est renvoyée toute prête.
const { verifierBasic } = require('./comptes.js');
const { lireJeton } = require('./jeton.js');

const SANS_CACHE = { 'Cache-Control': 'private, no-store' };
const reponse = (statut, json, entetes) => ({ statut, json, entetes: Object.assign({}, SANS_CACHE, entetes) });

// Renvoie { compte } ou { refus }. Deux façons de s'authentifier : Bearer (jeton d'accès de la PWA) ou Basic (NexPTG, tablette).
function authentifier(o) {
  const entete = String(o.authorization || '');
  const compte = /^Bearer\s/i.test(entete)
    ? lireJeton(entete.slice(7).trim(), o.secret, o.comptes, typeof o.maintenant === 'function' ? o.maintenant() : Date.now())
    : verifierBasic(entete, o.comptes);
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
