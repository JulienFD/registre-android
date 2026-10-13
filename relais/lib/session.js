'use strict';
// Sessions persistantes : le mot de passe sert une fois ; ensuite un jeton d'accès court se renouvelle avec un jeton de
// rafraîchissement sans expiration, révocable (quitter, compte retiré, mot de passe changé).
const crypto = require('node:crypto');
const { verifierMotDePasse, empreinteCompte } = require('./comptes.js');
const { reponse } = require('./acces.js');
const { avecCors } = require('./cors.js');
const { creerJeton, lireJeton, secretValide, DUREE_DEFAUT } = require('./jeton.js');

const CORPS_MAX = 2048;
const REFRESH = /^[A-Za-z0-9_-]{43}$/;

const empreinte = (texte) => crypto.createHash('sha256').update(texte).digest('hex');
const cheminSession = (refresh) => 'sessions/' + empreinte(refresh) + '.json';
const erreur = (statut, texte) => reponse(statut, { ok: false, erreur: texte });

function jetonAcces(o, compte) {
  return creerJeton({ compte, empreinte: empreinteCompte(compte, o.comptes), secret: o.secret, maintenant: o.maintenant(), dureeMs: DUREE_DEFAUT });
}

async function ouvrir(o, corps) {
  const compte = verifierMotDePasse(corps && corps.compte, corps && corps.mdp, o.comptes);
  if (!compte) return erreur(401, 'identifiants refusés');
  const refresh = crypto.randomBytes(32).toString('base64url');
  await o.stockage.ecrire(cheminSession(refresh), { version: 1, compte, empreinte: empreinteCompte(compte, o.comptes), creeLe: o.maintenant() });
  return reponse(200, { ok: true, compte, access: jetonAcces(o, compte), expireDans: DUREE_DEFAUT / 1000, refresh });
}

async function rafraichir(o, corps) {
  const refresh = corps && corps.refresh;
  if (typeof refresh !== 'string' || !REFRESH.test(refresh)) return erreur(401, 'session invalide');
  const s = await o.stockage.lire(cheminSession(refresh));
  if (!s) return erreur(401, 'session invalide');
  // Compte retiré ou mot de passe changé : la session est supprimée, pas seulement refusée.
  if (empreinteCompte(s.compte, o.comptes) !== s.empreinte) {
    await o.stockage.supprimer(cheminSession(refresh));
    return erreur(401, 'session invalide');
  }
  return reponse(200, { ok: true, compte: s.compte, access: jetonAcces(o, s.compte), expireDans: DUREE_DEFAUT / 1000 });
}

async function quitter(o, corps) {
  const refresh = corps && corps.refresh;
  if (typeof refresh === 'string' && REFRESH.test(refresh)) await o.stockage.supprimer(cheminSession(refresh));
  return reponse(200, { ok: true });
}

async function servir(o) {
  if (o.methode !== 'POST') return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'POST' });
  if (!secretValide(o.secret)) return erreur(503, 'sessions non configurées');
  if (Buffer.byteLength(o.corps || '') > CORPS_MAX) return erreur(413, 'corps trop volumineux');
  let corps;
  try { corps = JSON.parse(o.corps); } catch { return erreur(400, 'corps illisible'); }
  try {
    const action = o.requete && o.requete.action;
    if (action === 'refresh') return await rafraichir(o, corps);
    if (action === 'quitter') return await quitter(o, corps);
    return await ouvrir(o, corps);
  } catch (e) {
    console.error('session', e && e.message);
    return erreur(500, 'stockage indisponible');
  }
}

module.exports = { servirSession: avecCors(servir), creerJeton, lireJeton };
