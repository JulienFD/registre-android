'use strict';
// Usage : node relais/scripts/creer-compte.js <nom>
// Génère un mot de passe aléatoire (à saisir dans NexPTG) et l'entrée à ajouter à RELAIS_COMPTES.
const crypto = require('node:crypto');
const { creerCompte } = require('../lib/comptes.js');

const nom = process.argv[2];
if (!nom) {
  console.error('Usage : node relais/scripts/creer-compte.js <nom>');
  process.exit(1);
}

const motDePasse = crypto.randomBytes(18).toString('base64url');
console.log('Compte         : ' + nom);
console.log('Mot de passe   : ' + motDePasse + '   (à saisir dans NexPTG, non conservé)');
console.log('À ajouter dans RELAIS_COMPTES (séparer les comptes par « ; ») :');
console.log(creerCompte(nom, motDePasse));
