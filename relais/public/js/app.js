/* PWA photos : connexion, choix de la plaque et du type de photos, file d'envoi. */
import { lireAuth, ecrireAuth, effacerAuth, etat } from './api.js';
import { lister, vider } from './file.js';
import { h, monter } from './dom.js';
import { ouvrirPrise } from './prise.js';
import { normPlaque, plaqueValide } from './pur.mjs';

const racine = document.getElementById('app');
let auth = lireAuth();
let attente = { n: 0, rejetees: 0 };

async function compterFile() {
  try { const l = await lister(); attente = { n: l.filter((p) => !p.rejetee).length, rejetees: l.filter((p) => p.rejetee).length }; } catch { /* file illisible : affichage sans compteur */ }
}

function ecranConnexion(message) {
  const compte = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', required: true });
  const mdp = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const erreur = h('p', { class: 'erreur', role: 'alert' }, message || '');
  const form = h('form', { class: 'carte', onsubmit: async (e) => {
    e.preventDefault();
    erreur.textContent = 'Vérification…';
    const a = { compte: compte.value.trim(), mdp: mdp.value };
    const r = await etat(a, 'AA000AA');
    if (r.statut === 200) { auth = a; ecrireAuth(a); accueil(); }
    else erreur.textContent = r.statut === 401 ? 'Identifiants refusés.' : r.statut === 0 ? 'Relais injoignable : vérifier la connexion.' : 'Le relais est indisponible.';
  } },
  h('h1', {}, 'Photos du dossier'),
  h('label', {}, h('span', {}, 'Compte'), compte),
  h('label', {}, h('span', {}, 'Mot de passe'), mdp),
  erreur,
  h('button', { class: 'btn pri', type: 'submit' }, 'Se connecter'));
  monter(racine, form);
}

async function accueil() {
  await compterFile();
  const plaque = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'AB-123-CD', 'aria-label': 'Plaque d’immatriculation', maxlength: '12' });
  const message = h('p', { class: 'erreur', role: 'alert' });
  const lancer = (phase) => async () => {
    const p = normPlaque(plaque.value);
    if (!plaqueValide(p)) { message.textContent = 'Saisir une plaque valide.'; return; }
    message.textContent = '';
    const guide = phase === 'entree' || phase === 'sortie';
    let e = null;
    if (guide) {
      const r = await etat(auth, p);
      if (r.statut === 401) { effacerAuth(); auth = null; ecranConnexion('Identifiants à ressaisir.'); return; }
      e = r.statut === 200 ? r.json : null;
      if (r.statut !== 200) message.textContent = 'État des photos indisponible : toutes les vues seront proposées.';
    }
    ouvrirPrise(racine, { auth, plaque: p, plaqueAffichee: plaque.value.trim().toUpperCase() || p, phase, etat: e }, accueil, () => compterFile());
  };
  const bouton = (texte, phase, pri) => h('button', { class: 'btn' + (pri ? ' pri' : ''), onclick: lancer(phase) }, texte);
  monter(racine, h('div', { class: 'carte' },
    h('div', { class: 'ligne' }, h('h1', {}, 'Photos du dossier'), h('button', { class: 'btn sm', onclick: () => { effacerAuth(); auth = null; ecranConnexion(); } }, 'Quitter')),
    h('p', { class: 'hint' }, 'Connecté : ' + auth.compte),
    h('label', {}, h('span', {}, 'Plaque du véhicule'), plaque),
    message,
    h('h2', {}, 'Photos du véhicule'),
    h('div', { class: 'grille' }, bouton('Entrée', 'entree', true), bouton('Sortie', 'sortie', true)),
    h('h2', {}, 'Photos libres'),
    h('div', { class: 'grille' }, bouton('NexPTG', 'mesures'), bouton('Complément', 'compl')),
    attente.n || attente.rejetees ? h('div', { class: 'file' },
      attente.n ? h('p', {}, attente.n + ' photo' + (attente.n > 1 ? 's' : '') + ' en attente d’envoi.') : null,
      attente.rejetees ? h('p', { class: 'erreur' }, attente.rejetees + ' photo' + (attente.rejetees > 1 ? 's refusées' : ' refusée') + ' par le relais.') : null,
      attente.n ? h('button', { class: 'btn', onclick: async () => { const r = await vider(auth); if (r === 'connexion') { effacerAuth(); auth = null; ecranConnexion('Identifiants à ressaisir.'); } else accueil(); } }, 'Envoyer maintenant') : null) : null));
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* hors ligne non disponible */ });
window.addEventListener('online', () => { if (auth) vider(auth).then(compterFile); });

if (auth) accueil(); else ecranConnexion();
