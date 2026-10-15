import { $, S, VV, api, esc, fmtDT, hist, save, toast } from './core.js';
import { modalShow } from './pin.js';
import { makePdf } from './pdf.js';
import { renderSheet } from './sheet.js';

/* Envoi du PDF au client : la tablette le dépose sur le relais, qui renvoie un lien secret à durée limitée ; le lien part par mail. */
var R = window.Relais;
var envoi = { lien: '', mail: '', plaque: '', expire: 0 };
var MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function client() {
  var conf = await api.relaisConf();
  if (!conf || !conf.url || !conf.compte || !conf.motDePasse) return null;
  try { return R.creerClient(conf) } catch (e) { return null }
}

export function envoiOuvrir() {
  var v = VV(); if (!v || !S.cur) return;
  modalShow('<h2>Envoyer le PDF au client</h2>' +
    '<p class="hint">Le PDF est déposé sur le serveur ; le client reçoit un lien de téléchargement valable 30 jours.</p>' +
    '<label class="fld"><span>E-mail du client <em>*</em></span><input id="env-mail" type="email" autocomplete="off" value="' + esc(v.clientMail || '') + '"></label>' +
    '<div class="mrow2"><button class="btn pri" data-act="envoiPdf" data-mode="entree">PDF d’entrée</button><button class="btn pri" data-act="envoiPdf" data-mode="full">PDF complet</button></div>' +
    '<div class="mrow2"><button class="btn" data-act="closemodal">Annuler</button></div>');
}

/* PDF d'entrée : l'exemplaire archivé à la validation est celui qu'on envoie. PDF complet : toujours régénéré. */
async function octets(v, mode) {
  var dernier = (v.arch || []).filter(function (a) { return a.mode === mode }).pop();
  if (mode === 'entree' && dernier) return { nom: dernier.rel.split('/').pop(), bytes: await api.lireArchive(dernier.rel) };
  var r = await makePdf(mode, true);
  return r ? { nom: r.rel.split('/').pop(), bytes: await api.lireArchive(r.rel) } : null;
}

export async function envoiPdf(mode) {
  var v = VV(); if (!v || !S.cur) return;
  var champ = $('#env-mail'), mail = champ ? champ.value.trim() : '';
  if (!MAIL.test(mail)) { toast('Saisir une adresse e-mail valide'); return }
  var c = await client();
  if (!c) { toast('Relais non configuré : Réglages, section Relais NexPTG'); return }
  toast('Préparation du PDF…');
  try {
    var f = await octets(v, mode === 'full' ? 'full' : 'entree');
    if (!f) return;
    var r = await c.deposerPdf(v.plaque, f.nom, f.bytes);
    envoi = { lien: r.lien, mail: mail, plaque: v.plaque, expire: r.expire };
    if (v.clientMail !== mail) save({ clientMail: mail });
    save({ hist: hist(v, (mode === 'full' ? 'PDF complet' : 'PDF d’entrée') + ' déposé pour le client (lien valable jusqu’au ' + fmtDT(r.expire) + ')') });
    renderSheet(true);
    modalShow('<h2>Lien prêt</h2><p class="hint">Valable jusqu’au ' + esc(fmtDT(r.expire)) + '. Toute personne qui possède ce lien peut télécharger le PDF.</p>' +
      '<p class="hint" style="word-break:break-all">' + esc(r.lien) + '</p>' +
      '<div class="mrow2"><button class="btn pri" data-act="envoiMail">Écrire le mail à ' + esc(mail) + '</button><button class="btn" data-act="envoiPartage">Partager le lien</button></div>' +
      '<div class="mrow2"><button class="btn" data-act="closemodal">Fermer</button></div>');
  } catch (e) { toast('Envoi impossible : ' + (e && e.code ? R.messageErreur(e) : (e && e.message) || 'erreur')) }
}

function texteMail() {
  return 'Bonjour,\n\nVotre dossier véhicule ' + envoi.plaque + ' est disponible en téléchargement :\n' + envoi.lien +
    '\n\nCe lien est valable jusqu’au ' + new Date(envoi.expire).toLocaleDateString('fr-FR') + '.\n\nCordialement';
}

export function envoiMail() {
  if (!envoi.lien) return;
  var sujet = 'Votre dossier véhicule ' + envoi.plaque;
  window.location.href = 'mailto:' + encodeURIComponent(envoi.mail).replace(/%40/g, '@') + '?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(texteMail());
}

export async function envoiPartage() {
  if (!envoi.lien) return;
  try { await api.partagerLien('Votre dossier véhicule ' + envoi.plaque, texteMail()) } catch (e) { toast('Partage impossible') }
}
