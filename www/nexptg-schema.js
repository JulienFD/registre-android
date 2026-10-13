/* Schémas indicatifs des mesures NexPTG : géométrie, placement des points et teintes. Fonctions pures, sans DOM. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;

  var K = 1.3; // les formes sont définies sur une grille de base, agrandie pour que les points restent touchables
  var RAYON = 14; // rayon d'un point, en unités du schéma ; plus gros sur les vues réduites à l'écran

  /* Silhouettes décoratives en primitives (poly, cercle, rect) : indicatives, ce ne sont pas des plans du véhicule.
     Le SVG de l'écran et le dessin du PDF en sont tous deux dérivés. Rôles : caisse, vitre, roue. */
  var P = function (role, pts) { return { t: 'poly', role: role, pts: pts }; };
  var C = function (cx, cy, r) { return { t: 'cercle', role: 'roue', cx: cx, cy: cy, r: r }; };
  var R = function (x, y, w, h, rx) { return { t: 'rect', role: 'caisse', x: x, y: y, w: w, h: h, rx: rx }; };

  var COTE = {
    w: 640, h: 250,
    decor: [
      C(110, 190, 32), C(540, 190, 32),
      P('caisse', [[30, 186], [30, 160], [34, 136], [70, 124], [160, 108], [200, 78], [250, 62], [420, 62], [470, 68], [500, 100], [580, 120], [612, 130], [615, 160], [615, 186]]),
      P('vitre', [[205, 100], [250, 70], [420, 70], [480, 100]]),
    ],
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
  var INT_COTE = { w: 640, h: 250, decor: [R(55, 35, 530, 180, 22)] };
  var INT_MOTEUR = { w: 400, h: 260, decor: [R(25, 25, 350, 210, 20)] };
  var INT_COFFRE = { w: 400, h: 260, decor: [R(30, 30, 340, 200, 20)] };

  var VUES = [
    { id: 'ext-left', section: 'externe', zone: 'left', titre: 'Côté gauche', base: COTE, elements: LEFT_ELEMENTS },
    { id: 'ext-right', section: 'externe', zone: 'right', titre: 'Côté droit', base: COTE, elements: RIGHT_ELEMENTS, miroir: true },
    {
      id: 'ext-top', section: 'externe', zone: 'top', titre: 'Haut',
      base: {
        w: 300, h: 520, rayon: 18,
        decor: [
          P('caisse', [[70, 40], [90, 28], [120, 22], [180, 22], [210, 28], [230, 40], [250, 120], [250, 420], [230, 490], [210, 502], [180, 508], [120, 508], [90, 502], [70, 490], [50, 420], [50, 120]]),
          P('vitre', [[80, 196], [220, 196], [212, 214], [88, 214]]), P('vitre', [[88, 386], [212, 386], [222, 420], [78, 420]]),
        ],
      },
      elements: { HOOD: { x: 75, y: 55, w: 150, h: 140, rx: 14 }, ROOF: { x: 80, y: 215, w: 140, h: 170, rx: 10 } },
    },
    {
      id: 'ext-back', section: 'externe', zone: 'back', titre: 'Dos',
      base: {
        w: 400, h: 300,
        decor: [
          C(110, 255, 28), C(290, 255, 28),
          P('caisse', [[60, 250], [60, 200], [66, 140], [85, 108], [110, 90], [290, 90], [315, 108], [334, 140], [340, 200], [340, 250]]),
          P('vitre', [[120, 100], [280, 100], [296, 148], [104, 148]]),
        ],
      },
      elements: { TRUNK: { x: 95, y: 152, w: 210, h: 80, rx: 8 } },
    },
    { id: 'int-left', section: 'interne', zone: 'left', titre: 'Intérieur : côté gauche', base: INT_COTE, elements: { LEFT_SIDE: { x: 70, y: 50, w: 500, h: 150, rx: 14 } } },
    { id: 'int-right', section: 'interne', zone: 'right', titre: 'Intérieur : côté droit', base: INT_COTE, elements: { RIGHT_SIDE: { x: 70, y: 50, w: 500, h: 150, rx: 14 } } },
    { id: 'int-top', section: 'interne', zone: 'top', titre: 'Intérieur : compartiment moteur', base: INT_MOTEUR, elements: { ENGINE_COMPARTMENT: { x: 40, y: 40, w: 320, h: 180, rx: 12 } } },
    { id: 'int-back', section: 'interne', zone: 'back', titre: 'Intérieur : coffre', base: INT_COFFRE, elements: { TRUNK_INSIDE: { x: 50, y: 50, w: 300, h: 160, rx: 12 } } },
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

  // Primitives en coordonnées finales (échelle K, miroir éventuel) ; le SVG de l'écran en est dérivé.
  function transformer(prims, W, miroir) {
    var X = function (x) { return arrondi(miroir ? W - x * K : x * K); };
    return prims.map(function (p) {
      if (p.t === 'poly') return { t: 'poly', role: p.role, pts: p.pts.map(function (q) { return [X(q[0]), arrondi(q[1] * K)]; }) };
      if (p.t === 'cercle') return { t: 'cercle', role: p.role, cx: X(p.cx), cy: arrondi(p.cy * K), r: arrondi(p.r * K) };
      return { t: 'rect', role: p.role, x: arrondi(miroir ? W - (p.x + p.w) * K : p.x * K), y: arrondi(p.y * K), w: arrondi(p.w * K), h: arrondi(p.h * K), rx: p.rx };
    });
  }

  function svgDecor(prims) {
    return prims.map(function (p) {
      var c = 'nx-' + p.role;
      if (p.t === 'poly') return '<polygon class="' + c + '" points="' + p.pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' ') + '"/>';
      if (p.t === 'cercle') return '<circle class="' + c + '" cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"/>';
      return '<rect class="' + c + '" x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + p.rx + '"/>';
    }).join('');
  }

  // Rectangle englobant tout ce qui est dessiné (silhouettes, éléments, points) plus une marge, dans les limites du schéma.
  function cadreDe(decorFormes, elements, rayon, w, h) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var ajouter = function (x, y, r) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    decorFormes.forEach(function (f) {
      if (f.t === 'poly') f.pts.forEach(function (q) { ajouter(q[0], q[1], 0); });
      else if (f.t === 'cercle') ajouter(f.cx, f.cy, f.r);
      else { ajouter(f.x, f.y, 0); ajouter(f.x + f.w, f.y + f.h, 0); }
    });
    elements.forEach(function (e) {
      ajouter(e.forme.x, e.forme.y, 0); ajouter(e.forme.x + e.forme.w, e.forme.y + e.forme.h, 0);
      e.points.forEach(function (p) { ajouter(p.x, p.y, rayon + 4); });
    });
    var m = 8;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
    return { x: arrondi(x0), y: arrondi(y0), w: arrondi(x1 - x0), h: arrondi(y1 - y0) };
  }

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
        var decorFormes = transformer(vue.base.decor, vue.base.w * K, vue.miroir);
        var elementsVue = connus.map(function (e) { return elementVue(vue, e); });
        var rayonVue = vue.base.rayon || RAYON;
        res[section].push({
          cadre: cadreDe(decorFormes, elementsVue, rayonVue, vue.base.w * K, vue.base.h * K),
          id: vue.id, section: vue.section, zone: vue.zone, titre: vue.titre, rayon: vue.base.rayon || RAYON, w: arrondi(vue.base.w * K), h: arrondi(vue.base.h * K),
          decorFormes: decorFormes, decor: svgDecor(decorFormes),
          elements: elementsVue,
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
