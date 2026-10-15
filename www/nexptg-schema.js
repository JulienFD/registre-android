/* Schémas indicatifs des mesures NexPTG : géométrie, placement des points et teintes. Fonctions pures, sans DOM. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;

  var K = 1.3; // les formes sont définies sur une grille de base, agrandie pour que les points restent touchables
  var RAYON = 14; // rayon d'un point, en unités du schéma ; plus gros sur les vues réduites à l'écran
  var VUES = (typeof module !== 'undefined' && module.exports ? require('./nexptg-geometrie.js') : root.NexptgGeometrie).VUES;

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
