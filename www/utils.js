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

  /* Champs obligatoires de l'entrée, dans l'ordre d'affichage du formulaire. */
  var ENTREE_REQUIS = ['plaque', 'type', 'resp', 'ops', 'dateLimite', 'engageValide', 'sortiePrevue', 'recep'];
  var CREATION_REQUIS = ['plaque', 'type', 'recep'];

  function manquants(v, cles) {
    return cles.filter(function (k) {
      return k === 'plaque' ? !plateValid(v.plaque, v.plaqueType || plateKind(v.plaque)) : !String(v[k] || '').trim();
    });
  }

  function missingForEntry(v) {
    return manquants(v, ENTREE_REQUIS);
  }

  function missingForCreate(v) {
    return manquants(v, CREATION_REQUIS);
  }

  /* Date de sortie proposée d'après la date limite client ; null si on ne doit rien préremplir. */
  function sortieDefaut(v, today) {
    if (v.sortiePrevue || !v.dateLimite || v.dateLimite === TAMPON || v.dateLimite < today) return null;
    return v.dateLimite;
  }

  var LETTRE_SIV = /[A-HJ-NP-TV-Z]/;
  var SIV = /^[A-HJ-NP-TV-Z]{2}\d{3}[A-HJ-NP-TV-Z]{2}$/;

  /* Plaque en cours de saisie : française (SIV, AB-123-CD) ou étrangère (texte libre borné). */
  function formatPlate(raw, kind) {
    var s = String(raw || '').toUpperCase();
    if (kind === 'etr') {
      s = s.replace(/[^\p{L}0-9 -]/gu, '').replace(/^[ -]+/, '').replace(/([ -])[ -]+/g, '$1');
      return s.slice(0, 12);
    }
    var out = '';
    s.replace(/[^A-Z0-9]/g, '').split('').forEach(function (c) {
      var n = out.length;
      var lettre = n < 2 || n > 4;
      if (n < 7 && (lettre ? LETTRE_SIV.test(c) : /\d/.test(c))) out += c;
    });
    return [out.slice(0, 2), out.slice(2, 5), out.slice(5)].filter(Boolean).join('-');
  }

  function plateValid(p, kind) {
    if (kind === 'etr') return normPlate(p).length >= 2;
    return SIV.test(normPlate(p));
  }

  /* Anciens dossiers sans type de plaque enregistré. */
  function plateKind(p) {
    return !normPlate(p) || SIV.test(normPlate(p)) ? 'fr' : 'etr';
  }

  function sanitize(value, rule) {
    var s = String(value == null ? '' : value).replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').replace(/^\s+/, '');
    if (rule.digits) s = s.replace(/\D/g, '');
    if (rule.chars) s = s.replace(rule.chars, '');
    if (rule.noSpace) s = s.replace(/\s/g, '');
    return rule.max ? s.slice(0, rule.max) : s;
  }

  /* Règles de saisie par champ : longueur maximale et caractères admis. */
  var RULES = {
    marque: { max: 30 }, modele: { max: 40 }, couleur: { max: 30 },
    km: { digits: true, max: 7 }, cles: { digits: true, max: 2 }, objets: { max: 500 },
    rattache: { max: 100 }, resp: { max: 40 }, recep: { max: 40 }, engageValide: { max: 40 },
    ops: { max: 1000 }, dit: { max: 1000 }, exclu: { max: 500 },
    clientNom: { max: 60 }, clientTel: { chars: /[^0-9+().\- ]/g, max: 20 }, clientMail: { noSpace: true, max: 100 },
    mesNotes: { max: 1000 }, notesSortie: { max: 1000 }, remisPar: { max: 40 }, remisA: { max: 40 }
  };

  function dateValide(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m || m[1] < 2000 || m[1] > 2100) return false;
    var d = new Date(iso + 'T12:00');
    return !isNaN(d) && d.getDate() === +m[3];
  }

  var ORDRE = ['plaque', 'type', 'resp', 'ops', 'dateLimite', 'engageValide', 'sortiePrevue', 'recep', 'clientNom', 'clientTel', 'clientMail'];

  /* Champs saisis mais mal formés (les facultatifs vides ne comptent pas). */
  function invalidForEntry(v) {
    var tel = String(v.clientTel || '').replace(/\D/g, '').length;
    return ORDRE.filter(function (k) {
      if (k === 'clientTel') return !!v.clientTel && (tel < 6 || tel > 15);
      if (k === 'clientMail') return !!v.clientMail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.clientMail);
      if (k === 'dateLimite' || k === 'sortiePrevue') return !!v[k] && !dateValide(v[k]);
      return false;
    });
  }

  function entryErrors(v) {
    var tous = missingForEntry(v).concat(invalidForEntry(v));
    return ORDRE.filter(function (k) { return tous.indexOf(k) > -1; });
  }

  var Utils = {
    TAMPON: TAMPON, normPlate: normPlate, fmtPlate: fmtPlate, fmtD: fmtD, daysTo: daysTo, due: due, limite: limite,
    missingForCreate: missingForCreate, missingForEntry: missingForEntry, sortieDefaut: sortieDefaut,
    formatPlate: formatPlate, plateValid: plateValid, plateKind: plateKind, sanitize: sanitize, RULES: RULES,
    invalidForEntry: invalidForEntry, entryErrors: entryErrors,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Utils;
  else root.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
