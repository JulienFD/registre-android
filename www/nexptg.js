/* Lecture sans perte des synchronisations NexPTG (POST JSON). Fonctions pures, sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  var Utils = typeof module !== 'undefined' && module.exports ? require('./utils.js') : root.Utils;

  var TITRE_PLAQUE = /immat|plaque/;

  function tableau(x) { return Array.isArray(x) ? x : []; }
  function txt(x) { return x == null ? '' : String(x); }
  function sansAccent(s) { return txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function enMs(secondes) { var n = Number(secondes); return isFinite(n) && n > 0 ? n * 1000 : 0; }
  function nombre(t) {
    var s = txt(t).trim().replace(',', '.');
    var n = s === '' ? NaN : Number(s);
    return isFinite(n) ? n : null;
  }

  // Une mesure vient de l'historique (value numérique, date) ou d'un rapport (value texte, timestamp).
  function mesure(m) {
    m = m || {};
    return {
      valeur: nombre(m.value), texte: txt(m.value), materiau: txt(m.type), interpretation: m.interpretation,
      ts: enMs(m.timestamp != null ? m.timestamp : m.date), position: m.position === undefined ? null : m.position,
    };
  }

  function zones(places) {
    return tableau(places).map(function (p) {
      p = p || {};
      return {
        zone: txt(p.placeId),
        elements: tableau(p.data).map(function (e) {
          e = e || {};
          return { type: txt(e.type), valeurs: tableau(e.values).map(mesure) };
        }),
      };
    });
  }

  function pneu(t) {
    t = t || {};
    return {
      emplacement: txt(t.section), fabricant: txt(t.maker), saison: txt(t.season),
      largeur: txt(t.width), profil: txt(t.profile), diametre: txt(t.diameter),
      valeur1: txt(t.value1), valeur2: txt(t.value2),
    };
  }

  function plaqueDesChamps(champs, avertissements) {
    var champ = champs.filter(function (c) { return TITRE_PLAQUE.test(sansAccent(c.titre)); })[0];
    if (!champ) { avertissements.push('plaque absente'); return ''; }
    var plaque = Utils.normPlate(champ.texte);
    if (!plaque) { avertissements.push('plaque absente'); return ''; }
    if (!Utils.plateValid(plaque, 'fr')) avertissements.push('plaque hors format SIV');
    return plaque;
  }

  function rapport(r) {
    r = r || {};
    var avertissements = [];
    var serie = txt(r.deviceSerialNumber);
    if (!serie) avertissements.push('numéro de série absent');
    var champs = tableau(r.extraFields).map(function (f) { f = f || {}; return { titre: txt(f.title), texte: txt(f.text) }; });
    return {
      // `id` est local à l'application (réutilisable) ; `date` est la création et ne change pas aux modifications.
      cle: serie + '#' + txt(r.id) + '#' + txt(r.date), id: r.id, serie: serie, nom: txt(r.name), date: enMs(r.date),
      unite: txt(r.unitOfMeasure), commentaire: txt(r.comment),
      vehicule: {
        marque: txt(r.brand), modele: txt(r.model), carrosserie: txt(r.typeOfBody), cylindree: txt(r.capacity),
        puissance: txt(r.power), vin: txt(r.vin), energie: txt(r.fuelType), millesime: txt(r.year),
      },
      champs: champs,
      plaque: plaqueDesChamps(champs, avertissements),
      externe: zones(r.data), interne: zones(r.dataInside), pneus: tableau(r.tires).map(pneu),
      avertissements: avertissements,
      brut: r,
    };
  }

  function historique(h) {
    h = h || {};
    return { id: h.id, nom: txt(h.name), mesures: tableau(h.data).map(mesure), brut: h };
  }

  // Seule une structure illisible est refusée : un rapport étrange est lu au mieux et conservé (brut).
  function lireSynchro(entree) {
    var o = entree;
    if (typeof entree === 'string') {
      try { o = JSON.parse(entree); } catch (e) { throw new Error('JSON invalide', { cause: e }); }
    }
    var d = o && typeof o === 'object' ? o.data : null;
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Structure NexPTG inattendue');
    return { historique: tableau(d.history).map(historique), rapports: tableau(d.reports).map(rapport) };
  }

  var Nexptg = { lireSynchro: lireSynchro };

  if (typeof module !== 'undefined' && module.exports) module.exports = Nexptg;
  else root.Nexptg = Nexptg;
})(typeof window !== 'undefined' ? window : globalThis);
