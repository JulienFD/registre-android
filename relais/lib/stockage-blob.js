'use strict';
// Stockage dans un store Vercel Blob PRIVÉ (jamais d'URL publique). Non couvert par les tests : réseau et identifiants requis.
const { put, get } = require('@vercel/blob');

function stockageBlob() {
  return {
    // « cree » si le fichier est nouveau, « existe » s'il était déjà là (même empreinte, donc même contenu).
    async ecrire(chemin, objet) {
      try {
        await put(chemin, JSON.stringify(objet), { access: 'private', contentType: 'application/json', allowOverwrite: false });
        return 'cree';
      } catch (erreur) {
        const present = await get(chemin, { access: 'private', useCache: false });
        if (!present) throw erreur;
        if (present.stream) await present.stream.cancel();
        return 'existe';
      }
    },
  };
}

module.exports = { stockageBlob };
