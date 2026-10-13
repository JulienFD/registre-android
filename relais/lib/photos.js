'use strict';
// Photos prises depuis le téléphone (PWA) : validation stricte, stockage, lecture et réclamation par la tablette.
const crypto = require('node:crypto');
const { reponse, authentifier, exigerLecteur } = require('./acces.js');
const { avecCors } = require('./cors.js');

// Emplacements des vues du véhicule : doivent rester ceux de www/js/constants.js (un test le vérifie).
const SLOTS = ['avg', 'av', 'avd', 'd', 'ard', 'ar', 'arg', 'g', 'toit', 'cpt', 'ia', 'ir'];
const PHASES = ['entree', 'sortie', 'mesures', 'compl'];
const PLAQUE = /^[A-Z0-9]{2,15}$/;
const DOSSIER = /^[A-Za-z0-9_-]{1,64}$/;
const SHA = /^[0-9a-f]{64}$/;
const TAILLE_MIN = 1000;
const TAILLE_MAX = 2 * 1024 * 1024;
const COTE_MIN = 320;
const COTE_MAX = 5000;
const FENETRE_PRISE = 14 * 86400000;
const AVANCE_PRISE = 5 * 60000;
const QUOTA_DEFAUT = 200;
const CORPS_MAX = 4096;

const empreinte = (octets) => crypto.createHash('sha256').update(octets).digest('hex');
const cheminImage = (plaque, sha) => 'photos/' + plaque + '/' + sha + '.jpg';
const cheminMeta = (plaque, sha) => 'photos/' + plaque + '/' + sha + '.json';
const cheminReclamation = (sha) => 'reclamations-photos/' + sha + '.json';

// Dimensions d'un JPEG, ou null s'il n'est pas structurellement complet (SOI … SOF … EOI).
function dimensionsJpeg(o) {
  const n = o.length;
  if (n < 4 || o[0] !== 0xFF || o[1] !== 0xD8 || o[n - 2] !== 0xFF || o[n - 1] !== 0xD9) return null;
  let i = 2;
  while (i + 3 < n) {
    if (o[i] !== 0xFF) return null;
    while (o[i + 1] === 0xFF) i++;
    const marqueur = o[i + 1];
    if (marqueur === 0xD9 || marqueur === 0xDA) return null;
    if (marqueur === 0x01 || (marqueur >= 0xD0 && marqueur <= 0xD7)) { i += 2; continue; }
    const longueur = (o[i + 2] << 8) | o[i + 3];
    if (marqueur >= 0xC0 && marqueur <= 0xCF && marqueur !== 0xC4 && marqueur !== 0xC8 && marqueur !== 0xCC) {
      if (i + 8 >= n) return null;
      return { h: (o[i + 5] << 8) | o[i + 6], w: (o[i + 7] << 8) | o[i + 8] };
    }
    if (longueur < 2) return null;
    i += 2 + longueur;
  }
  return null;
}

