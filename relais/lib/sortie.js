'use strict';
// Sortie d'un véhicule : la tablette la signale, le relais supprime ses photos et ses rapports 7 jours plus tard
// (ils sont alors dans le PDF du dossier). Le ménage se fait au passage d'une sortie, comme pour les PDF.
const { reponse, exigerLecteur } = require('./acces.js');
const { avecCors } = require('./cors.js');
const { cheminReclamationPhoto } = require('./photos.js');
const { cheminReclamationRapport } = require('./lecture.js');

const PLAQUE = /^[A-Z0-9]{2,15}$/;
const DELAI = 7 * 86400000;
const CORPS_MAX = 1024;

const cheminSortie = (plaque) => 'sorties/' + plaque + '.json';

async function supprimerPlaque(stockage, plaque) {
  for (const c of await stockage.lister('photos/' + plaque + '/')) {
    await stockage.supprimer(c);
    if (c.endsWith('.json')) await stockage.supprimer(cheminReclamationPhoto(c.slice(c.lastIndexOf('/') + 1, -5)));
  }
  for (const c of await stockage.lister('rapports/' + plaque + '/')) {
    const rapport = await stockage.lire(c);
    if (rapport && typeof rapport.cle === 'string') await stockage.supprimer(cheminReclamationRapport(rapport.cle));
    await stockage.supprimer(c);
  }
}

// Le marqueur part en dernier : une purge interrompue est reprise à la sortie suivante.
async function purger(o) {
  for (const c of await o.stockage.lister('sorties/')) {
    const marque = await o.stockage.lire(c);
    if (!marque || typeof marque.sortie !== 'number' || marque.sortie + DELAI >= o.maintenant()) continue;
    if (!PLAQUE.test(marque.plaque)) continue;
    await supprimerPlaque(o.stockage, marque.plaque);
    await o.stockage.supprimer(c);
  }
}

async function signaler(o) {
  if (Buffer.byteLength(o.corps || '') > CORPS_MAX) return reponse(413, { ok: false, erreur: 'corps trop volumineux' });
  let corps;
  try { corps = JSON.parse(o.corps); } catch { return reponse(400, { ok: false, erreur: 'corps illisible' }); }
  const plaque = corps && corps.plaque;
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return reponse(400, { ok: false, erreur: 'plaque invalide' });

  // Une nouvelle sortie repart de la date du jour : l'ancien marqueur est remplacé.
  await o.stockage.supprimer(cheminSortie(plaque));
  await o.stockage.ecrire(cheminSortie(plaque), { version: 1, plaque, sortie: o.maintenant() });
  await purger(o);
  return reponse(200, { ok: true, plaque });
}

// Sortie annulée : le marqueur disparaît, rien ne sera purgé. Une nouvelle sortie repartira de 7 jours.
async function annuler(o) {
  const plaque = o.requete && o.requete.plaque;
  if (typeof plaque !== 'string' || !PLAQUE.test(plaque)) return reponse(400, { ok: false, erreur: 'plaque invalide' });
  await o.stockage.supprimer(cheminSortie(plaque));
  return reponse(200, { ok: true, plaque });
}

async function servir(o) {
  if (o.methode !== 'POST' && o.methode !== 'DELETE') return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'POST, DELETE' });
  const acces = exigerLecteur(o);
  if (acces.refus) return acces.refus;
  try {
    return o.methode === 'DELETE' ? await annuler(o) : await signaler(o);
  } catch (e) {
    console.error('stockage', e && e.message);
    return reponse(500, { ok: false, erreur: 'stockage indisponible' });
  }
}

module.exports = { servirSortie: avecCors(servir), purger, DELAI };
