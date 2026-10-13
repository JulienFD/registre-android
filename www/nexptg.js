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

  /* ---- état NexPTG d'un dossier ---- */

  var TOLERANCE_HORLOGES = 10 * 60 * 1000; // la date du rapport vient du téléphone, celle du dossier de la tablette
  var MOTIF_MIN = 5;
  var MOTIF_MAX = 300;

  function derniereVersion(versions) {
    return tableau(versions).slice().sort(function (a, b) { return (b.recu - a.recu) || (a.sha256 < b.sha256 ? -1 : 1); })[0] || null;
  }

  function termineValide(t) {
    return !!t && typeof t === 'object' && typeof t.motif === 'string' && t.motif.trim().length >= MOTIF_MIN;
  }

  // Statut : attente, mesures (en cours), recu, termine. `ok` = la section NexPTG est satisfaite (déblocage de la signature).
  function etatNexptg(dossier, versions) {
    var nx = (dossier && dossier.nexptg) || {};
    var derniere = derniereVersion(versions);
    if (derniere) return { statut: 'recu', ok: true, derniere: derniere, termine: null, nbVersions: tableau(versions).length };
    if (termineValide(nx.termine)) return { statut: 'termine', ok: true, derniere: null, termine: nx.termine, nbVersions: 0 };
    return { statut: nx.debutAt ? 'mesures' : 'attente', ok: false, derniere: null, termine: null, nbVersions: 0 };
  }

  // « Terminé » sans rapport : un motif écrit est obligatoire (sortie de secours, donc tracée).
  function demandeTermine(o) {
    var motif = typeof o.motif === 'string' ? o.motif.trim() : '';
    if (motif.length < MOTIF_MIN || motif.length > MOTIF_MAX) return { ok: false, erreur: 'motif' };
    return { ok: true, termine: { at: o.maintenant, motif: motif, par: o.par } };
  }

  // Rapports du relais pouvant être rattachés au dossier. Plusieurs candidats : l'appelant demande, il ne devine jamais.
  function candidats(o) {
    var plaque = Utils.normPlate(o.plaque);
    var tolerance = o.tolerance === undefined ? TOLERANCE_HORLOGES : o.tolerance;
    return tableau(o.rapports).filter(function (r) {
      if (!r || Utils.normPlate(r.plaque) !== plaque) return false;
      if (r.reclame && r.reclame.dossier !== o.dossierId) return false;
      if (o.par && r.par !== o.par) return false;
      var creation = enMs(r.brut && r.brut.date);
      return creation >= o.creeLe - tolerance;
    }).sort(function (a, b) { return b.recu - a.recu; });
  }

  // Vrai si la version du relais n'est pas encore dans le dossier.
  function versionAjouter(rapportRelais, versionsLocales) {
    return !tableau(versionsLocales).some(function (v) { return v.sha256 === rapportRelais.sha256; });
  }

  /* ---- libellés et statistiques d'affichage ---- */

  var ELEMENTS = {
    LEFT_FRONT_FENDER: 'Aile avant gauche', LEFT_FRONT_DOOR: 'Porte avant gauche', LEFT_REAR_DOOR: 'Porte arrière gauche',
    LEFT_PILLAR: 'Montant gauche', LEFT_REAR_FENDER: 'Aile arrière gauche',
    RIGHT_FRONT_FENDER: 'Aile avant droite', RIGHT_FRONT_DOOR: 'Porte avant droite', RIGHT_REAR_DOOR: 'Porte arrière droite',
    RIGHT_PILLAR: 'Montant droit', RIGHT_REAR_FENDER: 'Aile arrière droite',
    HOOD: 'Capot', ROOF: 'Toit', TRUNK: 'Coffre ou hayon',
    LEFT_SIDE: 'Intérieur côté gauche', RIGHT_SIDE: 'Intérieur côté droit',
    ENGINE_COMPARTMENT: 'Compartiment moteur', TRUNK_INSIDE: 'Intérieur du coffre',
  };
  var ZONES = { left: 'Côté gauche', right: 'Côté droit', top: 'Haut', back: 'Dos' };
  var ROUES = { 'Left front': 'Avant gauche', 'Right front': 'Avant droite', 'Left rear': 'Arrière gauche', 'Right rear': 'Arrière droite' };
  var SAISONS = { 'All season': 'Toute la saison', Summer: 'Été', Winter: 'Hiver' };

  // Un type ou une zone inconnus gardent leur nom brut : rien n'est masqué.
  function libelleElement(type) { return ELEMENTS[type] || type; }
  function libelleZone(zone) { return ZONES[zone] || zone; }
  function libelleRoue(section) { return ROUES[section] || section; }
  function libelleSaison(saison) { return SAISONS[saison] || saison; }

  // Les mesures ignorées (valeur nulle) ne comptent pas dans les statistiques.
  function statsElement(valeurs) {
    var nums = tableau(valeurs).map(function (v) { return v.valeur; }).filter(function (n) { return n !== null; });
    var somme = nums.reduce(function (a, b) { return a + b; }, 0);
    return {
      n: nums.length,
      min: nums.length ? Math.min.apply(null, nums) : null,
      max: nums.length ? Math.max.apply(null, nums) : null,
      moyenne: nums.length ? Math.round(somme / nums.length) : null,
      ignorees: tableau(valeurs).length - nums.length,
    };
  }

  var Nexptg = {
    lireSynchro: lireSynchro, etatNexptg: etatNexptg, demandeTermine: demandeTermine,
    candidats: candidats, versionAjouter: versionAjouter,
    libelleElement: libelleElement, libelleZone: libelleZone, libelleRoue: libelleRoue, libelleSaison: libelleSaison,
    statsElement: statsElement, lireRapport: function (brut) { return rapport(brut); },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Nexptg;
  else root.Nexptg = Nexptg;
})(typeof window !== 'undefined' ? window : globalThis);
