import { $ } from './core.js';

/* Zoom de la visionneuse : pincer, double toucher, molette ; un doigt déplace l'image agrandie. */
var DELAI_DOUBLE_TOUCHER = 300, DEPLACEMENT_TOUCHER = 10;

export function initZoomPhoto() {
  var Z = window.Zoom, lb = $('#lightbox'), img = null, etat = Z.INITIAL, doigts = new Map(), dernierToucher = 0, bouge = false;
  function cadre() { var r = img.getBoundingClientRect(); return { w: img.offsetWidth, h: img.offsetHeight, cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }
  function appliquer() { img.style.transform = 'translate(' + etat.x + 'px,' + etat.y + 'px) scale(' + etat.echelle + ')' }
  // Le HTML de la visionneuse est reconstruit à chaque photo : on repart alors de la vue entière.
  function cibler(e) {
    var i = e.target.closest && e.target.closest('#lightbox > img'); if (!i) return false;
    if (i !== img) { img = i; etat = Z.INITIAL; doigts.clear(); dernierToucher = 0 }
    return true;
  }
  lb.addEventListener('pointerdown', function (e) {
    if (!cibler(e)) return;
    img.setPointerCapture(e.pointerId); doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    bouge = doigts.size > 1;
  });
  lb.addEventListener('pointermove', function (e) {
    if (!cibler(e) || !doigts.has(e.pointerId)) return;
    var p = doigts.get(e.pointerId), c = cadre(), avant = Array.from(doigts.values());
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: p.x0, y0: p.y0 });
    var apres = Array.from(doigts.values());
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > DEPLACEMENT_TOUCHER) bouge = true;
    if (apres.length === 2) {
      var d0 = Math.hypot(avant[0].x - avant[1].x, avant[0].y - avant[1].y), d1 = Math.hypot(apres[0].x - apres[1].x, apres[0].y - apres[1].y);
      var mx = (apres[0].x + apres[1].x) / 2 - c.cx, my = (apres[0].y + apres[1].y) / 2 - c.cy;
      var dx = (apres[0].x + apres[1].x - avant[0].x - avant[1].x) / 2, dy = (apres[0].y + apres[1].y - avant[0].y - avant[1].y) / 2;
      if (d0 > 0) etat = Z.zoomerVers(etat, d1 / d0, mx, my, c);
      etat = Z.limiter({ echelle: etat.echelle, x: etat.x + dx, y: etat.y + dy }, c);
    } else if (etat.echelle > 1) {
      etat = Z.limiter({ echelle: etat.echelle, x: etat.x + e.clientX - p.x, y: etat.y + e.clientY - p.y }, c);
    }
    appliquer();
  });
  function relever(e) {
    if (!cibler(e) || !doigts.has(e.pointerId)) return;
    doigts.delete(e.pointerId);
    if (e.type !== 'pointerup' || doigts.size || bouge) return;
    var now = Date.now();
    if (now - dernierToucher < DELAI_DOUBLE_TOUCHER) {
      var c = cadre(); etat = Z.basculer(etat, e.clientX - c.cx, e.clientY - c.cy, c); appliquer(); dernierToucher = 0;
    } else dernierToucher = now;
  }
  lb.addEventListener('pointerup', relever);
  lb.addEventListener('pointercancel', relever);
  lb.addEventListener('wheel', function (e) {
    if (!cibler(e)) return;
    e.preventDefault(); var c = cadre();
    etat = Z.zoomerVers(etat, Math.exp(-e.deltaY * 0.002), e.clientX - c.cx, e.clientY - c.cy, c); appliquer();
  }, { passive: false });
}
