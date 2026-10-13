'use strict';
// Jeton d'accès : court, signé (HMAC-SHA256), vérifié sans accès au stockage. Il porte le compte, l'expiration et l'empreinte du compte.
const crypto = require('node:crypto');
const { empreinteCompte } = require('./comptes.js');

const DUREE_DEFAUT = 30 * 60 * 1000;
const SECRET_MIN = 32;

const secretValide = (secret) => typeof secret === 'string' && secret.length >= SECRET_MIN;
const signer = (secret, texte) => crypto.createHmac('sha256', secret).update(texte).digest('base64url');

function creerJeton(o) {
  const payload = Buffer.from(JSON.stringify({ c: o.compte, e: o.maintenant + (o.dureeMs || DUREE_DEFAUT), f: o.empreinte })).toString('base64url');
  return 'v1.' + payload + '.' + signer(o.secret, 'v1.' + payload);
}

// Renvoie le compte, ou null : signature, expiration, compte toujours présent et mot de passe inchangé.
function lireJeton(jeton, secret, comptes, maintenant) {
  if (typeof jeton !== 'string' || !secretValide(secret)) return null;
  const p = jeton.split('.');
  if (p.length !== 3 || p[0] !== 'v1') return null;
  const a = Buffer.from(p[2]), b = Buffer.from(signer(secret, 'v1.' + p[1]));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let o;
  try { o = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!o || typeof o.c !== 'string' || typeof o.e !== 'number' || o.e <= maintenant) return null;
  if (empreinteCompte(o.c, comptes) !== o.f) return null;
  return o.c;
}

module.exports = { creerJeton, lireJeton, secretValide, DUREE_DEFAUT };
