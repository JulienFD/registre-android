import { S, VV, api, esc, fmtDT, hist, save, toast } from './core.js';
import { modalShow } from './pin.js';
import { makePdf } from './pdf.js';
import { renderSheet } from './sheet.js';

/* Envoi du PDF au client : déposé sur le relais, qui envoie le mail (SMTP) avec un lien secret à durée limitée.
   Un PDF volumineux est aussi joint au mail, sans rien demander ; le message le précise ensuite. */
var R = window.Relais;
var envoi = { lien: '', mail: '', plaque: '', expire: 0 };
var MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var LIB = { entree: 'PDF d’entrée', full: 'PDF complet' };

export async function client() {
  var conf = await api.relaisConf();
  if (!conf || !conf.url || !conf.compte || !conf.motDePasse) return null;
  try { return R.creerClient(conf) } catch (e) { return null }
}

/* L'adresse est toujours celle de la fiche du client : elle ne se saisit pas ici (un envoi ne peut pas partir vers une autre adresse). */
function adresseFiche(v) {
  var m = String(v.clientMail || '').trim();
  return MAIL.test(m) ? m : '';
}

export function envoiOuvrir() {
  var v = VV(); if (!v || !S.cur) return;
  var mail = adresseFiche(v);
  modalShow('<h2>Envoyer le PDF au client</h2>' +
    (mail
      ? '<p>Adresse du client : <strong>' + esc(mail) + '</strong></p>' +
        '<p class="hint">Le PDF est déposé sur le serveur, qui envoie au client un mail avec un lien de téléchargement valable 30 jours. Un PDF volumineux est joint au mail. Pour changer l’adresse, la modifier dans la fiche, onglet Informations.</p>' +
        '<div class="mrow2"><button class="btn pri" data-act="envoiPdf" data-mode="entree">PDF d’entrée</button><button class="btn pri" data-act="envoiPdf" data-mode="full">PDF complet</button></div>'
      : '<p class="hint">Aucune adresse e-mail valable dans la fiche du client. La renseigner dans l’onglet Informations, puis recommencer.</p>') +
    '<div class="mrow2"><button class="btn" data-act="closemodal">Annuler</button></div>');
}

/* PDF d'entrée : l'exemplaire archivé à la validation est celui qu'on envoie. PDF complet : toujours régénéré.
   archive : résultat de makePdf déjà obtenu (envoi automatique), pour ne pas régénérer. */
async function octets(v, mode, archive) {
  var rel = archive && archive.rel;
  if (!rel && mode === 'entree') {
    var dernier = (v.arch || []).filter(function (a) { return a.mode === 'entree' }).pop();
    rel = dernier && dernier.rel;
  }
  if (!rel) { var r = await makePdf(mode, true); rel = r && r.rel }
  return rel ? { nom: rel.split('/').pop(), bytes: await api.lireArchive(rel) } : null;
}

/* Dépose le PDF, fait envoyer le mail, note l'envoi dans le dossier. Renvoie le résumé ou lève une erreur. */
async function transmettre(v, mode, mail, auto, archive) {
  var c = await client();
  if (!c) throw new Error('Relais non configuré : Réglages, section Relais NexPTG');
  var f = await octets(v, mode, archive);
  if (!f) throw new Error('PDF indisponible');
  var d = await c.deposerPdf(v.plaque, f.nom, f.bytes);
  var m = await c.envoyerMailPdf(d.id, mail, d.volumineux);
  envoi = { lien: d.lien, mail: mail, plaque: v.plaque, expire: d.expire };
  var res = { mode: mode, mail: mail, envoye: !!m.envoye, joint: !!m.joint, indisponible: !!m.indisponible, taille: f.bytes.length, lien: d.lien, expire: d.expire };
  var note = res.envoye ? 'envoyé à ' + mail + (res.joint ? ' avec le PDF en pièce jointe (volumineux)' : '') : 'déposé sur le relais (mail non envoyé)';
  await save({
    envois: (v.envois || []).concat([{ ts: Date.now(), mode: mode, mail: mail, auto: !!auto, envoye: res.envoye, joint: res.joint }]),
    hist: hist(v, LIB[mode] + ' ' + note + (auto ? ' (automatique)' : '') + ', lien valable jusqu’au ' + fmtDT(d.expire)),
  });
  return res;
}

function ecranResultat(res) {
  var envoye = res.envoye;
  modalShow('<h2>' + (envoye ? 'Mail envoyé' : 'Lien prêt') + '</h2>' +
    '<p>' + esc(R.resumeEnvoi(res)) + '</p>' +
    '<p class="hint">Valable jusqu’au ' + esc(fmtDT(res.expire)) + '. Toute personne qui possède ce lien peut télécharger le PDF.</p>' +
    '<p class="hint" style="word-break:break-all">' + esc(res.lien) + '</p>' +
    '<div class="mrow2"><button class="btn pri" data-act="envoiCopier">Copier le lien</button><button class="btn" data-act="envoiPartage">Partager le lien</button></div>' +
    (envoye ? '' : '<div class="mrow2"><button class="btn" data-act="envoiMail">Écrire le mail à ' + esc(res.mail) + '</button></div>') +
    '<div class="mrow2"><button class="btn" data-act="closemodal">Fermer</button></div>');
}

export async function envoiPdf(mode) {
  var v = VV(); if (!v || !S.cur) return;
  mode = mode === 'full' ? 'full' : 'entree';
  var mail = adresseFiche(v);
  if (!mail) { toast('Aucune adresse e-mail valable dans la fiche du client'); return }
  toast('Envoi du PDF au client…');
  try {
    var res = await transmettre(v, mode, mail, false);
    renderSheet(true);
    ecranResultat(res);
  } catch (e) { toast('Envoi impossible : ' + (e && e.code ? R.messageErreur(e) : (e && e.message) || 'erreur')) }
}

/* Envoi automatique à la validation (entrée ou sortie) : sans fenêtre, une seule fois par type de PDF.
   archive : le PDF qui vient d'être archivé. */
export async function envoiAuto(mode, archive) {
  var v = VV(); if (!v || !S.cur || !archive) return;
  if ((v.envois || []).some(function (e) { return e.auto && e.mode === mode && e.envoye })) return;
  var mail = adresseFiche(v);
  if (!mail) { toast(LIB[mode] + ' non envoyé : aucune adresse e-mail valable dans la fiche du client'); return }
  try {
    var res = await transmettre(v, mode, mail, true, archive);
    renderSheet(true);
    toast(R.resumeEnvoi(res));
  } catch (e) { toast('Envoi automatique impossible : ' + (e && e.code ? R.messageErreur(e) : (e && e.message) || 'erreur') + '. Utiliser « Envoyer au client ».') }
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

/* Copie le lien dans le presse-papiers de la tablette. */
export async function envoiCopier() {
  if (!envoi.lien) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(envoi.lien);
    else {
      var t = document.createElement('textarea'); t.value = envoi.lien; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select(); var ok = document.execCommand('copy'); t.remove();
      if (!ok) throw new Error('copie');
    }
    toast('Lien copié');
  } catch (e) { toast('Copie impossible : sélectionner le lien affiché') }
}
