/* Écran de prise de vue : vues guidées du véhicule, ou prise libre (NexPTG, complément). */
import { demarrer, choisirFichier } from './camera.js';
import { ajouter, vider } from './file.js';
import { compresser, depuisFichier } from './photo.js';
import { h, monter } from './dom.js';
import { manquants, progression, SORTIE_REQ } from './pur.mjs';

const TITRES = { entree: 'Photos d’entrée', sortie: 'Photos de sortie', mesures: 'Photos NexPTG', compl: 'Photos complémentaires' };

/* c : { qui, plaque, plaqueAffichee, phase, etat } ; retour() revient à l'accueil ; synchro(msg) notifie l'accueil. */
export async function ouvrirPrise(racine, c, retour, synchro) {
  const guide = c.phase === 'entree' || c.phase === 'sortie';
  const file = guide ? manquants(c.etat, c.phase) : [];
  const pris = new Set(((c.etat && c.etat.photos) || []).filter((p) => p.phase === c.phase && p.slot).map((p) => p.slot));
  let idx = 0, envoyees = 0, camera = null, occupe = false, natif = false, ferme = false;

  const video = h('video', { class: 'pv-video', playsinline: true, muted: true, autoplay: true });
  const titre = h('div', { class: 'pv-titre' });
  const sousTitre = h('div', { class: 'pv-sous' });
  const info = h('div', { class: 'pv-info', role: 'status' });
  const bande = h('div', { class: 'pv-bande' });
  const legende = h('input', { class: 'pv-legende', type: 'text', maxlength: '60', placeholder: 'Légende (ex. capot, zone repeinte)', autocomplete: 'off' });
  const declencheur = h('button', { class: 'pv-declencheur', 'aria-label': 'Prendre la photo', onclick: prendre });
  const passer = h('button', { class: 'btn', onclick: () => { idx++; majVue(); } }, 'Passer');
  const terminer = h('button', { class: 'btn', onclick: fin }, 'Terminer');

  function vueCourante() { return guide ? file[idx] || null : null; }

  function majVue() {
    const v = vueCourante();
    const p = progression({ photos: [...pris].map((slot) => ({ phase: c.phase, slot })) }, c.phase);
    titre.textContent = guide ? (v ? v.l : 'Toutes les vues demandées sont prises') : TITRES[c.phase];
    sousTitre.textContent = c.plaqueAffichee + ' · ' + TITRES[c.phase] + (guide ? ' · ' + p.pris + ' / ' + p.total + (c.phase === 'sortie' ? ' (minimum ' + SORTIE_REQ + ')' : '') : '');
    declencheur.disabled = guide && !v;
    passer.hidden = !guide || !v;
    legende.hidden = guide;
  }

  function arreterCamera() { if (camera) { camera.arreter(); camera = null; } }

  // La caméra ne reste allumée que sur cet écran et au premier plan : coupée en quittant, en arrière-plan, ou si elle démarre trop tard.
  async function lancerCamera() {
    try {
      const c2 = await demarrer(video);
      if (ferme || document.hidden) c2.arreter(); else camera = c2;
    } catch {
      natif = true;
      video.hidden = true;
      info.textContent = 'Caméra intégrée indisponible : chaque photo ouvrira l’appareil photo du téléphone.';
    }
  }
  async function surVisibilite() {
    if (ferme) return;
    if (document.hidden) arreterCamera();
    else if (!camera && !natif) await lancerCamera();
  }
  document.addEventListener('visibilitychange', surVisibilite);
  async function fin() {
    ferme = true;
    document.removeEventListener('visibilitychange', surVisibilite);
    arreterCamera();
    retour();
  }

  async function prendre() {
    if (occupe || (guide && !vueCourante())) return;
    occupe = true; declencheur.disabled = true;
    try {
      let source = video;
      if (natif) {
        const f = await choisirFichier(true);
        if (!f) return;
        source = await depuisFichier(f);
      }
      const v = vueCourante();
      const ts = Date.now();
      const label = guide ? v.l : legende.value.trim();
      const blob = await compresser(source, { plaque: c.plaque, ts, qui: c.qui, phase: c.phase });
      if (!blob) throw new Error('image');
      await ajouter({ plaque: c.plaque, phase: c.phase, slot: v ? v.k : null, label, prise: ts, blob, creeLe: ts });
      const miniature = h('img', { class: 'pv-mini', alt: label || 'Photo', src: URL.createObjectURL(blob) });
      bande.append(miniature); bande.scrollLeft = bande.scrollWidth;
      envoyees++;
      if (v) { pris.add(v.k); idx++; }
      if (!guide) legende.value = '';
      info.textContent = envoyees + ' photo' + (envoyees > 1 ? 's' : '') + ' enregistrée' + (envoyees > 1 ? 's' : '') + ' sur ce téléphone, envoi en cours';
      majVue();
      vider().then((r) => { synchro(r); if (r === 'ok') info.textContent = envoyees + ' photo' + (envoyees > 1 ? 's' : '') + ' envoyée' + (envoyees > 1 ? 's' : ''); else if (r === 'reseau') info.textContent = 'Réseau indisponible : les photos seront envoyées dès le retour de la connexion.'; });
      if (guide && !vueCourante()) { info.textContent = 'Toutes les vues demandées sont prises.'; }
    } catch { info.textContent = 'La photo n’a pas pu être prise, réessayer.'; }
    finally { occupe = false; majVue(); }
  }

  monter(racine, h('div', { class: 'prise' },
    h('div', { class: 'pv-tete' }, h('button', { class: 'btn', onclick: fin }, '← Accueil'), h('div', { class: 'pv-textes' }, titre, sousTitre)),
    h('div', { class: 'pv-cadre' }, video),
    info, legende, bande,
    h('div', { class: 'pv-actions' }, passer, declencheur, terminer)));
  majVue();

  await lancerCamera();
}
