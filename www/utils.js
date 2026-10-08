/* Fonctions pures (plaques, dates, échéances), sans accès au DOM : testables sous Node. */
(function (root) {
  'use strict';

  var TAMPON = '2100-01-01';
  var MS_PAR_JOUR = 864e5;

  function normPlate(p) {
    return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function fmtPlate(p) {
    var n = normPlate(p);
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(n)) return n.slice(0, 2) + '-' + n.slice(2, 5) + '-' + n.slice(5);
    return p || '—';
  }

  function fmtD(iso) {
    return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /* Nombre de jours entre `now` (aujourd'hui par défaut) et la date ISO ; négatif si passée. */
  function daysTo(iso, now) {
    var a = new Date(iso + 'T00:00');
    var b = new Date(now || Date.now());
    b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / MS_PAR_JOUR);
  }

  function due(v, now) {
    if (!v.sortiePrevue) return { t: 'Sortie à fixer', c: 'warn' };
    var d = daysTo(v.sortiePrevue, now);
    if (d < 0) return { t: 'En retard de ' + (-d) + ' j', c: 'bad' };
    if (d === 0) return { t: "Sort aujourd'hui", c: 'warn' };
    if (d === 1) return { t: 'Sort demain', c: 'ok' };
    return { t: 'Sort ' + fmtD(v.sortiePrevue), c: 'ok' };
  }

  function limite(v, now) {
    if (!v.dateLimite) return null;
    if (v.dateLimite === TAMPON) return { t: 'Voiture tampon', c: '' };
    var d = daysTo(v.dateLimite, now);
    if (d < 0) return { t: 'Limite client dépassée (' + fmtD(v.dateLimite) + ')', c: 'bad' };
    return { t: 'Limite client ' + fmtD(v.dateLimite), c: d <= 1 ? 'warn' : '' };
  }

  var Utils = { TAMPON: TAMPON, normPlate: normPlate, fmtPlate: fmtPlate, fmtD: fmtD, daysTo: daysTo, due: due, limite: limite };

  if (typeof module !== 'undefined' && module.exports) module.exports = Utils;
  else root.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
