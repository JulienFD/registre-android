/* Schémas indicatifs des mesures NexPTG : géométrie, placement des points et teintes. Fonctions pures, sans DOM. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;

  var K = 1.3; // les formes sont définies sur une grille de base, agrandie pour que les points restent touchables
  var RAYON = 14; // rayon d'un point, en unités du schéma ; plus gros sur les vues réduites à l'écran

  /* Les silhouettes et les panneaux sont dessinés d'après les schémas de NexPTG, dans les pixels de ces captures de référence ;
     `place` les ramène sur la grille de base de chaque vue (échelle `ech`, rotation éventuelle). Indicatifs : ce ne sont pas
     des plans du véhicule. Le SVG de l'écran et le dessin du PDF en sont tous deux dérivés. Rôles : caisse, vitre, montant,
     roue, jante, feu et trait (ligne seule : joints, poignées, rayons). */
  var P = function (role, pts) { return { t: 'poly', role: role, pts: pts }; };
  var T = function (pts) { return { t: 'trait', role: 'trait', pts: pts }; };
  var C = function (role, cx, cy, r) { return { t: 'cercle', role: role, cx: cx, cy: cy, r: r }; };
  var R = function (x, y, w, h, rx) { return { t: 'rect', role: 'caisse', x: x, y: y, w: w, h: h, rx: rx }; };

  // Pneu, jante et dix rayons.
  function roue(cx, cy, r) {
    var res = [C('roue', cx, cy, r), C('jante', cx, cy, r * 0.62)];
    for (var k = 0; k < 10; k++) {
      var a = k * Math.PI / 5, c = Math.cos(a), s = Math.sin(a);
      res.push(T([[cx + c * r * 0.14, cy + s * r * 0.14], [cx + c * r * 0.58, cy + s * r * 0.58]]));
    }
    return res;
  }
  // Élément défini par son contour, les points de NexPTG (`ancres`, dans l'ordre), un repli (`zone` x, y, w, h ou `chemin`).
  var E = function (contour, ancres, zone, chemin) { return { contour: contour, ancres: ancres, zone: zone, chemin: chemin }; };
  var rectEl = function (x, y, w, h) { return E([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], null, [x, y, w, h]); };

  /* Vue de côté : voiture tournée vers la gauche (la vue de droite en est le miroir, mêmes numéros de points). */
  var placeCote = function (x, y) { return [15 + (x - 160) * 0.62, 8 + (y - 40) * 0.62]; };
  var COTE = {
    w: 700, h: 260, ech: 0.62, place: placeCote,
    decor: [
      P('caisse', [[160, 292], [158, 252], [165, 215], [188, 190], [300, 152], [420, 142], [500, 138], [560, 98], [700, 48], [927, 40], [1050, 48], [1110, 70], [1190, 112], [1215, 140], [1226, 200], [1236, 240], [1228, 282], [1195, 298], [1066, 300], [912, 322], [420, 322], [272, 322], [170, 314]]),
      P('vitre', [[545, 148], [592, 102], [706, 66], [772, 60], [740, 147]]),
      P('vitre', [[802, 58], [903, 55], [942, 138], [762, 146]]),
      P('vitre', [[958, 64], [1048, 56], [1105, 92], [1122, 128], [992, 138]]),
      P('montant', [[560, 98], [592, 102], [545, 148], [520, 148]]),
      P('montant', [[772, 60], [802, 58], [762, 146], [740, 147]]),
      P('montant', [[903, 55], [958, 64], [992, 138], [942, 138]]),
      P('caisse', [[548, 126], [575, 118], [592, 124], [588, 140], [560, 140]]),
      P('feu', [[190, 205], [250, 194], [290, 203], [272, 222], [205, 228]]),
      P('feu', [[1140, 152], [1212, 150], [1222, 172], [1168, 192], [1150, 190]]),
      T([[500, 153], [500, 292]]), T([[740, 146], [740, 292]]), T([[985, 140], [878, 292]]),
      T([[500, 153], [740, 146], [985, 140], [1200, 142]]),
      T([[672, 170], [720, 170]]), T([[890, 168], [938, 168]]),
      T([[165, 262], [272, 262]]), T([[420, 300], [912, 300]]),
    ].concat(roue(345, 287, 73), roue(990, 287, 73)),
  };
  var LEFT_ELEMENTS = {
    LEFT_FRONT_FENDER: E(
      [[168, 246], [190, 208], [250, 190], [340, 172], [430, 160], [500, 153], [500, 292], [420, 292], [416, 258], [400, 230], [372, 214], [345, 210], [318, 214], [290, 230], [274, 258], [272, 292], [180, 292]],
      [[290, 205], [375, 187], [480, 183], [458, 251]], [300, 175, 190, 40]),
    LEFT_FRONT_DOOR: E([[500, 153], [605, 150], [738, 146], [740, 292], [500, 292]],
      [[520, 170], [514, 224], [514, 275], [622, 226], [712, 161], [712, 226], [714, 277]], [515, 165, 195, 110]),
    LEFT_REAR_DOOR: E([[738, 146], [820, 142], [985, 140], [878, 292], [740, 292]],
      [[770, 160], [770, 218], [770, 275], [830, 218], [953, 157], [908, 217], [866, 274]], [775, 165, 100, 105]),
    LEFT_PILLAR: E(
      [[500, 140], [540, 100], [600, 66], [708, 42], [830, 38], [927, 36], [1030, 48], [1110, 72], [1180, 110], [1205, 140],
        [1195, 150], [1130, 120], [1100, 100], [1020, 70], [927, 58], [830, 56], [708, 62], [620, 84], [560, 118], [520, 148]],
      [[563, 103], [708, 52], [927, 47], [1108, 88]], null, [[510, 144], [563, 103], [708, 52], [927, 47], [1108, 88], [1195, 145]]),
    LEFT_REAR_FENDER: E(
      [[985, 140], [1100, 136], [1200, 142], [1212, 165], [1215, 230], [1200, 285], [1066, 292], [1063, 258], [1050, 234], [1022, 216], [990, 210], [958, 216], [930, 236], [917, 260], [914, 292], [878, 292]],
      [[987, 187], [1056, 168], [1135, 192], [1130, 148]], [990, 150, 200, 40]),
  };
  // La vue de droite est le miroir de celle de gauche (même numérotation des points).
  var RIGHT_ELEMENTS = {
    RIGHT_FRONT_FENDER: LEFT_ELEMENTS.LEFT_FRONT_FENDER, RIGHT_FRONT_DOOR: LEFT_ELEMENTS.LEFT_FRONT_DOOR,
    RIGHT_REAR_DOOR: LEFT_ELEMENTS.LEFT_REAR_DOOR, RIGHT_PILLAR: LEFT_ELEMENTS.LEFT_PILLAR,
    RIGHT_REAR_FENDER: LEFT_ELEMENTS.LEFT_REAR_FENDER,
  };

  /* Vue de dessus : la capture est à l'horizontale (avant à gauche) ; on la tourne pour garder une vue verticale, avant en haut. */
  var HAUT = {
    w: 300, h: 520, rayon: 18, ech: 0.66, place: function (x, y) { return [43 + (345 - y) * 0.66, 5 + (x - 318) * 0.66]; },
    decor: [
      P('caisse', [[318, 120], [322, 80], [345, 55], [400, 42], [560, 48], [700, 52], [900, 60], [1030, 70], [1075, 90], [1085, 140], [1085, 230], [1075, 280], [1030, 300], [900, 308], [700, 312], [560, 316], [400, 322], [345, 308], [322, 285], [318, 250]]),
      P('vitre', [[560, 72], [655, 100], [655, 266], [560, 300]]),
      P('vitre', [[1010, 100], [1062, 94], [1068, 265], [1010, 272]]),
      P('vitre', [[660, 72], [1000, 74], [1004, 95], [660, 98]]),
      P('vitre', [[660, 296], [1000, 294], [1004, 274], [660, 268]]),
      P('caisse', [[598, 50], [625, 20], [632, 28], [612, 60]]), P('caisse', [[598, 312], [625, 345], [632, 337], [612, 302]]),
      P('montant', [[318, 120], [330, 125], [330, 245], [318, 250]]),
      T([[660, 98], [1000, 98]]), T([[660, 268], [1000, 270]]),
    ],
  };
  var HAUT_ELEMENTS = {
    HOOD: E([[324, 120], [332, 80], [370, 60], [470, 55], [556, 60], [552, 310], [470, 314], [370, 310], [332, 292], [324, 250]],
      [[540, 300], [378, 293], [427, 185], [378, 76], [538, 68]], [345, 90, 190, 190]),
    ROOF: E([[660, 98], [760, 92], [900, 95], [1000, 98], [1012, 150], [1012, 225], [1000, 272], [900, 276], [760, 272], [660, 266], [655, 185]],
      [[673, 105], [822, 186], [980, 108], [980, 260], [676, 256]], [680, 110, 300, 150]),
  };

  /* Vue arrière. */
  var DOS = {
    w: 400, h: 300, ech: 0.62, place: function (x, y) { return [200 + (x - 647) * 0.62, 20 + (y - 25) * 0.62]; },
    decor: [
      P('roue', [[437, 230], [497, 230], [497, 362], [437, 362]]), P('roue', [[797, 230], [857, 230], [857, 362], [797, 362]]),
      P('caisse', [[440, 170], [455, 110], [500, 60], [530, 38], [790, 38], [800, 60], [850, 110], [855, 170], [858, 300], [855, 340], [440, 340], [437, 300]]),
      P('vitre', [[525, 48], [770, 48], [792, 122], [502, 122]]),
      P('caisse', [[405, 128], [430, 110], [455, 112], [462, 140], [420, 142]]), P('caisse', [[888, 128], [862, 110], [838, 112], [830, 140], [872, 142]]),
      P('feu', [[462, 148], [545, 150], [582, 172], [548, 188], [510, 212], [465, 212]]),
      P('feu', [[832, 148], [749, 150], [712, 172], [746, 188], [784, 212], [829, 212]]),
      P('montant', [[450, 252], [548, 262], [746, 262], [845, 252], [850, 320], [800, 335], [495, 335], [445, 320]]),
      C('jante', 520, 288, 22), C('roue', 520, 288, 10), C('jante', 774, 288, 22), C('roue', 774, 288, 10),
      T([[502, 160], [792, 160]]),
    ],
  };
  var DOS_ELEMENTS = {
    TRUNK: E([[502, 122], [795, 122], [790, 152], [775, 166], [782, 200], [772, 232], [520, 232], [512, 200], [522, 166], [505, 152]],
      [[547, 217], [530, 133], [647, 147], [765, 133], [748, 217]], [540, 135, 220, 90]),
  };

  var plan = function (w, h) { return { w: w, h: h, ech: 1, place: function (x, y) { return [x, y]; } }; };
  var INT_COTE = Object.assign(plan(640, 250), { decor: [R(55, 35, 530, 180, 22)] });
  var INT_MOTEUR = Object.assign(plan(400, 260), { decor: [R(25, 25, 350, 210, 20)] });
  var INT_COFFRE = Object.assign(plan(400, 260), { decor: [R(30, 30, 340, 200, 20)] });

  var VUES = [
    { id: 'ext-left', section: 'externe', zone: 'left', titre: 'Côté gauche', base: COTE, elements: LEFT_ELEMENTS },
    { id: 'ext-right', section: 'externe', zone: 'right', titre: 'Côté droit', base: COTE, elements: RIGHT_ELEMENTS, miroir: true },
    { id: 'ext-top', section: 'externe', zone: 'top', titre: 'Haut', base: HAUT, elements: HAUT_ELEMENTS },
    { id: 'ext-back', section: 'externe', zone: 'back', titre: 'Dos', base: DOS, elements: DOS_ELEMENTS },
    { id: 'int-left', section: 'interne', zone: 'left', titre: 'Intérieur : côté gauche', base: INT_COTE, elements: { LEFT_SIDE: rectEl(70, 50, 500, 150) } },
    { id: 'int-right', section: 'interne', zone: 'right', titre: 'Intérieur : côté droit', base: INT_COTE, elements: { RIGHT_SIDE: rectEl(70, 50, 500, 150) } },
    { id: 'int-top', section: 'interne', zone: 'top', titre: 'Intérieur : compartiment moteur', base: INT_MOTEUR, elements: { ENGINE_COMPARTMENT: rectEl(40, 40, 320, 180) } },
    { id: 'int-back', section: 'interne', zone: 'back', titre: 'Intérieur : coffre', base: INT_COFFRE, elements: { TRUNK_INSIDE: rectEl(50, 50, 300, 160) } },
  ];

  // Ramène une définition en pixels de référence sur la grille de base de sa vue.
  function projeter(def, base) {
    var pl = base.place, pts = function (l) { return l && l.map(function (q) { return pl(q[0], q[1]); }); };
    var zone = null;
    if (def.zone) {
      var a = pl(def.zone[0], def.zone[1]), b = pl(def.zone[0] + def.zone[2], def.zone[1] + def.zone[3]);
      zone = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    }
    return { contour: pts(def.contour), ancres: pts(def.ancres), zone: zone, chemin: pts(def.chemin) };
  }
  function projeterDecor(prims, base) {
    var pl = base.place, e = base.ech;
    return prims.map(function (p) {
      if (p.t === 'poly' || p.t === 'trait') return { t: p.t, role: p.role, pts: p.pts.map(function (q) { return pl(q[0], q[1]); }) };
      if (p.t === 'cercle') { var c = pl(p.cx, p.cy); return { t: 'cercle', role: p.role, cx: c[0], cy: c[1], r: p.r * e }; }
      return p;
    });
  }
  VUES.forEach(function (v) {
    v.decorBase = projeterDecor(v.base.decor, v.base);
    var els = {};
    Object.keys(v.elements).forEach(function (t) { els[t] = projeter(v.elements[t], v.base); });
    v.geo = els;
  });

  // Répartit n points en une ou deux rangées (colonnes si la zone est plus haute que large).
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

  // n points régulièrement espacés le long d'une ligne médiane (éléments en bandeau, comme le montant).
  function surChemin(chemin, n) {
    var longueurs = [0];
    for (var i = 1; i < chemin.length; i++) longueurs.push(longueurs[i - 1] + Math.hypot(chemin[i][0] - chemin[i - 1][0], chemin[i][1] - chemin[i - 1][1]));
    var total = longueurs[longueurs.length - 1], pts = [];
    for (var k = 0; k < n; k++) {
      var d = total * (k + 0.5) / n, j = 1;
      while (j < longueurs.length - 1 && longueurs[j] < d) j++;
      var t = (d - longueurs[j - 1]) / (longueurs[j] - longueurs[j - 1]);
      pts.push({ x: chemin[j - 1][0] + (chemin[j][0] - chemin[j - 1][0]) * t, y: chemin[j - 1][1] + (chemin[j][1] - chemin[j - 1][1]) * t });
    }
    return pts;
  }

  // Les points de NexPTG s'ils sont tous connus pour ce nombre de mesures, sinon une répartition dans l'élément.
  function pointsDe(g, n) {
    if (g.ancres && g.ancres.length === n) return g.ancres.map(function (q) { return { x: q[0], y: q[1] }; });
    return g.chemin ? surChemin(g.chemin, n) : placer(g.zone, n);
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
      if (p.t === 'poly' || p.t === 'trait') return { t: p.t, role: p.role, pts: p.pts.map(function (q) { return [X(q[0]), arrondi(q[1] * K)]; }) };
      if (p.t === 'cercle') return { t: 'cercle', role: p.role, cx: X(p.cx), cy: arrondi(p.cy * K), r: arrondi(p.r * K) };
      return { t: 'rect', role: p.role, x: arrondi(miroir ? W - (p.x + p.w) * K : p.x * K), y: arrondi(p.y * K), w: arrondi(p.w * K), h: arrondi(p.h * K), rx: p.rx };
    });
  }

  var liste = function (pts) { return pts.map(function (q) { return q[0] + ',' + q[1]; }).join(' '); };

  function svgDecor(prims) {
    return prims.map(function (p) {
      var c = 'nx-' + p.role;
      if (p.t === 'poly') return '<polygon class="' + c + '" points="' + liste(p.pts) + '"/>';
      if (p.t === 'trait') return '<polyline class="' + c + '" points="' + liste(p.pts) + '"/>';
      if (p.t === 'cercle') return '<circle class="' + c + '" cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"/>';
      return '<rect class="' + c + '" x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + p.rx + '"/>';
    }).join('');
  }

  // Rectangle englobant tout ce qui est dessiné (silhouettes, éléments, points) plus une marge, dans les limites du schéma.
  function cadreDe(decorFormes, elements, rayon, w, h) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    var ajouter = function (x, y, r) { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    decorFormes.forEach(function (f) {
      if (f.t === 'poly' || f.t === 'trait') f.pts.forEach(function (q) { ajouter(q[0], q[1], 0); });
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

  // Boîte englobante d'un contour (en coordonnées finales).
  function boite(contour) {
    var xs = contour.map(function (q) { return q[0]; }), ys = contour.map(function (q) { return q[1]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: arrondi(Math.max.apply(null, xs) - x0), h: arrondi(Math.max.apply(null, ys) - y0) };
  }

  function elementVue(vue, el) {
    var g = vue.geo[el.type];
    var W = vue.base.w * K;
    var X = function (x) { return arrondi(vue.miroir ? W - x * K : x * K); };
    var pts = pointsDe(g, el.valeurs.length);
    var contour = g.contour.map(function (q) { return [X(q[0]), arrondi(q[1] * K)]; });
    return {
      type: el.type, libelle: N.libelleElement(el.type), contour: contour, forme: boite(contour), tint: teinteElement(el.valeurs),
      stats: N.statsElement(el.valeurs),
      points: el.valeurs.map(function (v, i) {
        var c = N.categorie(v.interpretation);
        return {
          n: v.position !== null && v.position !== undefined ? v.position : i + 1,
          x: X(pts[i].x), y: arrondi(pts[i].y * K),
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
        var connus = zone.elements.filter(function (e) { return vue && vue.geo[e.type]; });
        zone.elements.forEach(function (e) {
          if (!vue || !vue.geo[e.type]) res.horsSchema.push({ section: section, zone: zone.zone, type: e.type });
        });
        if (!vue || !connus.length) return;
        var decorFormes = transformer(vue.decorBase, vue.base.w * K, vue.miroir);
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
