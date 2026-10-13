// Point d'entrée Vercel : liste des techniciens (comptes d'envoi), pour le sélecteur « Qui mesure ? » du Registre.
import comptes from '../lib/comptes.js';
import lecture from '../lib/lecture.js';

export default {
  async fetch(request) {
    const r = await lecture.servirTechniciens({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
    });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
