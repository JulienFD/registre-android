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

  var CHAMPS_RECHERCHE = ['plaque', 'marque', 'modele', 'couleur', 'clientNom', 'clientTel', 'clientMail', 'rattache', 'resp', 'recep', 'ops'];

  function foldText(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  }

  /* Recherche libre (tous les mots, dans n'importe quel champ) + filtres type, responsable et retard. */
  function matchVehicle(v, f, now) {
    if (f.type && v.type !== f.type) return false;
    if (f.resp && v.resp !== f.resp) return false;
    if (f.retard && !(v.sortiePrevue && daysTo(v.sortiePrevue, now) < 0)) return false;
    var words = foldText(f.q).split(' ').filter(Boolean);
    if (!words.length) return true;
    var texte = CHAMPS_RECHERCHE.map(function (k) { return foldText(v[k]) }).join(' ');
    var compact = texte.replace(/ /g, '');
    return words.every(function (w) { return compact.indexOf(w) > -1 });
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

  var DEPOT_APK = 'https://github.com/JulienFD/registre-android/releases/download/';

  /* 'v1.2.3' ou '1.2.3' -> [1, 2, 3] ; null si le format n'est pas respecté. */
  function parseVersion(tag) {
    var m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(tag || ''));
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  /* versionCode Android : doit croître à chaque version, sinon la mise à jour est refusée. */
  function versionCode(tag) {
    var v = parseVersion(tag);
    return v ? v[0] * 10000 + v[1] * 100 + v[2] : null;
  }

  /* Réponse de l'API GitHub `releases/latest` -> { version, url } si plus récente que `courante`, sinon null. */
  function miseAJourDisponible(release, courante) {
    if (!release || release.draft || release.prerelease) return null;
    var nouvelle = versionCode(release.tag_name), actuelle = versionCode(courante);
    if (nouvelle === null || actuelle === null || nouvelle <= actuelle) return null;
    var apk = (release.assets || []).find(function (a) {
      return /\.apk$/.test(a.name) && String(a.browser_download_url).indexOf(DEPOT_APK) === 0;
    });
    return apk ? { version: parseVersion(release.tag_name).join('.'), url: apk.browser_download_url } : null;
  }

  /* La version de package.json doit dépasser tous les tags vX.Y.Z existants (sinon la release serait ignorée par les tablettes). */
  function verifierVersion(version, tags) {
    var code = versionCode(version);
    if (code === null) return { ok: false, erreur: 'Version "' + version + '" invalide : attendu X.Y.Z' };
    var derniere = (tags || []).filter(function (t) { return versionCode(t) !== null; })
      .sort(function (a, b) { return versionCode(b) - versionCode(a); })[0];
    if (derniere && code <= versionCode(derniere)) {
      return { ok: false, erreur: 'Version ' + version + ' déjà publiée ou antérieure à ' + derniere + ' : l\'augmenter dans package.json (npm version minor --no-git-tag-version)' };
    }
    return { ok: true };
  }

  var Utils = {
    verifierVersion: verifierVersion,
    parseVersion: parseVersion, versionCode: versionCode, miseAJourDisponible: miseAJourDisponible,
    TAMPON: TAMPON, normPlate: normPlate, fmtPlate: fmtPlate, fmtD: fmtD, daysTo: daysTo, due: due, limite: limite,
    missingForCreate: missingForCreate, missingForEntry: missingForEntry, sortieDefaut: sortieDefaut,
    formatPlate: formatPlate, plateValid: plateValid, plateKind: plateKind, sanitize: sanitize, RULES: RULES,
    invalidForEntry: invalidForEntry, matchVehicle: matchVehicle, entryErrors: entryErrors,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Utils;
  else root.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
