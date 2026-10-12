/* Sauvegarde et restauration des données : fonctions pures (chemins, formats .registre et .zip), sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  /* config.json (code PIN, dossier de copie) n'est jamais sauvegardé. */
  var CHEMIN_SAUVEGARDE = /^(vehicules\/[A-Za-z0-9_-]{1,120}\/(dossier\.json|(photos\/[A-Za-z0-9_-]{1,120}\.(json|jpg|pdf))|(compl\/[A-Za-z0-9_-]{1,120}\.json))|archives\/(Entrees|Dossiers)\/\d{4}\/[A-Za-z0-9._-]{1,200}\.pdf|archives\/REGISTRE-INTEGRITE\.csv)$/;

  function cheminSauvegardeValide(p) {
    return typeof p === 'string' && CHEMIN_SAUVEGARDE.test(p);
  }

  function nomSauvegarde(date, extension) {
    return 'registre-sauvegarde_' + date.toLocaleDateString('sv-SE') + '.' + extension;
  }

  /* ---- format .registre : suite d'enregistrements « {"p":chemin,"n":taille}\n » suivis de `taille` octets ---- */
  var MAGIE_SAUVEGARDE = 'REGISTRE-SAUVEGARDE-1\n';

  function enteteSauvegarde(chemin, taille) {
    if (!cheminSauvegardeValide(chemin)) throw new Error('chemin non sauvegardable : ' + chemin);
    return JSON.stringify({ p: chemin, n: taille }) + '\n';
  }

  function lireEnteteSauvegarde(ligne) {
    var o;
    try { o = JSON.parse(ligne); } catch (e) { return null; }
    if (!o || !cheminSauvegardeValide(o.p) || !Number.isInteger(o.n) || o.n < 0) return null;
    return { chemin: o.p, taille: o.n };
  }

  /* ---- format .zip : sans compression (méthode 0), assez pour être ouvert par n'importe quel outil ---- */
  var TABLE_CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(octets) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var DATE_ZIP = 33; /* 1980-01-01 : la date n'a pas d'importance, les fiches portent les leurs */

  function zipEnteteLocale(chemin, crc, taille) {
    var nom = new TextEncoder().encode(chemin), o = new Uint8Array(30 + nom.length), v = new DataView(o.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(12, DATE_ZIP, true);
    v.setUint32(14, crc, true); v.setUint32(18, taille, true); v.setUint32(22, taille, true); v.setUint16(26, nom.length, true);
    o.set(nom, 30);
    return o;
  }

  function zipEntreeCentrale(chemin, crc, taille, offsetLocal) {
    var nom = new TextEncoder().encode(chemin), o = new Uint8Array(46 + nom.length), v = new DataView(o.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(14, DATE_ZIP, true);
    v.setUint32(16, crc, true); v.setUint32(20, taille, true); v.setUint32(24, taille, true); v.setUint16(28, nom.length, true);
    v.setUint32(42, offsetLocal, true);
    o.set(nom, 46);
    return o;
  }

  function zipFin(nb, tailleCentrale, offsetCentrale) {
    var o = new Uint8Array(22), v = new DataView(o.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, nb, true); v.setUint16(10, nb, true);
    v.setUint32(12, tailleCentrale, true); v.setUint32(16, offsetCentrale, true);
    return o;
  }

  /* `fin` : les derniers octets du fichier (au moins 22, au plus 64 Kio : un commentaire peut suivre). */
  function zipLireFin(fin) {
    for (var i = fin.length - 22; i >= 0; i--) {
      var v = new DataView(fin.buffer, fin.byteOffset + i, 22);
      if (v.getUint32(0, true) === 0x06054b50) return { nb: v.getUint16(10, true), taille: v.getUint32(12, true), offset: v.getUint32(16, true) };
    }
    return null;
  }

  /* Renvoie les entrées : chemin, debut (de l'en-tête local), taille (stockée), methode (0 stocké, 8 deflate). */
  function zipLireCentrale(centrale, nb) {
    var v = new DataView(centrale.buffer, centrale.byteOffset, centrale.length), pos = 0, out = [], dec = new TextDecoder();
    for (var i = 0; i < nb; i++) {
      if (pos + 46 > centrale.length || v.getUint32(pos, true) !== 0x02014b50) throw new Error('zip illisible');
      var nl = v.getUint16(pos + 28, true), el = v.getUint16(pos + 30, true), cl = v.getUint16(pos + 32, true);
      out.push({ chemin: dec.decode(centrale.subarray(pos + 46, pos + 46 + nl)), methode: v.getUint16(pos + 10, true), taille: v.getUint32(pos + 20, true), debut: v.getUint32(pos + 42, true) });
      pos += 46 + nl + el + cl;
    }
    return out;
  }

  /* `entete` : les 30 premiers octets de l'en-tête local ; renvoie le décalage des données depuis son début. */
  function zipDebutDonnees(entete) {
    var v = new DataView(entete.buffer, entete.byteOffset, 30);
    if (v.getUint32(0, true) !== 0x04034b50) throw new Error('zip illisible');
    return 30 + v.getUint16(26, true) + v.getUint16(28, true);
  }

  var Sauvegarde = {
    cheminSauvegardeValide: cheminSauvegardeValide, nomSauvegarde: nomSauvegarde,
    MAGIE_SAUVEGARDE: MAGIE_SAUVEGARDE, enteteSauvegarde: enteteSauvegarde, lireEnteteSauvegarde: lireEnteteSauvegarde,
    crc32: crc32, zipEnteteLocale: zipEnteteLocale, zipEntreeCentrale: zipEntreeCentrale, zipFin: zipFin,
    zipLireFin: zipLireFin, zipLireCentrale: zipLireCentrale, zipDebutDonnees: zipDebutDonnees,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sauvegarde;
  else root.Sauvegarde = Sauvegarde;
})(typeof window !== 'undefined' ? window : globalThis);
