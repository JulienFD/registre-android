/* Zoom des photos en plein écran : calcul de l'échelle et du décalage. Fonctions pures, sans DOM : testables sous Node.
   Un état est { echelle, x, y } ; x et y décalent l'image par rapport au centre du cadre, en pixels. */
(function (root) {
  'use strict';

  var ECHELLE_MAX = 5;
  var ECHELLE_DOUBLE_TAP = 2.5;
  var INITIAL = { echelle: 1, x: 0, y: 0 };

  // Échelle bornée, et décalage tel que l'image couvre toujours le cadre.
  function limiter(e, cadre) {
    var echelle = Math.min(ECHELLE_MAX, Math.max(1, e.echelle));
    if (echelle === 1) return { echelle: 1, x: 0, y: 0 };
    var mx = (echelle - 1) * cadre.w / 2, my = (echelle - 1) * cadre.h / 2;
    return { echelle: echelle, x: Math.min(mx, Math.max(-mx, e.x)), y: Math.min(my, Math.max(-my, e.y)) };
  }

  // Multiplie l'échelle par facteur en gardant fixe le point (cx, cy), mesuré depuis le centre du cadre.
  function zoomerVers(e, facteur, cx, cy, cadre) {
    var echelle = Math.min(ECHELLE_MAX, Math.max(1, e.echelle * facteur)), r = echelle / e.echelle;
    return limiter({ echelle: echelle, x: cx - (cx - e.x) * r, y: cy - (cy - e.y) * r }, cadre);
  }

  // Double toucher : agrandit autour du point touché, ou revient à la vue entière si déjà agrandi.
  function basculer(e, cx, cy, cadre) {
    return e.echelle > 1 ? INITIAL : zoomerVers(e, ECHELLE_DOUBLE_TAP, cx, cy, cadre);
  }

  var Zoom = { ECHELLE_MAX: ECHELLE_MAX, INITIAL: INITIAL, limiter: limiter, zoomerVers: zoomerVers, basculer: basculer };

  if (typeof module !== 'undefined' && module.exports) module.exports = Zoom;
  else root.Zoom = Zoom;
})(typeof window !== 'undefined' ? window : globalThis);
