'use strict';
// Serveur de développement de la PWA photos : npm run dev
// Sert relais/public avec les en-têtes de vercel.json et exécute le VRAI code du relais pour /api/photos,
// avec un stockage en mémoire (aucun compte Vercel ni Blob). Écoute sur 127.0.0.1 uniquement.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { creerCompte, lireComptes } = require('../relais/lib/comptes.js');
const { servirPhotos, TAILLE_MAX } = require('../relais/lib/photos.js');
const { servirSession } = require('../relais/lib/session.js');
const crypto = require('node:crypto');

const RACINE = path.join(__dirname, '..', 'relais', 'public');
const COMPTE_DEMO = 'demo';
const MDP_DEMO = 'demo-demo-demo';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
};

// Mêmes en-têtes qu'en production (CSP stricte comprise), lus dans vercel.json.
function enteteProduction() {
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'relais', 'vercel.json'), 'utf8'));
  const tous = conf.headers.filter((h) => h.source === '/(.*)')[0];
  return Object.fromEntries(tous.headers.map((h) => [h.key, h.value]));
}

function stockageMemoire() {
  const blobs = new Map();
  return {
    async ecrire(c, o) { if (blobs.has(c)) return 'existe'; blobs.set(c, o); return 'cree'; },
    async ecrireOctets(c, o) { if (blobs.has(c)) return 'existe'; blobs.set(c, o); return 'cree'; },
    async lister(p) { return [...blobs.keys()].filter((c) => c.startsWith(p)).sort(); },
    async lire(c) { return blobs.has(c) && !(blobs.get(c) instanceof Uint8Array) ? blobs.get(c) : null; },
    async lireOctets(c) { return blobs.has(c) && blobs.get(c) instanceof Uint8Array ? blobs.get(c) : null; },
    async supprimer(c) { blobs.delete(c); },
  };
}

function lireCorps(req) {
  return new Promise((res, rej) => {
    const morceaux = [];
    let n = 0;
    req.on('data', (m) => { n += m.length; if (n > TAILLE_MAX + 1024) { req.destroy(); rej(new Error('trop gros')); } else morceaux.push(m); });
    req.on('end', () => res(Buffer.concat(morceaux)));
    req.on('error', rej);
  });
}

function creerServeur() {
  const comptes = lireComptes(creerCompte(COMPTE_DEMO, MDP_DEMO));
  const lecteurs = new Set([COMPTE_DEMO]);
  const stockage = stockageMemoire();
  const entetes = enteteProduction();
  const secret = crypto.randomBytes(48).toString('base64url'); // propre à ce serveur : les sessions meurent avec lui

  async function api(req, res, url) {
    const brut = ['PUT', 'POST'].includes(req.method) ? await lireCorps(req) : Buffer.alloc(0);
    const r = await servirPhotos({
      methode: req.method, authorization: req.headers.authorization, origine: req.headers.origin,
      requete: Object.fromEntries(url.searchParams), corps: req.method === 'POST' ? brut.toString('utf8') : '',
      octets: req.method === 'PUT' ? new Uint8Array(brut) : undefined,
      comptes, lecteurs, stockage, secret, maintenant: Date.now,
    });
    if (req.method === 'PUT') console.log('[photo] ' + url.searchParams.get('plaque') + ' ' + url.searchParams.get('phase') + ' ' + (url.searchParams.get('slot') || '-') + ' → ' + r.statut);
    res.writeHead(r.statut, r.octets ? r.entetes : Object.assign({ 'Content-Type': 'application/json' }, r.entetes));
    res.end(r.octets ? Buffer.from(r.octets) : r.statut === 204 ? undefined : JSON.stringify(r.json));
  }

  async function sessions(req, res, url) {
    const brut = req.method === 'POST' ? (await lireCorps(req)).toString('utf8') : '';
    const r = await servirSession({
      methode: req.method, origine: req.headers.origin, requete: Object.fromEntries(url.searchParams), corps: brut,
      comptes, stockage, secret, maintenant: Date.now,
    });
    res.writeHead(r.statut, Object.assign({ 'Content-Type': 'application/json' }, r.entetes));
    res.end(r.statut === 204 ? undefined : JSON.stringify(r.json));
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/photos') return await api(req, res, url);
      if (url.pathname === '/api/session') return await sessions(req, res, url);
      // Pas de service worker en développement : il servirait des fichiers périmés.
      if (url.pathname === '/sw.js') { res.writeHead(404); return res.end('service worker désactivé en développement'); }
      const demande = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const fichier = path.join(RACINE, demande);
      if (fichier !== RACINE && !fichier.startsWith(RACINE + path.sep)) { res.writeHead(404); return res.end('introuvable'); }
      if (!fs.existsSync(fichier) || !fs.statSync(fichier).isFile()) { res.writeHead(404); return res.end('introuvable'); }
      res.writeHead(200, Object.assign({ 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, entetes));
      return res.end(fs.readFileSync(fichier));
    } catch (erreur) {
      console.error('[dev] ' + (erreur && erreur.message));
      res.writeHead(500); return res.end('erreur');
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  creerServeur().listen(port, '127.0.0.1', () => {
    console.log('PWA photos : http://localhost:' + port + '/');
    console.log('Connexion de démonstration : compte « ' + COMPTE_DEMO + ' », mot de passe « ' + MDP_DEMO + ' »');
    console.log('Stockage en mémoire : les photos disparaissent à l\'arrêt. Ctrl+C pour arrêter.');
  });
}

module.exports = { creerServeur, COMPTE_DEMO, MDP_DEMO };
