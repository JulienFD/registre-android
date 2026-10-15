/* Client du relais NexPTG : fonctions pures, `fetch` injecté, sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  var DELAI_DEFAUT = 15000;
  // Limites d'un corps de requête chez Vercel (4,5 Mo) : un PDF plus gros part en parties.
  var PDF_UNIQUE_MAX = 4000000;
  var PDF_PARTIE = 3000000;

  function aleatoireHex(octets) {
    var b = new Uint8Array(octets), s = '';
    root.crypto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }

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
      if (corps instanceof Uint8Array) { init.headers['Content-Type'] = 'application/pdf'; init.body = corps; }
      else if (corps !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corps); }
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

    // Corps binaire (photo) : 200 donne les octets, 404 donne null, les autres statuts sont des erreurs codées.
    async function requeteOctets(chemin) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var minuteur = setTimeout(function () { if (ctl) ctl.abort(); }, delai);
      var init = { method: 'GET', cache: 'no-store', headers: { Authorization: autorisation } };
      if (ctl) init.signal = ctl.signal;
      var rep, donnees;
      try {
        rep = await appeler(base + chemin, init);
        if (rep.status === 200) donnees = new Uint8Array(await rep.arrayBuffer());
      } catch (e) {
        throw erreur('reseau', 'Relais injoignable');
      } finally {
        clearTimeout(minuteur);
      }
      if (rep.status === 200) return donnees;
      verifier({ statut: rep.status }, [404]);
      return null;
    }

    // Statuts d'échec communs ; les statuts « métier » (404, 409) sont laissés à l'appelant.
    function verifier(r, tolere) {
      if (r.statut === 200 || (tolere && tolere.indexOf(r.statut) > -1)) return r;
      if (r.statut === 401) throw erreur('auth', 'Identifiants refusés par le relais');
      if (r.statut === 403) throw erreur('interdit', 'Ce compte n\'est pas autorisé à lire les rapports');
      if (r.statut === 413) throw erreur('volumineux', 'Fichier trop volumineux pour le relais');
      if (r.statut === 400 || r.statut === 415) throw erreur('requete', 'Requête refusée par le relais');
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
      photos: async function (plaque) {
        var r = verifier(await requete('GET', '/api/photos?plaque=' + encodeURIComponent(normPlaque(plaque))));
        return r.json.photos || [];
      },
      photo: function (plaque, sha) {
        return requeteOctets('/api/photos?plaque=' + encodeURIComponent(normPlaque(plaque)) + '&sha=' + encodeURIComponent(sha));
      },
      reclamerPhoto: async function (sha, plaque, dossier) {
        var r = verifier(await requete('POST', '/api/photos', { sha256: sha, plaque: normPlaque(plaque), dossier: dossier }), [404, 409]);
        if (r.statut === 409) return { conflit: true, dossier: r.json.dossier || null };
        if (r.statut === 404) return { introuvable: true };
        return { ok: true, deja: !!r.json.deja };
      },
      libererPhoto: async function (sha, dossier) {
        var q = new URLSearchParams({ sha256: sha, dossier: dossier }).toString();
        verifier(await requete('DELETE', '/api/photos?' + q));
        return { ok: true };
      },
      // Dépose un PDF ; le lien renvoyé est secret et expire. Au-delà de la limite d'un envoi, il part en parties de 3 Mo.
      deposerPdf: async function (plaque, nom, octets) {
        var q = 'plaque=' + encodeURIComponent(normPlaque(plaque)) + '&nom=' + encodeURIComponent(nom);
        var volumineux = octets.length > PDF_UNIQUE_MAX, r;
        if (!volumineux) r = verifier(await requete('PUT', '/api/pdf?' + q, octets));
        else {
          var sur = Math.ceil(octets.length / PDF_PARTIE), envoi = aleatoireHex(16);
          for (var i = 0; i < sur; i++) {
            var morceau = octets.subarray(i * PDF_PARTIE, Math.min(octets.length, (i + 1) * PDF_PARTIE));
            r = verifier(await requete('PUT', '/api/pdf?' + q + '&envoi=' + envoi + '&partie=' + (i + 1) + '&sur=' + sur, morceau));
          }
        }
        return { id: r.json.id, lien: base + '/api/pdf?id=' + encodeURIComponent(r.json.id), expire: r.json.expire, volumineux: volumineux };
      },
      // Demande au relais d'envoyer le mail (SMTP). 503 : service de mail non configuré, l'appelant se rabat sur un envoi manuel.
      envoyerMailPdf: async function (id, mail, joindre) {
        var r = verifier(await requete('POST', '/api/pdf', { id: id, mail: mail, joindre: !!joindre }), [503]);
        if (r.statut === 503) return { indisponible: true };
        return { envoye: !!r.json.envoye, joint: !!r.json.joint };
      },
      liberer: async function (cle, dossier) {
        var q = new URLSearchParams({ cle: cle, dossier: dossier }).toString();
        verifier(await requete('DELETE', '/api/rapports?' + q));
        return { ok: true };
      },
    };
  }

  var MESSAGES = {
    auth: 'Identifiants refusés par le relais',
    interdit: 'Ce compte n\'est pas autorisé à lire les rapports',
    reseau: 'Relais injoignable : vérifier la connexion de la tablette',
    serveur: 'Le relais est indisponible, réessayer plus tard',
    reponse: 'Réponse du relais inattendue',
    requete: 'Requête refusée par le relais',
    volumineux: 'Le PDF est trop volumineux pour le relais (4 Mo maximum)',
  };

  // Message à montrer à l'utilisateur : jamais le texte brut d'une erreur technique.
  function messageErreur(e) {
    if (e && e.code === 'config') return e.message;
    return (e && MESSAGES[e.code]) || 'Opération impossible avec le relais';
  }

  // Phrase affichée après un envoi au client : précise la pièce jointe d'un PDF trop gros pour être seulement lié.
  function resumeEnvoi(o) {
    var nom = o.mode === 'full' ? 'PDF complet' : 'PDF d’entrée';
    if (o.indisponible) return nom + ' déposé sur le relais, mais le relais n’a pas de service de mail configuré : envoyer le lien manuellement.';
    var mo = (Math.round(o.taille / 1e5) / 10).toString().replace('.', ',');
    if (o.joint) return nom + ' envoyé à ' + o.mail + '. PDF volumineux (' + mo + ' Mo) : il est joint au mail, en plus du lien.';
    return nom + ' envoyé à ' + o.mail + ', avec le lien de téléchargement.';
  }

  var Relais = { creerClient: creerClient, normPlaque: normPlaque, messageErreur: messageErreur, resumeEnvoi: resumeEnvoi };

  if (typeof module !== 'undefined' && module.exports) module.exports = Relais;
  else root.Relais = Relais;
})(typeof window !== 'undefined' ? window : globalThis);
