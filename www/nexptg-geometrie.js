/* Géométrie des schémas NexPTG : silhouettes, contours des panneaux et points de mesure, en données pures. Sans DOM. */
(function (root) {
  'use strict';

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

  var NexptgGeometrie = { VUES: VUES };

  if (typeof module !== 'undefined' && module.exports) module.exports = NexptgGeometrie;
  else root.NexptgGeometrie = NexptgGeometrie;
})(typeof window !== 'undefined' ? window : globalThis);
