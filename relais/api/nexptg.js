// Point d'entrée Vercel : adaptation mince entre Request/Response et la logique testée de lib/recevoir.js.
import comptes from '../lib/comptes.js';
import recevoir from '../lib/recevoir.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

export default {
  async fetch(request) {
    const taille = Number(request.headers.get('content-length') || 0);
    if (taille > recevoir.TAILLE_MAX) return Response.json({ ok: false, erreur: 'corps trop volumineux' }, { status: 413 });

    const r = await recevoir.recevoirNexptg({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      corps: request.method === 'POST' ? await request.text() : '',
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      stockage,
      maintenant: Date.now,
    });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
