'use strict';
// Usage : node relais/scripts/creer-secret.js
// Génère le secret de signature des sessions (variable RELAIS_SECRET). À garder secret ; le changer déconnecte tout le monde.
const crypto = require('node:crypto');

console.log('RELAIS_SECRET (à saisir dans les variables d\'environnement du projet, Production) :');
console.log(crypto.randomBytes(48).toString('base64url'));
