// Point d'entrée Vercel des PDF clients : adaptation mince entre Request/Response et lib/pdf.js (testée).
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import pdf from '../lib/pdf.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

export default {
  async fetch(request) {
    if (request.method === 'PUT' && Number(request.headers.get('content-length') || 0) > pdf.TAILLE_MAX) {
      return Response.json({ ok: false, erreur: 'pdf trop volumineux' }, { status: 413 });
    }
    const r = await pdf.servirPdf({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      requete: Object.fromEntries(new URL(request.url).searchParams),
      octets: request.method === 'PUT' ? new Uint8Array(await request.arrayBuffer()) : undefined,
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
      stockage,
      maintenant: Date.now,
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    if (r.octets) return new Response(r.octets, { status: r.statut, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
