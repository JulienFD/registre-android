'use strict';
// Stockage dans un store Vercel Blob PRIVÉ (jamais d'URL publique). Non couvert par les tests : réseau et identifiants requis.
const { put, get, list, del } = require('@vercel/blob');

function stockageBlob() {
  return {
    // « cree » si le fichier est nouveau, « existe » s'il était déjà là (écrasement refusé par le SDK).
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

    // Même contrat que ecrire, pour des octets (images). `contentType` : type MIME du fichier.
    async ecrireOctets(chemin, octets, contentType) {
      try {
        await put(chemin, Buffer.from(octets), { access: 'private', contentType: contentType, allowOverwrite: false });
        return 'cree';
      } catch (erreur) {
        const present = await get(chemin, { access: 'private', useCache: false });
        if (!present) throw erreur;
        if (present.stream) await present.stream.cancel();
        return 'existe';
      }
    },

    async lireOctets(chemin) {
      const r = await get(chemin, { access: 'private', useCache: false });
      if (!r) return null;
      if (r.statusCode !== 200 || !r.stream) {
        if (r.stream) await r.stream.cancel();
        return null;
      }
      return new Uint8Array(await new Response(r.stream).arrayBuffer());
    },

    async lister(prefixe) {
      const chemins = [];
      let curseur;
      do {
        const page = await list({ prefix: prefixe, cursor: curseur });
        page.blobs.forEach((b) => chemins.push(b.pathname));
        curseur = page.hasMore ? page.cursor : undefined;
      } while (curseur);
      return chemins;
    },

    // Contenu JSON, ou null si le fichier n'existe pas. useCache:false : une lecture juste après écriture doit voir la dernière version.
    async lire(chemin) {
      const r = await get(chemin, { access: 'private', useCache: false });
      if (!r) return null;
      if (r.statusCode !== 200 || !r.stream) {
        if (r.stream) await r.stream.cancel();
        return null;
      }
      return JSON.parse(await new Response(r.stream).text());
    },

    async supprimer(chemin) {
      await del(chemin);
    },
  };
}

module.exports = { stockageBlob };
