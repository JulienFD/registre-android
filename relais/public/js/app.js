/* PWA photos : connexion, choix de la plaque et du type de photos, file d'envoi. */
import { compteCourant, etat, lireSession, migrerAncienneConnexion, ouvrirSession, quitter } from './api.js';
import { lister, vider } from './file.js';
import { h, monter } from './dom.js';
import { ouvrirPrise } from './prise.js';
import { normPlaque, plaqueValide } from './pur.mjs';

const racine = document.getElementById('app');
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
    erreur.textContent = 'Connexion…';
    // Le mot de passe sert une seule fois : il n'est jamais conservé, seule la session l'est.
    const statut = await ouvrirSession(compte.value.trim(), mdp.value);
    mdp.value = '';
    if (statut === 200) accueil();
    else erreur.textContent = statut === 401 ? 'Identifiants refusés.' : statut === 0 ? 'Relais injoignable : vérifier la connexion.'
      : statut === 503 ? 'Le relais n’est pas configuré pour les sessions (variable RELAIS_SECRET).' : 'Le relais est indisponible.';
  } },
  h('h1', {}, 'Photos du dossier'),
  h('label', {}, h('span', {}, 'Compte'), compte),
  h('label', {}, h('span', {}, 'Mot de passe'), mdp),
  erreur,
  h('button', { class: 'btn pri', type: 'submit' }, 'Se connecter'),
  // Uniquement sur la machine de développement (npm run dev) : le compte réel n'y existe pas.
  ['localhost', '127.0.0.1'].indexOf(location.hostname) > -1 ? h('p', { class: 'hint' }, 'Développement local : compte « demo », mot de passe « demo-demo-demo ».') : null);
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
      const r = await etat(p);
      if (r.statut === 401) { ecranConnexion('Session terminée : se reconnecter.'); return; }
      e = r.statut === 200 ? r.json : null;
      if (r.statut !== 200) message.textContent = 'État des photos indisponible : toutes les vues seront proposées.';
    }
    ouvrirPrise(racine, { qui: compteCourant(), plaque: p, plaqueAffichee: plaque.value.trim().toUpperCase() || p, phase, etat: e }, accueil, () => compterFile());
  };
  const bouton = (texte, phase, pri) => h('button', { class: 'btn' + (pri ? ' pri' : ''), onclick: lancer(phase) }, texte);
  monter(racine, h('div', { class: 'carte' },
    h('div', { class: 'ligne' }, h('h1', {}, 'Photos du dossier'), h('button', { class: 'btn sm', onclick: async () => { await quitter(); ecranConnexion(); } }, 'Quitter')),
    h('p', { class: 'hint' }, 'Connecté : ' + compteCourant()),
    h('label', {}, h('span', {}, 'Plaque du véhicule'), plaque),
    message,
    h('h2', {}, 'Photos du véhicule'),
    h('div', { class: 'grille' }, bouton('Entrée', 'entree', true), bouton('Sortie', 'sortie', true)),
    h('h2', {}, 'Photos libres'),
    h('div', { class: 'grille' }, bouton('NexPTG', 'mesures'), bouton('Complément', 'compl')),
    attente.n || attente.rejetees ? h('div', { class: 'file' },
      attente.n ? h('p', {}, attente.n + ' photo' + (attente.n > 1 ? 's' : '') + ' en attente d’envoi.') : null,
      attente.rejetees ? h('p', { class: 'erreur' }, attente.rejetees + ' photo' + (attente.rejetees > 1 ? 's refusées' : ' refusée') + ' par le relais.') : null,
      attente.n ? h('button', { class: 'btn', onclick: async () => { const r = await vider(); if (r === 'connexion') ecranConnexion('Session terminée : se reconnecter.'); else accueil(); } }, 'Envoyer maintenant') : null) : null));
}

// Pas de service worker en développement local (npm run dev ne le sert pas : il livrerait des fichiers périmés).
if ('serviceWorker' in navigator && ['localhost', '127.0.0.1'].indexOf(location.hostname) < 0) navigator.serviceWorker.register('/sw.js').catch(() => { /* hors ligne non disponible */ });
window.addEventListener('online', () => { if (lireSession()) vider().then(compterFile); });

migrerAncienneConnexion().then(() => { if (lireSession()) accueil(); else ecranConnexion(); });
