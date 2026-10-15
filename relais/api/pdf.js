// Point d'entrée Vercel des PDF clients : adaptation mince entre Request/Response et lib/pdf.js (testée).
import nodemailer from 'nodemailer';
import comptes from '../lib/comptes.js';
import cors from '../lib/cors.js';
import mail from '../lib/mail.js';
import pdf from '../lib/pdf.js';
import blob from '../lib/stockage-blob.js';

const stockage = blob.stockageBlob();

// Non couvert par les tests : réseau et identifiants SMTP requis. Absent si le service de mail n'est pas configuré.
function serviceMail() {
  const conf = mail.lireConfigSmtp(process.env);
  if (!conf) return undefined;
  const transport = nodemailer.createTransport({ host: conf.host, port: conf.port, secure: conf.secure, auth: { user: conf.user, pass: conf.pass } });
  return (message) => transport.sendMail({ from: conf.from, ...message });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'PUT' && Number(request.headers.get('content-length') || 0) > pdf.TAILLE_MAX) {
      return Response.json({ ok: false, erreur: 'pdf trop volumineux' }, { status: 413 });
    }
    const r = await pdf.servirPdf({
      methode: request.method,
      authorization: request.headers.get('authorization'),
      origine: request.headers.get('origin'),
      origines: cors.lireOrigines(process.env.RELAIS_ORIGINES),
      requete: Object.fromEntries(url.searchParams),
      corps: request.method === 'POST' ? await request.text() : '',
      octets: request.method === 'PUT' ? new Uint8Array(await request.arrayBuffer()) : undefined,
      comptes: comptes.lireComptes(process.env.RELAIS_COMPTES),
      lecteurs: comptes.lireLecteurs(process.env.RELAIS_LECTEURS),
      envoyerMail: serviceMail(),
      base: url.origin,
      stockage,
      maintenant: Date.now,
    });
    if (r.statut === 204) return new Response(null, { status: 204, headers: r.entetes });
    if (r.octets) return new Response(r.octets, { status: r.statut, headers: r.entetes });
    return Response.json(r.json, { status: r.statut, headers: r.entetes });
  },
};
