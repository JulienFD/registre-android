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
// Au-delà, le PDF arrive en plusieurs parties (chacune sous cette limite) et est réassemblé ici.
const TAILLE_MAX = 4000000;
const TOTAL_MAX = 20000000;
const PARTIES_MAX = 8;
const ENVOI = /^[0-9a-f]{32}$/;
const MAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const ENVOIS_MAX = 5;
const PARTIES_VIE = 86400000;
const CORPS_MAX = 2048;

const cheminPdf = (id) => 'pdf/' + id + '.pdf';
const cheminMeta = (id) => 'pdf/' + id + '.json';
const dossierParties = (envoi) => 'pdf-parties/' + envoi + '/';
const cheminPartie = (envoi, n) => dossierParties(envoi) + String(n).padStart(2, '0') + '.bin';
const cheminEnvoi = (id, n) => 'pdf-envois/' + id + '/' + n + '.json';

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
  for (const c of await stockage.lister('pdf-envois/' + id + '/')) await stockage.supprimer(c);
}

// Ménage au dépôt : rien n'est conservé au-delà de l'expiration, même si le lien n'est jamais rouvert.
async function purger(o) {
  const chemins = (await o.stockage.lister('pdf/')).filter((c) => c.endsWith('.json'));
  for (const c of chemins) {
    const meta = await o.stockage.lire(c);
    if (meta && typeof meta.expire === 'number' && meta.expire < o.maintenant()) await supprimerLien(o.stockage, c.slice(4, -5));
  }
  // Parties abandonnées (envoi interrompu) : supprimées au bout d'un jour.
  const debuts = (await o.stockage.lister('pdf-parties/')).filter((c) => c.endsWith('/debut.json'));
  for (const c of debuts) {
    const d = await o.stockage.lire(c);
    if (d && typeof d.cree === 'number' && d.cree + PARTIES_VIE < o.maintenant()) await supprimerParties(o.stockage, c.slice(0, c.lastIndexOf('/') + 1));
  }
}

async function supprimerParties(stockage, dossier) {
  for (const c of await stockage.lister(dossier)) await stockage.supprimer(c);
}

async function enregistrer(o, compte, plaque, nom, octets) {
  if (!estPdf(octets)) return erreur(415, 'fichier PDF attendu');
  await purger(o);
  const id = crypto.randomBytes(32).toString('hex');
  const maintenant = o.maintenant();
  const meta = { version: 1, plaque: plaque, nom: nomSur(nom), par: compte, cree: maintenant, expire: maintenant + DUREE, taille: octets.length };
  // Le PDF d'abord : une fiche n'existe jamais sans son fichier.
  await o.stockage.ecrireOctets(cheminPdf(id), octets, 'application/pdf');
  await o.stockage.ecrire(cheminMeta(id), meta);
  return reponse(200, { ok: true, id: id, expire: meta.expire, taille: octets.length });
}

// Réassemble un envoi en plusieurs parties quand la dernière arrive.
async function assembler(o, q, compte) {
  const envoi = q.envoi, n = Number(q.partie), sur = Number(q.sur);
  if (!ENVOI.test(envoi) || !Number.isInteger(n) || !Number.isInteger(sur) || sur < 2 || sur > PARTIES_MAX || n < 1 || n > sur) {
    return erreur(400, 'parties invalides');
  }
  await o.stockage.ecrire(dossierParties(envoi) + 'debut.json', { cree: o.maintenant() });
  await o.stockage.ecrireOctets(cheminPartie(envoi, n), o.octets, 'application/octet-stream');
  if (n < sur) return reponse(200, { ok: true, recue: n });

  const morceaux = [];
  for (let i = 1; i <= sur; i++) {
    const m = await o.stockage.lireOctets(cheminPartie(envoi, i));
    if (!m) return erreur(409, 'parties manquantes');
    morceaux.push(m);
  }
  const total = morceaux.reduce((t, m) => t + m.length, 0);
  if (total > TOTAL_MAX) { await supprimerParties(o.stockage, dossierParties(envoi)); return erreur(413, 'pdf trop volumineux'); }
  const octets = new Uint8Array(total);
  let pos = 0;
  morceaux.forEach((m) => { octets.set(m, pos); pos += m.length; });
  const r = await enregistrer(o, compte, q.plaque, q.nom, octets);
  await supprimerParties(o.stockage, dossierParties(envoi));
  return r;
}

