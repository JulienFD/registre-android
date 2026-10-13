// Point d'entrée Vercel de la lecture : adaptation mince entre Request/Response et lib/lecture.js (testée).
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import lecture from '../lib/lecture.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

export default {
  async fetch(request) {
    const requete = Object.fromEntries(new URL(request.url).searchParams);
    const r = await lecture.servirRapports({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      requete,
      corps: request.method === 'POST' ? await request.text() : '',
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      secret: process.env.RELAIS_SECRET,
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
      stockage,
      maintenant: Date.now,
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
