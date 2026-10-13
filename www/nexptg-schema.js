/* Schémas indicatifs des mesures NexPTG : géométrie, placement des points et teintes. Fonctions pures, sans DOM. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;

  var K = 1.3; // les formes sont définies sur une grille de base, agrandie pour que les points restent touchables
  var RAYON = 14; // rayon d'un point, en unités du schéma ; plus gros sur les vues réduites à l'écran

  /* Silhouettes décoratives (classes nx-caisse, nx-vitre, nx-roue) : indicatives, ce ne sont pas des plans du véhicule. */
  var COTE = {
    w: 640, h: 250,
    decor: '<circle class="nx-roue" cx="110" cy="190" r="32"/><circle class="nx-roue" cx="540" cy="190" r="32"/>' +
      '<path class="nx-caisse" d="M30 175 Q30 135 70 124 L160 108 Q200 70 250 62 L420 62 Q470 66 500 100 L580 120 Q615 128 615 160 L615 186 L30 186 Z"/>' +
      '<path class="nx-vitre" d="M205 100 L250 70 L420 70 L480 100 Z"/>',
  };
  var LEFT_ELEMENTS = {
    LEFT_FRONT_FENDER: { x: 40, y: 118, w: 140, h: 62, rx: 10 },
    LEFT_FRONT_DOOR: { x: 184, y: 104, w: 128, h: 76, rx: 6 },
    LEFT_REAR_DOOR: { x: 340, y: 104, w: 128, h: 76, rx: 6 },
    LEFT_PILLAR: { x: 200, y: 76, w: 280, h: 22, rx: 6 },
    LEFT_REAR_FENDER: { x: 470, y: 118, w: 130, h: 62, rx: 10 },
  };
  // La vue de droite est le miroir de celle de gauche (même numérotation des points).
  var RIGHT_ELEMENTS = {
    RIGHT_FRONT_FENDER: LEFT_ELEMENTS.LEFT_FRONT_FENDER, RIGHT_FRONT_DOOR: LEFT_ELEMENTS.LEFT_FRONT_DOOR,
    RIGHT_REAR_DOOR: LEFT_ELEMENTS.LEFT_REAR_DOOR, RIGHT_PILLAR: LEFT_ELEMENTS.LEFT_PILLAR,
    RIGHT_REAR_FENDER: LEFT_ELEMENTS.LEFT_REAR_FENDER,
  };

  var VUES = [
    { id: 'ext-left', section: 'externe', zone: 'left', titre: 'Côté gauche', base: COTE, elements: LEFT_ELEMENTS },
    { id: 'ext-right', section: 'externe', zone: 'right', titre: 'Côté droit', base: COTE, elements: RIGHT_ELEMENTS, miroir: true },
    {
      id: 'ext-top', section: 'externe', zone: 'top', titre: 'Haut',
      base: {
        w: 300, h: 520, rayon: 18,
        decor: '<path class="nx-caisse" d="M70 40 Q150 10 230 40 L250 120 L250 420 L230 490 Q150 510 70 490 L50 420 L50 120 Z"/>' +
          '<path class="nx-vitre" d="M80 196 L220 196 L212 214 L88 214 Z"/><path class="nx-vitre" d="M88 386 L212 386 L222 420 L78 420 Z"/>',
      },
      elements: { HOOD: { x: 75, y: 55, w: 150, h: 140, rx: 14 }, ROOF: { x: 80, y: 215, w: 140, h: 170, rx: 10 } },
    },
    {
      id: 'ext-back', section: 'externe', zone: 'back', titre: 'Dos',
      base: {
        w: 400, h: 300,
        decor: '<circle class="nx-roue" cx="110" cy="255" r="28"/><circle class="nx-roue" cx="290" cy="255" r="28"/>' +
          '<path class="nx-caisse" d="M60 200 Q60 120 110 90 L290 90 Q340 120 340 200 L340 250 L60 250 Z"/>' +
          '<path class="nx-vitre" d="M120 100 L280 100 L296 148 L104 148 Z"/>',
      },
      elements: { TRUNK: { x: 95, y: 152, w: 210, h: 80, rx: 8 } },
    },
    {
      id: 'int-left', section: 'interne', zone: 'left', titre: 'Intérieur : côté gauche',
      base: { w: 640, h: 250, decor: '<rect class="nx-caisse" x="55" y="35" width="530" height="180" rx="22"/>' },
      elements: { LEFT_SIDE: { x: 70, y: 50, w: 500, h: 150, rx: 14 } },
    },
    {
      id: 'int-right', section: 'interne', zone: 'right', titre: 'Intérieur : côté droit',
      base: { w: 640, h: 250, decor: '<rect class="nx-caisse" x="55" y="35" width="530" height="180" rx="22"/>' },
      elements: { RIGHT_SIDE: { x: 70, y: 50, w: 500, h: 150, rx: 14 } },
    },
    {
      id: 'int-top', section: 'interne', zone: 'top', titre: 'Intérieur : compartiment moteur',
      base: { w: 400, h: 260, decor: '<rect class="nx-caisse" x="25" y="25" width="350" height="210" rx="20"/>' },
      elements: { ENGINE_COMPARTMENT: { x: 40, y: 40, w: 320, h: 180, rx: 12 } },
    },
    {
      id: 'int-back', section: 'interne', zone: 'back', titre: 'Intérieur : coffre',
      base: { w: 400, h: 260, decor: '<rect class="nx-caisse" x="30" y="30" width="340" height="200" rx="20"/>' },
      elements: { TRUNK_INSIDE: { x: 50, y: 50, w: 300, h: 160, rx: 12 } },
    },
  ];

  // Répartit n points en une ou deux rangées (colonnes si l'élément est plus haut que large).
  function placer(r, n) {
    var vertical = r.h > r.w;
    var rangs = n <= 4 ? 1 : 2;
    var parRang = Math.ceil(n / rangs), pts = [];
    for (var i = 0; i < n; i++) {
      var rang = Math.floor(i / parRang), k = i % parRang;
      var dansRang = rang === rangs - 1 ? n - parRang * (rangs - 1) : parRang;
      var a = (k + 1) / (dansRang + 1), b = (rang + 1) / (rangs + 1);
      pts.push(vertical ? { x: r.x + r.w * b, y: r.y + r.h * a } : { x: r.x + r.w * a, y: r.y + r.h * b });
    }
    return pts;
  }

  var RANG = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

  // Teinte d'un élément : la mesure la plus défavorable, sans compter les mesures ignorées.
  function teinteElement(valeurs) {
    var pire = null;
    (valeurs || []).forEach(function (v) {
      var r = RANG[v.interpretation];
      if (v.valeur === null || r === undefined) return;
      if (pire === null || r > pire) pire = r;
    });
    return pire === null ? 'nx-t-vide' : 'nx-t-' + pire;
  }

  function arrondi(n) { return Math.round(n * 10) / 10; }

  function forme(r, w, miroir) {
    return { x: arrondi((miroir ? w - (r.x + r.w) * K : r.x * K)), y: arrondi(r.y * K), w: arrondi(r.w * K), h: arrondi(r.h * K), rx: r.rx };
  }

  function elementVue(vue, el) {
    var g = vue.elements[el.type];
    var W = vue.base.w * K;
    var pts = placer(g, el.valeurs.length);
    return {
      type: el.type, libelle: N.libelleElement(el.type), forme: forme(g, W, vue.miroir), tint: teinteElement(el.valeurs),
      stats: N.statsElement(el.valeurs),
      points: el.valeurs.map(function (v, i) {
        var c = N.categorie(v.interpretation), x = pts[i].x * K;
        return {
          n: v.position !== null && v.position !== undefined ? v.position : i + 1,
          x: arrondi(vue.miroir ? W - x : x), y: arrondi(pts[i].y * K),
          valeur: v.valeur, texte: v.texte, materiau: v.materiau, interpretation: v.interpretation, ts: v.ts,
          classe: c.classe, libelle: c.libelle, ignore: v.valeur === null,
        };
      }),
    };
  }

  // Construit les vues pour un rapport normalisé (lireRapport) ; les éléments sans schéma sont listés à part, jamais perdus.
  function construire(rapport) {
    var res = { externe: [], interne: [], horsSchema: [] };
    ['externe', 'interne'].forEach(function (section) {
      (rapport[section] || []).forEach(function (zone) {
        var vue = VUES.filter(function (v) { return v.section === section && v.zone === zone.zone; })[0];
        var connus = zone.elements.filter(function (e) { return vue && vue.elements[e.type]; });
        zone.elements.forEach(function (e) {
          if (!vue || !vue.elements[e.type]) res.horsSchema.push({ section: section, zone: zone.zone, type: e.type });
        });
        if (!vue || !connus.length) return;
        res[section].push({
          id: vue.id, section: vue.section, zone: vue.zone, titre: vue.titre, rayon: vue.base.rayon || RAYON, w: arrondi(vue.base.w * K), h: arrondi(vue.base.h * K),
          decor: '<g transform="' + (vue.miroir ? 'translate(' + arrondi(vue.base.w * K) + ',0) scale(-' + K + ',' + K + ')' : 'scale(' + K + ')') + '">' + vue.base.decor + '</g>',
          elements: connus.map(function (e) { return elementVue(vue, e); }),
        });
      });
    });
    var ordre = VUES.map(function (v) { return v.id; });
    ['externe', 'interne'].forEach(function (s) { res[s].sort(function (a, b) { return ordre.indexOf(a.id) - ordre.indexOf(b.id); }); });
    return res;
  }

  var NexptgSchema = { construire: construire, teinteElement: teinteElement };

  if (typeof module !== 'undefined' && module.exports) module.exports = NexptgSchema;
  else root.NexptgSchema = NexptgSchema;
})(typeof window !== 'undefined' ? window : globalThis);