async function deposer(o, compte) {
  const q = o.requete || {};
  if (typeof q.plaque !== 'string' || !PLAQUE.test(q.plaque)) return erreur(400, 'plaque invalide');
  if (!(o.octets instanceof Uint8Array) || !o.octets.length) return erreur(400, 'pdf manquant');
  if (o.octets.length > TAILLE_MAX) return erreur(413, 'pdf trop volumineux');
  if (q.envoi !== undefined) return assembler(o, q, compte);
  return enregistrer(o, compte, q.plaque, q.nom, o.octets);
}

const plaqueLisible = (p) => (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) ? p.slice(0, 2) + '-' + p.slice(2, 5) + '-' + p.slice(5) : p);

// Envoie le mail avec le lien (et le PDF en pièce jointe si demandé). Le service de mail est injecté : jamais d'identifiants ici.
async function envoyerMail(o, compte) {
  if (Buffer.byteLength(o.corps || '') > CORPS_MAX) return erreur(413, 'corps trop volumineux');
  let corps;
  try { corps = JSON.parse(o.corps); } catch { return erreur(400, 'corps illisible'); }
  const { id, mail, joindre } = corps || {};
  if (typeof id !== 'string' || !ID.test(id)) return erreur(400, 'lien invalide');
  if (typeof mail !== 'string' || !MAIL.test(mail)) return erreur(400, 'adresse e-mail invalide');
  if (typeof o.envoyerMail !== 'function') return erreur(503, 'envoi de mail non configuré');
  const meta = await o.stockage.lire(cheminMeta(id));
  if (!meta) return erreur(404, 'lien introuvable');
  if (meta.expire < o.maintenant()) { await supprimerLien(o.stockage, id); return erreur(410, 'lien expiré'); }

  const deja = (await o.stockage.lister('pdf-envois/' + id + '/')).length;
  if (deja >= ENVOIS_MAX) return erreur(429, 'trop d\'envois pour ce lien');

  const message = {
    to: mail,
    subject: 'Votre dossier véhicule ' + plaqueLisible(meta.plaque),
    text: 'Bonjour,\n\nVotre dossier véhicule ' + plaqueLisible(meta.plaque) + ' est disponible en téléchargement :\n' +
      o.base + '/api/pdf?id=' + id + '\n\nCe lien est valable jusqu\'au ' + new Date(meta.expire).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) +
      '.\n' + (joindre === true ? 'Le PDF est aussi joint à ce message.\n' : '') + '\nCordialement',
  };
  if (joindre === true) {
    const octets = await o.stockage.lireOctets(cheminPdf(id));
    if (!octets) return erreur(404, 'lien introuvable');
    message.attachments = [{ filename: meta.nom, content: octets, contentType: 'application/pdf' }];
  }
  // Compté avant l'envoi : un échec répété ne contourne pas la limite.
  await o.stockage.ecrire(cheminEnvoi(id, deja + 1), { version: 1, par: compte, recu: o.maintenant(), joint: joindre === true });
  try {
    await o.envoyerMail(message);
  } catch (e) {
    console.error('mail', e && e.code);
    return erreur(502, 'envoi du mail impossible');
  }
  return reponse(200, { ok: true, envoye: true, joint: joindre === true });
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
  if (['PUT', 'GET', 'POST'].indexOf(o.methode) < 0) return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'PUT, GET, POST' });
  try {
    if (o.methode === 'GET') return await telecharger(o);
    const acces = exigerLecteur(o);
    if (acces.refus) return acces.refus;
    return o.methode === 'POST' ? await envoyerMail(o, acces.compte) : await deposer(o, acces.compte);
  } catch (e) {
    console.error('stockage', e && e.message);
    return erreur(500, 'stockage indisponible');
  }
}

module.exports = { servirPdf: avecCors(servir), TAILLE_MAX, TOTAL_MAX, DUREE };
