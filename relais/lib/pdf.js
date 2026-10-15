'use strict';
// PDF destiné au client : la tablette le dépose, le relais renvoie un lien secret (256 bits) à durée limitée.
// Le lien est la seule protection : quiconque le possède peut télécharger, jusqu'à l'expiration.
const crypto = require('node:crypto');
const { reponse, exigerLecteur } = require('./acces.js');
const { avecCors } = require('./cors.js');

const PLAQUE = /^[A-Z0-9]{2,15}$/;
const ID = /^[0-9a-f]{64}$/;
const DUREE = 30 * 86400000;
// Les fonctions Vercel refusent un corps de plus de 4,5 Mo (mégaoctets, 10^6 octets) : on garde de la marge.
const TAILLE_MAX = 4000000;

const cheminPdf = (id) => 'pdf/' + id + '.pdf';
const cheminMeta = (id) => 'pdf/' + id + '.json';

const erreur = (statut, texte) => reponse(statut, { ok: false, erreur: texte });

const estPdf = (o) => o.length > 8 && o[0] === 0x25 && o[1] === 0x50 && o[2] === 0x44 && o[3] === 0x46 && o[4] === 0x2D;

// Nom de fichier proposé au client : ASCII simple, jamais de chemin ni de retour à la ligne.
function nomSur(texte) {
  const base = String(texte == null ? '' : texte).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^[._]+/, '').replace(/\.pdf$/i, '').slice(0, 60);
  return (base || 'dossier') + '.pdf';
}

async function supprimerLien(stockage, id) {
  await stockage.supprimer(cheminPdf(id));
  await stockage.supprimer(cheminMeta(id));
}

// Ménage au dépôt : rien n'est conservé au-delà de l'expiration, même si le lien n'est jamais rouvert.
async function purger(o) {
  const chemins = (await o.stockage.lister('pdf/')).filter((c) => c.endsWith('.json'));
  for (const c of chemins) {
    const meta = await o.stockage.lire(c);
    if (meta && typeof meta.expire === 'number' && meta.expire < o.maintenant()) await supprimerLien(o.stockage, c.slice(4, -5));
  }
}

async function deposer(o, compte) {
  const q = o.requete || {};
  if (typeof q.plaque !== 'string' || !PLAQUE.test(q.plaque)) return erreur(400, 'plaque invalide');
  if (!(o.octets instanceof Uint8Array) || !o.octets.length) return erreur(400, 'pdf manquant');
  if (o.octets.length > TAILLE_MAX) return erreur(413, 'pdf trop volumineux');
  if (!estPdf(o.octets)) return erreur(415, 'fichier PDF attendu');

  await purger(o);
  const id = crypto.randomBytes(32).toString('hex');
  const maintenant = o.maintenant();
  const meta = { version: 1, plaque: q.plaque, nom: nomSur(q.nom), par: compte, cree: maintenant, expire: maintenant + DUREE, taille: o.octets.length };
  // Le PDF d'abord : une fiche n'existe jamais sans son fichier.
  await o.stockage.ecrireOctets(cheminPdf(id), o.octets, 'application/pdf');
  await o.stockage.ecrire(cheminMeta(id), meta);
  return reponse(200, { ok: true, id: id, expire: meta.expire });
}

async function telecharger(o) {
  const id = (o.requete || {}).id;
  if (typeof id !== 'string' || !ID.test(id)) return erreur(400, 'lien invalide');
  const meta = await o.stockage.lire(cheminMeta(id));
  if (!meta) return erreur(404, 'lien introuvable');
  if (meta.expire < o.maintenant()) {
    await supprimerLien(o.stockage, id);
    return erreur(410, 'lien expiré');
  }
  const octets = await o.stockage.lireOctets(cheminPdf(id));
  if (!octets) return erreur(404, 'lien introuvable');
  return {
    statut: 200, json: null, octets: octets,
    entetes: {
      'Cache-Control': 'private, no-store', 'Content-Type': 'application/pdf', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex', 'Content-Disposition': 'attachment; filename="' + nomSur(meta.nom) + '"',
    },
  };
}

async function servir(o) {
  if (o.methode !== 'PUT' && o.methode !== 'GET') return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'PUT, GET' });
  try {
    if (o.methode === 'GET') return await telecharger(o);
    const acces = exigerLecteur(o);
    if (acces.refus) return acces.refus;
    return await deposer(o, acces.compte);
  } catch (e) {
    console.error('stockage', e && e.message);
    return erreur(500, 'stockage indisponible');
  }
}

module.exports = { servirPdf: avecCors(servir), TAILLE_MAX, DUREE };
