// Point d'entrée Vercel des sessions : adaptation mince entre Request/Response et lib/session.js (testée).
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import secret from '../lib/secret.js';
import session from '../lib/session.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

export default {
  async fetch(request) {
    const r = await session.servirSession({
      methode: request.method,
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      requete: Object.fromEntries(new URL(request.url).searchParams),
      corps: request.method === 'POST' ? await request.text() : '',
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      secret: await secret.obtenirSecret(stockage, process.env.RELAIS_SECRET).catch((e) => { console.error('secret', e && e.message); return undefined; }),
      stockage,
      maintenant: Date.now,
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
