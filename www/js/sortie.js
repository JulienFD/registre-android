import { VV, flush, fmtPlate, hist, save, toast } from './core.js';
import { client } from './envoi-pdf.js';
import { askPin } from './pin.js';
import { renderSheet } from './sheet.js';

/* Sortie d'un véhicule et relais : le relais supprime photos et rapports 7 jours après la sortie signalée.
   Sans effet si le relais est injoignable ou non configuré : rien ne doit bloquer le dossier. */
export async function signalerSortie(plaque) {
  try { var c = await client(); if (c) await c.signalerSortie(plaque) } catch (e) { /* purge manuelle possible */ }
}

/* Annule la sortie (code PIN) : le relais ne purge plus rien, puis le dossier repasse en atelier. Valider de nouveau la sortie repart de 7 jours.
   Relais configuré mais injoignable : rien ne change, sinon la purge programmée resterait active malgré l'annulation. */
export async function sortieAnnuler() {
  var v = VV(); if (!v || v.statut !== 'sorti') return;
  var pin = await askPin('Code PIN propriétaire', 'Annuler la sortie du dossier ' + fmtPlate(v.plaque)); if (!pin) return;
  var c = await client();
  if (c) {
    try { await c.annulerSortie(v.plaque) } catch (e) { toast('Annulation impossible : ' + (e && e.code ? window.Relais.messageErreur(e) : 'relais injoignable') + '. Réessayer avec le réseau.'); return }
  }
  await flush();
  await save({ statut: 'atelier', sortieAt: 0, hist: hist(v, 'Sortie annulée : le dossier repasse en atelier', 'Propriétaire (code PIN)') });
  renderSheet(true);
  toast('Sortie annulée');
}