function nettoyerLegende(t) {
  return String(t == null ? '' : t).split('').map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function erreur(statut, texte) { return reponse(statut, { ok: false, erreur: texte }); }

async function televerser(o, compte) {
  const q = o.requete || {};
  if (typeof q.plaque !== 'string' || !PLAQUE.test(q.plaque)) return erreur(400, 'plaque invalide');
  if (PHASES.indexOf(q.phase) < 0) return erreur(400, 'phase invalide');
  const avecSlot = q.phase === 'entree' || q.phase === 'sortie';
  if (avecSlot && SLOTS.indexOf(q.slot) < 0) return erreur(400, 'emplacement invalide');
  const octets = o.octets;
  if (!(octets instanceof Uint8Array)) return erreur(400, 'image manquante');
  if (octets.length > TAILLE_MAX) return erreur(413, 'image trop volumineuse');
  const dim = dimensionsJpeg(octets);
  if (!dim || octets.length < TAILLE_MIN || dim.w < COTE_MIN || dim.h < COTE_MIN || dim.w > COTE_MAX || dim.h > COTE_MAX) {
    return erreur(415, 'image JPEG attendue, de dimensions plausibles');
  }

  const sha = empreinte(octets);
  if (await o.stockage.lire(cheminMeta(q.plaque, sha))) return reponse(200, { ok: true, sha256: sha, deja: true });

  const existantes = (await o.stockage.lister('photos/' + q.plaque + '/')).filter((c) => c.endsWith('.json')).length;
  if (existantes >= (o.quotaPlaque || QUOTA_DEFAUT)) return erreur(429, 'trop de photos pour cette plaque');

  const recu = o.maintenant();
  const prise = Number(q.prise);
  const plausible = Number.isFinite(prise) && prise <= recu + AVANCE_PRISE && prise >= recu - FENETRE_PRISE;
  const meta = {
    version: 1, sha256: sha, plaque: q.plaque, phase: q.phase, slot: avecSlot ? q.slot : null, label: nettoyerLegende(q.label),
    par: compte, recu: recu, prise: plausible ? prise : recu, taille: octets.length, largeur: dim.w, hauteur: dim.h,
  };
  // L'image d'abord : une fiche de métadonnées n'existe jamais sans son image.
  await o.stockage.ecrireOctets(cheminImage(q.plaque, sha), octets, 'image/jpeg');
  await o.stockage.ecrire(cheminMeta(q.plaque, sha), meta);
  return reponse(200, { ok: true, sha256: sha, deja: false });
}

async function metas(o, plaque) {
  const chemins = (await o.stockage.lister('photos/' + plaque + '/')).filter((c) => c.endsWith('.json'));
  const liste = await Promise.all(chemins.map((c) => o.stockage.lire(c)));
  return liste.filter((m) => m && typeof m.sha256 === 'string').sort((a, b) => a.recu - b.recu);
}

async function etat(o) {
  const plaque = o.requete.plaque;
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return erreur(400, 'plaque invalide');
  const liste = await metas(o, plaque);
  return reponse(200, { ok: true, plaque, photos: liste.map((m) => ({ phase: m.phase, slot: m.slot, label: m.label, recu: m.recu })) });
}

async function lister(o) {
  const plaque = o.requete.plaque;
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return erreur(400, 'plaque invalide');
  const liste = await metas(o, plaque);
  const photos = [];
  for (const m of liste) {
    const r = await o.stockage.lire(cheminReclamation(m.sha256));
    photos.push({
      sha256: m.sha256, phase: m.phase, slot: m.slot, label: m.label, par: m.par, recu: m.recu, prise: m.prise,
      taille: m.taille, largeur: m.largeur, hauteur: m.hauteur, reclame: r ? { dossier: r.dossier, par: r.par, recu: r.recu } : null,
    });
  }
  return reponse(200, { ok: true, plaque, photos });
}

async function image(o) {
  const { plaque, sha } = o.requete;
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return erreur(400, 'plaque invalide');
  if (typeof sha !== 'string' || !SHA.test(sha)) return erreur(400, 'empreinte invalide');
  const octets = await o.stockage.lireOctets(cheminImage(plaque, sha));
  if (!octets) return erreur(404, 'photo introuvable');
  return { statut: 200, json: null, octets: octets, entetes: { 'Cache-Control': 'private, no-store', 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' } };
}

async function reclamer(o, compte) {
  if (Buffer.byteLength(o.corps || '') > CORPS_MAX) return erreur(413, 'corps trop volumineux');
  let corps;
  try { corps = JSON.parse(o.corps); } catch { return erreur(400, 'corps illisible'); }
  const { sha256, plaque, dossier } = corps || {};
  if (typeof sha256 !== 'string' || !SHA.test(sha256)) return erreur(400, 'empreinte invalide');
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return erreur(400, 'plaque invalide');
  if (typeof dossier !== 'string' || !DOSSIER.test(dossier)) return erreur(400, 'dossier invalide');
  if (!(await o.stockage.lire(cheminMeta(plaque, sha256)))) return erreur(404, 'photo introuvable');

  const chemin = cheminReclamation(sha256);
  const etatEcriture = await o.stockage.ecrire(chemin, { version: 1, sha256, plaque, dossier, par: compte, recu: o.maintenant() });
  if (etatEcriture === 'cree') return reponse(200, { ok: true, sha256, dossier, deja: false });
  const existant = await o.stockage.lire(chemin);
  if (existant && existant.dossier === dossier) return reponse(200, { ok: true, sha256, dossier, deja: true });
  return reponse(409, { ok: false, erreur: 'déjà réclamée par un autre dossier', dossier: existant ? existant.dossier : null });
}

async function liberer(o) {
  const { sha256, dossier } = o.requete;
  if (typeof sha256 !== 'string' || !SHA.test(sha256)) return erreur(400, 'empreinte invalide');
  if (typeof dossier !== 'string' || !DOSSIER.test(dossier)) return erreur(400, 'dossier invalide');
  const chemin = cheminReclamation(sha256);
  const existant = await o.stockage.lire(chemin);
  if (!existant) return reponse(200, { ok: true, sha256, libre: true });
  if (existant.dossier !== dossier) return reponse(409, { ok: false, erreur: 'réclamée par un autre dossier', dossier: existant.dossier });
  await o.stockage.supprimer(chemin);
  return reponse(200, { ok: true, sha256, libre: true });
}

async function servir(o) {
  if (['PUT', 'GET', 'POST', 'DELETE'].indexOf(o.methode) < 0) {
    return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'PUT, GET, POST, DELETE' });
  }
  const vueEtat = o.methode === 'GET' && o.requete && o.requete.vue === 'etat';
  // Envoyer et consulter l'état d'avancement : tout compte ; le reste (images, réclamations) : la tablette seulement.
  const acces = o.methode === 'PUT' || vueEtat ? authentifier(o) : exigerLecteur(o);
  if (acces.refus) return acces.refus;
  try {
    if (o.methode === 'PUT') return await televerser(o, acces.compte);
    if (o.methode === 'POST') return await reclamer(o, acces.compte);
    if (o.methode === 'DELETE') return await liberer(o);
    if (vueEtat) return await etat(o);
    return o.requete.sha !== undefined ? await image(o) : await lister(o);
  } catch (e) {
    console.error('stockage', e && e.message);
    return erreur(500, 'stockage indisponible');
  }
}

module.exports = { servirPhotos: avecCors(servir), dimensionsJpeg, SLOTS, TAILLE_MAX };
