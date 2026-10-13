// Point d'entrée Vercel : liste des techniciens (comptes d'envoi), pour le sélecteur « Qui mesure ? » du Registre.
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import lecture from '../lib/lecture.js';

export default {
  async fetch(request) {
    const r = await lecture.servirTechniciens({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
