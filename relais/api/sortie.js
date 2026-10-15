// Point d'entrée Vercel des sorties : adaptation mince entre Request/Response et lib/sortie.js (testée).
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import secret from '../lib/secret.js';
import sortie from '../lib/sortie.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

export default {
  async fetch(request) {
    const requete = Object.fromEntries(new URL(request.url).searchParams);
    const r = await sortie.servirSortie({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      requete,
      corps: request.method === 'POST' ? await request.text() : '',
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      secret: await secret.obtenirSecret(stockage, process.env.RELAIS_SECRET).catch((e) => { console.error('secret', e && e.message); return undefined; }),
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
      stockage,
      maintenant: Date.now,
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
