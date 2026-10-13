/* Client du relais NexPTG : fonctions pures, `fetch` injecté, sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  var DELAI_DEFAUT = 15000;

  // Erreur à code stable (auth, interdit, requete, serveur, reponse, reseau) ; le message ne contient jamais d'identifiant.
  function erreur(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function enBase64(texte) {
    var octets = new TextEncoder().encode(texte), s = '';
    for (var i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
    return btoa(s);
  }

  function normPlaque(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function baseHttps(url) {
    var u;
    try { u = new URL(String(url)); } catch (e) { throw erreur('config', 'Adresse du relais invalide : HTTPS obligatoire'); }
    if (u.protocol !== 'https:') throw erreur('config', 'Adresse du relais invalide : HTTPS obligatoire');
    return u.origin + u.pathname.replace(/\/+$/, '');
  }

  function creerClient(conf, fetchImpl) {
    conf = conf || {};
    var base = baseHttps(conf.url);
    if (!conf.compte) throw erreur('config', 'Compte du relais manquant (compte)');
    if (!conf.motDePasse) throw erreur('config', 'Mot de passe du relais manquant (mot de passe)');
    var autorisation = 'Basic ' + enBase64(conf.compte + ':' + conf.motDePasse);
    var delai = conf.delaiMs || DELAI_DEFAUT;
    var appeler = fetchImpl || function (u, i) { return root.fetch(u, i); };

    // Renvoie { statut, json }. Une panne réseau, un délai dépassé ou une réponse illisible deviennent des erreurs codées.
    async function requete(methode, chemin, corps) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var minuteur = setTimeout(function () { if (ctl) ctl.abort(); }, delai);
      var init = { method: methode, cache: 'no-store', headers: { Authorization: autorisation } };
      if (corps !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corps); }
      if (ctl) init.signal = ctl.signal;
      var rep, texte;
      try {
        rep = await appeler(base + chemin, init);
        texte = await rep.text();
      } catch (e) {
        throw erreur('reseau', 'Relais injoignable');
      } finally {
        clearTimeout(minuteur);
      }
      var json;
      try { json = JSON.parse(texte); } catch (e) { throw erreur('reponse', 'Réponse du relais illisible'); }
      return { statut: rep.status, json: json };
    }

    // Statuts d'échec communs ; les statuts « métier » (404, 409) sont laissés à l'appelant.
    function verifier(r, tolere) {
      if (r.statut === 200 || (tolere && tolere.indexOf(r.statut) > -1)) return r;
      if (r.statut === 401) throw erreur('auth', 'Identifiants refusés par le relais');
      if (r.statut === 403) throw erreur('interdit', 'Ce compte n\'est pas autorisé à lire les rapports');
      if (r.statut === 400 || r.statut === 413) throw erreur('requete', 'Requête refusée par le relais');
      throw erreur('serveur', 'Le relais est indisponible');
    }

    return {
      techniciens: async function () {
        var r = verifier(await requete('GET', '/api/techniciens'));
        return r.json.techniciens || [];
      },
      rapports: async function (plaque, par) {
        var q = 'plaque=' + encodeURIComponent(normPlaque(plaque)) + (par ? '&par=' + encodeURIComponent(par) : '');
        var r = verifier(await requete('GET', '/api/rapports?' + q));
        return r.json.rapports || [];
      },
      reclamer: async function (cle, plaque, dossier) {
        var r = verifier(await requete('POST', '/api/rapports', { cle: cle, plaque: normPlaque(plaque), dossier: dossier }), [404, 409]);
        if (r.statut === 409) return { conflit: true, dossier: r.json.dossier || null };
        if (r.statut === 404) return { introuvable: true };
        return { ok: true, deja: !!r.json.deja };
      },
      liberer: async function (cle, dossier) {
        var q = new URLSearchParams({ cle: cle, dossier: dossier }).toString();
        verifier(await requete('DELETE', '/api/rapports?' + q));
        return { ok: true };
      },
    };
  }

  var Relais = { creerClient: creerClient, normPlaque: normPlaque };

  if (typeof module !== 'undefined' && module.exports) module.exports = Relais;
  else root.Relais = Relais;
})(typeof window !== 'undefined' ? window : globalThis);
