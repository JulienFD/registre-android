/* Photos du téléphone : règles de rattachement à un dossier. Fonctions pures, sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  var FENETRE = 7 * 86400000;      // photo reçue à 7 jours près de la création du dossier
  var TOLERANCE_SORTIE = 5 * 60000; // horloges tablette / serveur

  var LIBELLE_NEXPTG = 'Photo NexPTG';

  // o : photos (liste du relais), dossierId, creeLe, sortieAt, locales (photos du dossier), slots ([{k, l}]).
  // Rend : auto (à importer d'office, avec leur emplacement), complements (au choix de l'utilisateur), ignores (décomptes).
  function plan(o) {
    var ignores = { autreDossier: 0, horsFenetre: 0, dejaImportees: 0, remplacees: 0, inconnues: 0 };
    var dejaLa = {};
    (o.locales || []).forEach(function (l) { if (l && l.relais) dejaLa[l.relais] = true; });
    var libelles = {}, ordre = {};
    (o.slots || []).forEach(function (s, i) { libelles[s.k] = s.l; ordre[s.k] = i; });

    var retenues = (o.photos || []).filter(function (p) {
      if (p.reclame && p.reclame.dossier !== o.dossierId) { ignores.autreDossier++; return false; }
      if (dejaLa[p.sha256]) { ignores.dejaImportees++; return false; }
      var hors = Math.abs(p.recu - o.creeLe) > FENETRE || (o.sortieAt && p.recu > o.sortieAt + TOLERANCE_SORTIE);
      if (hors) { ignores.horsFenetre++; return false; }
      return true;
    });

    var complements = retenues.filter(function (p) { return p.phase === 'compl'; }).sort(function (a, b) { return a.recu - b.recu; });

    // Une vue reprise plusieurs fois : la dernière reçue gagne, les autres restent sur le relais.
    var parVue = {};
    var auto = [];
    retenues.forEach(function (p) {
      if (p.phase === 'mesures') {
        auto.push(Object.assign({}, p, { item: { phase: 'mesures', slot: null, label: p.label || LIBELLE_NEXPTG } }));
      } else if (p.phase === 'entree' || p.phase === 'sortie') {
        if (!(p.slot in libelles)) { ignores.inconnues++; return; }
        var cle = p.phase + '/' + p.slot;
        if (parVue[cle]) {
          ignores.remplacees++;
          if (p.recu <= parVue[cle].recu) return;
          auto.splice(auto.indexOf(parVue[cle]), 1);
        }
        var x = Object.assign({}, p, { item: { phase: p.phase, slot: p.slot, label: libelles[p.slot] } });
        parVue[cle] = x;
        auto.push(x);
      }
    });

    var rang = { entree: 0, sortie: 1, mesures: 2 };
    auto.sort(function (a, b) {
      if (rang[a.item.phase] !== rang[b.item.phase]) return rang[a.item.phase] - rang[b.item.phase];
      if (a.item.phase === 'mesures') return a.recu - b.recu;
      return ordre[a.item.slot] - ordre[b.item.slot];
    });
    return { auto: auto, complements: complements, ignores: ignores };
  }

  // Mode choisi pour une phase (« tel » ou « tablette ») ; vide tant que rien n'est choisi.
  function modePhotos(dossier, phase) {
    var m = dossier && dossier.photosMode && dossier.photosMode[phase];
    return m === 'tel' || m === 'tablette' ? m : '';
  }

  var PhotosTel = { plan: plan, modePhotos: modePhotos };

  if (typeof module !== 'undefined' && module.exports) module.exports = PhotosTel;
  else root.PhotosTel = PhotosTel;
})(typeof window !== 'undefined' ? window : globalThis);
