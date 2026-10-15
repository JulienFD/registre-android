/* Rendu de l'onglet NexPTG : fonctions pures qui produisent du HTML à partir de l'état, sans DOM : testables sous Node. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;
  var S = typeof module !== 'undefined' && module.exports ? require('./nexptg-schema.js') : root.NexptgSchema;

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function dt(ts) { return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function heure(ts) { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }

  var categorie = N.categorie;

  function bouton(act, texte, classe, attrs) {
    return '<button class="btn' + (classe ? ' ' + classe : '') + '" data-act="' + act + '"' + (attrs || '') + '>' + texte + '</button>';
  }

  function etapes(ctx) {
    return '<ol class="hint nx-etapes"><li>Dans NexPTG, créer un rapport avec le champ supplémentaire <b>Immatriculation</b> = <b>' + esc(ctx.plaque) + '</b>.</li>' +
      '<li>Prendre les mesures, puis <b>Sauvegarder</b> : le rapport arrive ici tout seul.</li></ol>';
  }

  function choixMode() {
    return '<p class="hint">Comment les mesures sont-elles prises ?</p><div class="seg">' +
      bouton('nxMode', 'Automatique', 'pri', ' data-mode="auto"') + bouton('nxMode', 'Manuel', '', ' data-mode="manuel"') + '</div>' +
      '<p class="hint"><b>Automatique</b> : le rapport NexPTG arrive tout seul. <b>Manuel</b> : PDF, photos et épaisseurs saisis à la main.</p>';
  }

  function vueManuel() {
    return '<p>Mode <b>manuel</b> : ajouter le PDF, les photos et les épaisseurs ci-dessous.</p><div class="seg">' + bouton('nxMode', 'Passer en automatique', '', ' data-mode="auto"') + '</div>';
  }

  function vueAttente(ctx) {
    var corps;
    if (!ctx.relaisConfigure) {
      corps = '<div class="banner">Le relais NexPTG n’est pas configuré : ouvrir les <b>Réglages</b> (en haut à droite), section <b>Relais NexPTG</b>. ' +
        'Sans relais, les mesures ne peuvent pas être reçues : passer en mode manuel.</div>';
    } else if (ctx.techniciens === null) {
      corps = ctx.erreurTechniciens
        ? '<p class="nx-err">' + esc(ctx.erreurTechniciens) + '</p>' + bouton('nxRecharger', 'Réessayer')
        : '<p class="hint">Chargement des techniciens…</p>';
    } else if (!ctx.techniciens.length) {
      corps = '<p class="nx-err">Aucun technicien n’est déclaré sur le relais.</p>' + bouton('nxRecharger', 'Actualiser');
    } else {
      var seul = ctx.techniciens.length === 1;
      corps = '<label class="fld"><span>Qui va prendre les mesures ?</span><select id="nx-qui">' +
        (seul ? '' : '<option value="">Choisir un technicien</option>') +
        ctx.techniciens.map(function (n) { return '<option value="' + esc(n) + '"' + (seul ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') +
        '</select></label>' + etapes(ctx) + bouton('nxCommencer', 'Commencer les mesures', 'pri');
    }
    return corps + '<div class="seg">' + bouton('nxMode', 'Passer en manuel', '', ' data-mode="manuel"') + '</div>';
  }

  function vueCandidats(ctx) {
    if (!ctx.candidats || ctx.candidats.length < 2) return '';
    return '<div class="sec"><h3>Plusieurs rapports correspondent</h3><p class="hint">Choisir celui de ce véhicule : rien n’est rattaché automatiquement.</p><div class="vlist">' +
      ctx.candidats.map(function (c) {
        var b = c.brut || {};
        return '<div class="arow"><span class="grow"><b>' + esc(b.name || 'Sans nom') + '</b><br><span class="sv">Technicien ' + esc(c.par) + ' · reçu le ' + esc(dt(c.recu)) + '</span></span>' +
          bouton('nxChoisir', 'Rattacher', 'pri sm', ' data-sha="' + esc(c.sha256) + '"') + '</div>';
      }).join('') + '</div></div>';
  }

  function vueMesures(etat, ctx, dossier) {
    var qui = (dossier.nexptg && dossier.nexptg.qui) || '';
    return '<p>En attente du rapport de <b>' + esc(qui) + '</b>.</p>' +
      etapes(ctx) +
      (ctx.erreur ? '<p class="nx-err">' + esc(ctx.erreur) + '</p>' : '') +
      '<p class="hint">' + (ctx.occupe ? 'Vérification en cours…' : ctx.derniereVerif ? 'Dernière vérification à ' + esc(heure(ctx.derniereVerif)) + '.' : 'Vérification automatique toutes les quelques secondes.') + '</p>' +
      vueCandidats(ctx) +
      '<div class="seg">' + bouton('nxVerifier', 'Vérifier maintenant', 'pri') + bouton('nxMode', 'Passer en manuel', '', ' data-mode="manuel"') + bouton('nxTermine', 'Terminé sans rapport') + '</div>';
  }

  function chips(valeurs) {
    return valeurs.map(function (v) {
      var c = categorie(v.interpretation);
      var txt = v.valeur === null ? '–' : String(v.valeur);
      return '<span class="nx-pt ' + c.classe + '" title="' + esc(c.libelle) + '">' + esc(txt) + '</span>';
    }).join('');
  }

  function tableZone(zone, sansTitre) {
    var lignes = zone.elements.map(function (e) {
      var s = N.statsElement(e.valeurs);
      var sol = (e.valeurs.filter(function (v) { return v.valeur !== null && v.materiau; })[0] || {}).materiau || '–';
      var nb = function (n) { return n === null ? '–' : esc(n); };
      return '<tr><th scope="row">' + esc(N.libelleElement(e.type)) + '</th><td>' + esc(sol) + '</td><td>' + nb(s.min) + '</td><td>' + nb(s.max) + '</td><td>' + nb(s.moyenne) +
        '</td><td class="nx-rel">' + chips(e.valeurs) + '</td></tr>';
    }).join('');
    return (sansTitre ? '' : '<h4>' + esc(N.libelleZone(zone.zone)) + '</h4>') + '<div class="nx-scroll"><table class="nx-tab"><thead><tr><th></th><th>Sol</th><th>Min</th><th>Max</th><th>Moy.</th><th>Relevés</th></tr></thead><tbody>' + lignes + '</tbody></table></div>';
  }

  function vuePneus(pneus) {
    var utiles = pneus.filter(function (p) { return p.fabricant || p.largeur || p.valeur1 || p.valeur2; });
    if (!utiles.length) return '';
    return '<div class="sec"><h3>Pneus</h3><div class="vlist">' + utiles.map(function (p) {
      var dim = [p.largeur, p.profil].filter(Boolean).join('/') + (p.diametre ? ' R' + p.diametre : '');
      return '<div class="arow"><span class="grow"><b>' + esc(N.libelleRoue(p.emplacement)) + '</b><br><span class="sv">' +
        esc([p.fabricant, p.saison ? N.libelleSaison(p.saison) : '', dim].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="sv">' + esc([p.valeur1, p.valeur2].filter(Boolean).join(' / ')) + (p.valeur1 || p.valeur2 ? ' [mm / in]' : '') + '</span></div>';
    }).join('') + '</div></div>';
  }

  /* ---- schémas indicatifs ---- */

  function lecturePoint(vue, point) {
    var aide = '<span class="hint">Toucher un point pour lire sa valeur.</span>';
    if (!point || point.v !== vue.id) return aide;
    var el = vue.elements.filter(function (e) { return e.type === point.t; })[0];
    var p = el && el.points.filter(function (x) { return x.n === point.p; })[0];
    if (!p) return aide;
    return '<b>' + esc(el.libelle) + '</b> · point ' + esc(p.n) + '<br>' +
      (p.ignore
        ? '<span class="nx-pt nx-i-ignore">–</span> Mesure ignorée'
        : '<span class="nx-pt ' + p.classe + '">' + esc(p.valeur) + ' µm</span> ' + esc(p.materiau) + ' · ' + esc(p.libelle) + (p.ts ? ' · ' + esc(heure(p.ts)) : ''));
  }

  function svgVue(vue, point) {
    var formes = vue.elements.map(function (e) {
      var f = e.forme;
      return '<rect class="nx-el ' + e.tint + '" x="' + f.x + '" y="' + f.y + '" width="' + f.w + '" height="' + f.h + '" rx="' + f.rx + '"><title>' + esc(e.libelle) + '</title></rect>';
    }).join('');
    var points = vue.elements.map(function (e) {
      return e.points.map(function (p) {
        var sel = point && point.v === vue.id && point.t === e.type && point.p === p.n;
        var etiquette = e.libelle + ', point ' + p.n + ' : ' + (p.ignore ? 'mesure ignorée' : p.valeur + ' µm, ' + p.libelle);
        return '<g class="nx-p ' + p.classe + (sel ? ' nx-sel' : '') + '" data-act="nxPoint" data-vue="' + esc(vue.id) + '" data-t="' + esc(e.type) + '" data-p="' + esc(p.n) + '"' +
          ' role="button" tabindex="0" aria-label="' + esc(etiquette) + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
          '<circle class="nx-hit" cx="' + p.x + '" cy="' + p.y + '" r="' + (vue.rayon + 7) + '"/><circle class="nx-dot" cx="' + p.x + '" cy="' + p.y + '" r="' + vue.rayon + '"/>' +
          '<text x="' + p.x + '" y="' + p.y + '" dy=".35em" text-anchor="middle">' + esc(p.n) + '</text></g>';
      }).join('');
    }).join('');
    return '<svg class="nx-svg" viewBox="' + vue.cadre.x + ' ' + vue.cadre.y + ' ' + vue.cadre.w + ' ' + vue.cadre.h + '" role="group" aria-label="Schéma indicatif : ' + esc(vue.titre) + '">' + vue.decor + formes + points + '</svg>';
  }

  function carteSchema(vue, zone, ctx) {
    return '<div class="nx-sch"><div class="nx-sch-tete"><h4>' + esc(vue.titre) + ' <span class="nx-indic">schéma indicatif</span></h4>' +
      '<div class="nx-lecture" aria-live="polite">' + lecturePoint(vue, ctx.point) + '</div></div>' +
      svgVue(vue, ctx.point) +
      (zone ? '<details class="nx-det"><summary>Tableau des relevés</summary>' + tableZone(zone, true) + '</details>' : '') + '</div>';
  }

  function sectionMesures(titre, section, rapport, schema, ctx) {
    var cartes = schema[section].map(function (vue) {
      var zone = rapport[section].filter(function (z) { return z.elements.length && z.zone === vue.zone; })[0];
      return carteSchema(vue, zone, ctx);
    }).join('');
    // Éléments que le schéma ne connaît pas : ils restent visibles en tableau, rien n'est masqué.
    var hors = schema.horsSchema.filter(function (h) { return h.section === section; });
    var tableaux = rapport[section].map(function (z) {
      var types = hors.filter(function (h) { return h.zone === z.zone; }).map(function (h) { return h.type; });
      var els = z.elements.filter(function (e) { return types.indexOf(e.type) > -1; });
      return els.length ? '<h4>Sans schéma : ' + esc(N.libelleZone(z.zone)) + '</h4>' + tableZone({ zone: z.zone, elements: els }, true) : '';
    }).join('');
    return cartes || tableaux ? '<div class="sec"><h3>' + titre + '</h3>' + cartes + tableaux + '</div>' : '';
  }

  function vueRecu(etat, ctx) {
    var d = etat.derniere, r = N.lireRapport(d.brut);
    var v = r.vehicule, schema = S.construire(r);
    var champs = [['Marque', v.marque], ['Modèle', v.modele], ['Carrosserie', v.carrosserie], ['Énergie', v.energie], ['Millésime', v.millesime], ['VIN', v.vin]]
      .concat(r.champs.map(function (c) { return [c.titre, c.texte]; }))
      .filter(function (x) { return x[1]; });
    return '<div class="sec"><h3>Rapport NexPTG reçu</h3>' +
      '<p><b>' + esc(r.nom || 'Sans nom') + '</b> · technicien ' + esc(d.par) + ' · reçu le ' + esc(dt(d.recu)) +
      (etat.nbVersions > 1 ? ' · <span class="sv">' + esc(etat.nbVersions) + ' versions reçues, la dernière est affichée</span>' : '') + '</p>' +
      (champs.length ? '<div class="nx-champs">' + champs.map(function (c) { return '<span><em class="nx-k">' + esc(c[0]) + '</em> ' + esc(c[1]) + '</span>'; }).join('') + '</div>' : '') +
      (d.avertissements && d.avertissements.length ? '<p class="nx-err">À vérifier : ' + esc(d.avertissements.join(', ')) + '.</p>' : '') +
      (r.commentaire ? '<div class="remind"><b>Commentaire NexPTG</b>' + esc(r.commentaire) + '</div>' : '') +
      '<p class="hint nx-legende">' + [1, 2, 3, 5, 0, -2].map(function (c) { var k = categorie(c); return '<span class="nx-pt ' + k.classe + '">&nbsp;</span> ' + esc(k.libelle); }).join(' · ') + '</p></div>' +
      sectionMesures('Mesures externes', 'externe', r, schema, ctx) + sectionMesures('Mesures internes', 'interne', r, schema, ctx) + vuePneus(r.pneus);
  }

  function vueTermine(etat) {
    var t = etat.termine;
    return '<div class="banner"><b>Terminé sans rapport NexPTG.</b> Aucune mesure NexPTG n’est jointe à ce dossier.<br>' +
      'Motif : ' + esc(t.motif) + '<br><span class="sv">Par ' + esc(t.par || '—') + ' le ' + esc(dt(t.at)) + '</span></div>';
  }

  // etat : résultat de etatNexptg ; ctx : état d'affichage (relais, erreurs, candidats) ; dossier : le dossier.
  function vue(etat, ctx, dossier) {
    dossier = dossier || {};
    var corps;
    if (etat.statut === 'recu') return vueRecu(etat, ctx);
    if (etat.statut === 'termine') corps = vueTermine(etat);
    else if (etat.statut === 'mesures') corps = vueMesures(etat, ctx, dossier);
    else if (etat.statut === 'manuel') corps = vueManuel();
    else if (!(dossier.nexptg && dossier.nexptg.mode === 'auto')) corps = choixMode();
    else corps = vueAttente(ctx);
    return '<div class="sec"><h3>Mesures NexPTG</h3>' + corps + '</div>';
  }

  var NexptgVue = { vue: vue, categorie: categorie };

  if (typeof module !== 'undefined' && module.exports) module.exports = NexptgVue;
  else root.NexptgVue = NexptgVue;
})(typeof window !== 'undefined' ? window : globalThis);
