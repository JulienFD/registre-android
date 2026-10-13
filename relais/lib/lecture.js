'use strict';
// Lecture des rapports par la tablette : lister par plaque, réclamer pour un dossier, libérer.
const crypto = require('node:crypto');
const { verifierBasic } = require('./comptes.js');

const PLAQUE = /^(?:[A-Z0-9]{2,15}|_sans-plaque)$/;
const DOSSIER = /^[A-Za-z0-9_-]{1,64}$/;
const CLE_MAX = 300;
const CORPS_MAX = 4096;
const SANS_CACHE = { 'Cache-Control': 'private, no-store' };

const empreinte = (texte) => crypto.createHash('sha256').update(texte).digest('hex');
const cheminReclamation = (cle) => 'reclamations/' + empreinte(cle) + '.json';
const reponse = (statut, json, entetes) => ({ statut, json, entetes: Object.assign({}, SANS_CACHE, entetes) });

// Regroupe les versions par identité de rapport ; la plus récemment reçue passe en tête.
async function chargerRapports(stockage, plaque) {
  const chemins = await stockage.lister('rapports/' + plaque + '/');
  const blobs = await Promise.all(chemins.map((c) => stockage.lire(c)));
  const groupes = new Map();
  blobs.forEach((b) => {
    if (!b || typeof b.cle !== 'string') return;
    if (!groupes.has(b.cle)) groupes.set(b.cle, []);
    groupes.get(b.cle).push(b);
  });
  groupes.forEach((versions) => versions.sort((a, b) => (b.recu - a.recu) || (a.sha256 < b.sha256 ? -1 : 1)));
  return groupes;
}

async function lister(o, plaque, par) {
  const groupes = await chargerRapports(o.stockage, plaque);
  const rapports = [];
  for (const versions of groupes.values()) {
    const dernier = versions[0];
    if (par && dernier.par !== par) continue;
    const r = await o.stockage.lire(cheminReclamation(dernier.cle));
    rapports.push({
      cle: dernier.cle, plaque: dernier.plaque, par: dernier.par, recu: dernier.recu, sha256: dernier.sha256,
      avertissements: dernier.avertissements, brut: dernier.brut,
      versions: versions.map((v) => ({ sha256: v.sha256, recu: v.recu, par: v.par })),
      reclame: r ? { dossier: r.dossier, par: r.par, recu: r.recu } : null,
    });
  }
  rapports.sort((a, b) => b.recu - a.recu);
  return reponse(200, { ok: true, plaque, rapports });
}

async function reclamer(o, compte) {
  let corps;
  try { corps = JSON.parse(o.corps); } catch { return reponse(400, { ok: false, erreur: 'corps illisible' }); }
  const { cle, plaque, dossier } = corps || {};
  if (typeof cle !== 'string' || !cle || cle.length > CLE_MAX) return reponse(400, { ok: false, erreur: 'cle invalide' });
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return reponse(400, { ok: false, erreur: 'plaque invalide' });
  if (typeof dossier !== 'string' || !DOSSIER.test(dossier)) return reponse(400, { ok: false, erreur: 'dossier invalide' });

  // Rien ne s'écrit pour un rapport inexistant : une réclamation ne peut pas servir à remplir le stockage.
  const groupes = await chargerRapports(o.stockage, plaque);
  if (!groupes.has(cle)) return reponse(404, { ok: false, erreur: 'rapport introuvable' });

  const chemin = cheminReclamation(cle);
  const enregistrement = { version: 1, cle, plaque, dossier, par: compte, recu: o.maintenant() };
  const etat = await o.stockage.ecrire(chemin, enregistrement);
  if (etat === 'cree') return reponse(200, { ok: true, cle, dossier, deja: false });

  const existant = await o.stockage.lire(chemin);
  if (existant && existant.dossier === dossier) return reponse(200, { ok: true, cle, dossier, deja: true });
  return reponse(409, { ok: false, erreur: 'déjà réclamé par un autre dossier', dossier: existant ? existant.dossier : null });
}

async function liberer(o) {
  const { cle, dossier } = o.requete;
  if (typeof cle !== 'string' || !cle || cle.length > CLE_MAX) return reponse(400, { ok: false, erreur: 'cle invalide' });
  if (typeof dossier !== 'string' || !DOSSIER.test(dossier)) return reponse(400, { ok: false, erreur: 'dossier invalide' });

  const chemin = cheminReclamation(cle);
  const existant = await o.stockage.lire(chemin);
  if (!existant) return reponse(200, { ok: true, cle, libre: true });
  if (existant.dossier !== dossier) return reponse(409, { ok: false, erreur: 'réclamé par un autre dossier', dossier: existant.dossier });
  await o.stockage.supprimer(chemin);
  return reponse(200, { ok: true, cle, libre: true });
}

async function servirRapports(o) {
  if (!['GET', 'POST', 'DELETE'].includes(o.methode)) {
    return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'GET, POST, DELETE' });
  }
  const compte = verifierBasic(o.authorization, o.comptes);
  if (!compte) {
    return reponse(401, { ok: false, erreur: 'authentification requise' }, { 'WWW-Authenticate': 'Basic realm="relais", charset="UTF-8"' });
  }
  if (!o.lecteurs.has(compte)) return reponse(403, { ok: false, erreur: 'accès en lecture non autorisé' });

  const corps = typeof o.corps === 'string' ? o.corps : '';
  if (Buffer.byteLength(corps) > CORPS_MAX) return reponse(413, { ok: false, erreur: 'corps trop volumineux' });

  try {
    if (o.methode === 'POST') return await reclamer(Object.assign({}, o, { corps }), compte);
    if (o.methode === 'DELETE') return await liberer(o);
    const { plaque, par } = o.requete || {};
    if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return reponse(400, { ok: false, erreur: 'plaque invalide' });
    return await lister(o, plaque, typeof par === 'string' ? par : '');
  } catch (e) {
    console.error('stockage', e && e.message);
    return reponse(500, { ok: false, erreur: 'stockage indisponible' });
  }
}

module.exports = { servirRapports };
