'use strict';
// Configuration du service de mail (SMTP) à partir de variables d'environnement Vercel. Jamais d'identifiants dans le dépôt.

// Renvoie { host, port, secure, user, pass, from }, ou null si la configuration est absente ou incomplète.
function lireConfigSmtp(env) {
  const e = env || {};
  const host = String(e.SMTP_HOST || '').trim();
  const user = String(e.SMTP_USER || '').trim();
  const pass = String(e.SMTP_PASS || '');
  const from = String(e.SMTP_FROM || '').trim();
  const port = Number(e.SMTP_PORT) || 587;
  if (!/^[A-Za-z0-9.-]{3,253}$/.test(host) || !user || !pass || !from || /[\r\n]/.test(from) || port < 1 || port > 65535) return null;
  return { host, port, secure: port === 465, user, pass, from };
}

module.exports = { lireConfigSmtp };
