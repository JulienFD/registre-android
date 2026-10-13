'use strict';
// Réception d'une synchronisation NexPTG : authentifier, lire, stocker sans rien perdre.
const crypto = require('node:crypto');
const Nexptg = require('../../www/nexptg.js');
const { verifierBasic } = require('./comptes.js');

const TAILLE_MAX = 2 * 1024 * 1024;
const PLAQUE_RANGEE = /^[A-Z0-9]{2,15}$/;

const empreinte = (texte) => crypto.createHash('sha256').update(texte).digest('hex');
const reponse = (statut, json, entetes) => ({ statut, json, entetes: entetes || {} });

// Un rapport est rangé par plaque ; son empreinte nomme le fichier, donc un renvoi identique est sans effet
// et une version modifiée s'ajoute sans écraser la précédente.
function ecritures(synchro, compte, recu) {
  const liste = synchro.rapports.map((r) => {
    const sha = empreinte(JSON.stringify(r.brut));
    const dossier = PLAQUE_RANGEE.test(r.plaque) ? r.plaque : '_sans-plaque';
    return ['rapports/' + dossier + '/' + sha + '.json', {
      version: 1, recu, par: compte, sha256: sha, cle: r.cle, plaque: r.plaque,
      avertissements: r.avertissements, brut: r.brut,
    }];
  });
  if (synchro.historique.length) {
    const brut = synchro.historique.map((h) => h.brut);
    const sha = empreinte(JSON.stringify(brut));
    liste.push(['historique/' + compte + '/' + sha + '.json', { version: 1, recu, par: compte, sha256: sha, historique: brut }]);
  }
  return liste;
}

async function recevoirNexptg(o) {
  if (o.methode !== 'POST') return reponse(405, { ok: false, erreur: 'méthode non autorisée' }, { Allow: 'POST' });

  const compte = verifierBasic(o.authorization, o.comptes);
  if (!compte) {
    return reponse(401, { ok: false, erreur: 'authentification requise' }, { 'WWW-Authenticate': 'Basic realm="relais", charset="UTF-8"' });
  }

  const corps = typeof o.corps === 'string' ? o.corps : '';
  if (Buffer.byteLength(corps) > (o.tailleMax || TAILLE_MAX)) return reponse(413, { ok: false, erreur: 'corps trop volumineux' });

  let synchro;
  try { synchro = Nexptg.lireSynchro(corps); } catch (e) { return reponse(422, { ok: false, erreur: e.message }); }

  try {
    await Promise.all(ecritures(synchro, compte, o.maintenant()).map(([chemin, blob]) => o.stockage.ecrire(chemin, blob)));
  } catch (e) {
    console.error('stockage', e && e.message);
    return reponse(500, { ok: false, erreur: 'stockage indisponible' });
  }
  return reponse(200, { ok: true, rapports: synchro.rapports.length, historique: synchro.historique.length });
}

module.exports = { recevoirNexptg, TAILLE_MAX };
