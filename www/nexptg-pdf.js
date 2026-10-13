/* Synthèse NexPTG du PDF du dossier : plan (pur, testable) puis dessin avec un document jsPDF fourni. Sans DOM. */
(function (root) {
  'use strict';

  var N = typeof module !== 'undefined' && module.exports ? require('./nexptg.js') : root.Nexptg;
  var S = typeof module !== 'undefined' && module.exports ? require('./nexptg-schema.js') : root.NexptgSchema;

  // Palette de l'application (thème clair), en RVB pour jsPDF.
  var COULEURS = {
    ok: [31, 122, 77], warn: [168, 90, 5], bad: [179, 38, 30], accent: [14, 90, 107], gris: [74, 93, 99],
    encre: [22, 37, 42], clair: [221, 228, 225], blanc: [255, 255, 255], roue: [60, 70, 74],
  };

  function couleurCode(classe) {
    var m = /^nx-[it]-(\d)$/.exec(classe);
    if (!m) return COULEURS.gris;
    var c = Number(m[1]);
    return c === 0 ? COULEURS.accent : c === 1 ? COULEURS.ok : c === 2 ? COULEURS.warn : COULEURS.bad;
  }
  function melange(c, t) { return c.map(function (v) { return Math.round(v + (255 - v) * t); }); }
  function dt(ts) { return ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
  function nombre(n) { return n === null ? '–' : String(n); }

  function formeVers(f, e) {
    var vide = e.tint === 'nx-t-vide', c = vide ? COULEURS.gris : couleurCode(e.tint);
    return { type: e.type, x: f.x, y: f.y, w: f.w, h: f.h, rx: f.rx, fill: vide ? null : melange(c, 0.72), stroke: c, dash: vide };
  }

  // Plan de la synthèse : tout ce qui sera écrit ou tracé, sans aucune mise en page. `o` : recu, par, nbVersions, avertissements.
  function planSynthese(rapport, o) {
    o = o || {};
    var v = rapport.vehicule;
    var infos = [['Technicien', o.par || ''], ['Reçu le', dt(o.recu)], ['Rapport créé le', dt(rapport.date)], ['Appareil', rapport.serie], ['Versions reçues', String(o.nbVersions || 1)],
      ['Marque', v.marque], ['Modèle', v.modele], ['Carrosserie', v.carrosserie], ['Cylindrée [ccm]', v.cylindree], ['Puissance [kW]', v.puissance],
      ['Énergie', v.energie], ['Millésime', v.millesime], ['VIN', v.vin]]
      .concat(rapport.champs.map(function (c) { return [c.titre, c.texte]; }))
      .filter(function (x) { return x[1]; });

    var schema = S.construire(rapport);
    var schemas = schema.externe.concat(schema.interne).map(function (vue) {
      return {
        id: vue.id, section: vue.section, titre: vue.titre, w: vue.w, h: vue.h, rayon: vue.rayon, cadre: vue.cadre,
        decor: vue.decorFormes,
        formes: vue.elements.map(function (e) { return formeVers(e.forme, e); }),
        points: vue.elements.reduce(function (acc, e) {
          return acc.concat(e.points.map(function (p) {
            var c = p.ignore ? COULEURS.gris : couleurCode(p.classe);
            return { type: e.type, n: p.n, x: p.x, y: p.y, stroke: c, plein: p.classe === 'nx-i-4' || p.classe === 'nx-i-5', ignore: p.ignore };
          }));
        }, []),
      };
    });

    // Tableaux : toutes les zones du rapport, schéma ou non, pour que le PDF reste un relevé complet.
    var tableaux = [];
    [['externe', 'Mesures externes'], ['interne', 'Mesures internes']].forEach(function (s) {
      rapport[s[0]].forEach(function (zone) {
        if (!zone.elements.length) return;
        tableaux.push({
          titre: s[1] + ' : ' + N.libelleZone(zone.zone),
          lignes: zone.elements.map(function (e) {
            var st = N.statsElement(e.valeurs);
            var sol = (e.valeurs.filter(function (x) { return x.valeur !== null && x.materiau; })[0] || {}).materiau || '–';
            return {
              element: N.libelleElement(e.type), sol: sol, min: nombre(st.min), max: nombre(st.max), moy: nombre(st.moyenne),
              releves: e.valeurs.map(function (x) {
                var k = N.categorie(x.interpretation);
                return { texte: x.valeur === null ? '–' : String(x.valeur), couleur: x.valeur === null ? COULEURS.gris : couleurCode(k.classe) };
              }),
            };
          }),
        });
      });
    });

    var pneus = rapport.pneus.filter(function (p) { return p.fabricant || p.largeur || p.valeur1 || p.valeur2; }).map(function (p) {
      var dim = [p.largeur, p.profil].filter(Boolean).join('/') + (p.diametre ? ' R' + p.diametre : '');
      return {
        roue: N.libelleRoue(p.emplacement),
        description: [p.fabricant, p.saison ? N.libelleSaison(p.saison) : '', dim].filter(Boolean).join(' · '),
        valeurs: [p.valeur1, p.valeur2].filter(Boolean).join(' / ') + (p.valeur1 || p.valeur2 ? ' [mm / in]' : ''),
      };
    });

    var legende = [1, 2, 3, 5, 0, -2].map(function (c) {
      var k = N.categorie(c);
      return { libelle: k.libelle, couleur: c === -2 ? COULEURS.gris : couleurCode(k.classe) };
    });

    return {
      titre: rapport.nom || 'Sans nom', infos: infos, commentaire: rapport.commentaire || '', avertissements: o.avertissements || [],
      schemas: schemas, tableaux: tableaux, pneus: pneus, legende: legende,
    };
  }

  /* ---- dessin ---- */

  // jsPDF n'embarque que les polices WinAnsi : on remplace ce qu'elles ne savent pas écrire.
  function L(s) { return String(s == null ? '' : s).replace(/[’‘]/g, '\'').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '?'); }

  function dessinerSchema(doc, s, x0, y0, k) {
    var pointille = function (on) { if (doc.setLineDashPattern) doc.setLineDashPattern(on ? [1, 0.8] : [], 0); };
    doc.setLineWidth(0.3);
    s.decor.forEach(function (d) {
      var fond = d.role === 'roue' ? COULEURS.roue : d.role === 'vitre' ? COULEURS.blanc : COULEURS.clair;
      doc.setFillColor(fond[0], fond[1], fond[2]); doc.setDrawColor(COULEURS.gris[0], COULEURS.gris[1], COULEURS.gris[2]);
      if (d.t === 'cercle') doc.circle(x0 + d.cx * k, y0 + d.cy * k, d.r * k, 'FD');
      else if (d.t === 'rect') doc.roundedRect(x0 + d.x * k, y0 + d.y * k, d.w * k, d.h * k, d.rx * k, d.rx * k, 'FD');
      else {
        var rel = d.pts.slice(1).map(function (p, i) { return [(p[0] - d.pts[i][0]) * k, (p[1] - d.pts[i][1]) * k]; });
        doc.lines(rel, x0 + d.pts[0][0] * k, y0 + d.pts[0][1] * k, [1, 1], 'FD', true);
      }
    });
    s.formes.forEach(function (f) {
      doc.setLineWidth(0.4); doc.setDrawColor(f.stroke[0], f.stroke[1], f.stroke[2]);
      pointille(f.dash);
      if (f.fill) { doc.setFillColor(f.fill[0], f.fill[1], f.fill[2]); doc.roundedRect(x0 + f.x * k, y0 + f.y * k, f.w * k, f.h * k, f.rx * k, f.rx * k, 'FD'); }
      else doc.roundedRect(x0 + f.x * k, y0 + f.y * k, f.w * k, f.h * k, f.rx * k, f.rx * k, 'D');
      pointille(false);
    });
    var r = s.rayon * k;
    s.points.forEach(function (p) {
      var cx = x0 + p.x * k, cy = y0 + p.y * k;
      doc.setLineWidth(0.5); doc.setDrawColor(p.stroke[0], p.stroke[1], p.stroke[2]);
      pointille(p.ignore);
      if (p.plein) doc.setFillColor(p.stroke[0], p.stroke[1], p.stroke[2]); else doc.setFillColor(255, 255, 255);
      doc.circle(cx, cy, r, 'FD');
      pointille(false);
      var t = p.plein ? COULEURS.blanc : COULEURS.encre;
      doc.setTextColor(t[0], t[1], t[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.max(5, Math.min(8, r * 2.3)));
      doc.text(String(p.n), cx, cy + r * 0.35, { align: 'center' });
    });
    doc.setFont('helvetica', 'normal');
  }

  /* h : x0, largeur, y (départ), assurer(hauteur, y) → y (ajoute une page si besoin et renvoie le y de reprise). Renvoie le y final. */
  function dessiner(doc, plan, h) {
    var M = h.x0, LARG = h.largeur, y = h.y;
    var gris = COULEURS.gris, encre = COULEURS.encre, acc = COULEURS.accent;

    function ecrire(t, x, yy, o) {
      o = o || {};
      doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9);
      var c = o.c || encre; doc.setTextColor(c[0], c[1], c[2]);
      var lignes = o.w ? doc.splitTextToSize(L(t), o.w) : [L(t)];
      doc.text(lignes, x, yy, o.a ? { align: o.a } : undefined);
      return lignes.length * (o.s || 9) * 0.42;
    }
    function section(texte) {
      y = h.assurer(14, y);
      ecrire(texte.toUpperCase(), M, y, { s: 11, b: 1, c: acc });
      doc.setDrawColor(200, 208, 205); doc.setLineWidth(0.2); doc.line(M, y + 1.6, M + LARG, y + 1.6);
      y += 7;
    }

    section('Rapport NexPTG : ' + plan.titre);
    var cw = LARG / 3;
    for (var i = 0; i < plan.infos.length; i += 3) {
      y = h.assurer(12, y);
      plan.infos.slice(i, i + 3).forEach(function (kv, j) {
        ecrire(kv[0].toUpperCase(), M + j * cw, y, { s: 7, c: gris });
        ecrire(kv[1] || '-', M + j * cw, y + 4, { s: 9.5, b: 1, w: cw - 3 });
      });
      y += 11;
    }
    if (plan.avertissements.length) { y = h.assurer(8, y); y += ecrire('À vérifier : ' + plan.avertissements.join(', ') + '.', M, y, { s: 9, c: COULEURS.bad, w: LARG }) + 3; }
    if (plan.commentaire) { y = h.assurer(12, y); ecrire('COMMENTAIRE NEXPTG', M, y, { s: 7, c: gris }); y += 4 + ecrire(plan.commentaire, M, y + 4, { s: 9.5, w: LARG }) + 3; }

    // Légende
    y = h.assurer(10, y);
    var lx = M;
    plan.legende.forEach(function (l) {
      var wtxt = doc.getTextWidth ? (doc.setFontSize(7.5), doc.getTextWidth(L(l.libelle))) : 30;
      if (lx + wtxt + 8 > M + LARG) { lx = M; y += 5; }
      doc.setFillColor(l.couleur[0], l.couleur[1], l.couleur[2]); doc.setDrawColor(l.couleur[0], l.couleur[1], l.couleur[2]);
      doc.circle(lx + 1.2, y - 1, 1.2, 'FD');
      ecrire(l.libelle, lx + 3.5, y, { s: 7.5, c: gris });
      lx += wtxt + 8;
    });
    y += 7;

    // Schémas : les vues larges sur une ligne, les autres deux par ligne.
    var vues = plan.schemas, i2 = 0, derniere = '';
    while (i2 < vues.length) {
      var s = vues[i2];
      if (s.section !== derniere) { derniere = s.section; section(s.section === 'externe' ? 'Mesures externes (schémas indicatifs)' : 'Mesures internes (schémas indicatifs)'); }
      var large = s.cadre.w / s.cadre.h >= 2, cellule = (LARG - 6) / 2, items;
      if (large) items = [s];
      else {
        var suiv = vues[i2 + 1];
        items = suiv && suiv.section === s.section && suiv.cadre.w / suiv.cadre.h < 2 ? [s, suiv] : [s];
      }
      var larg = large ? Math.min(LARG, 150) : cellule;
      var echelles = items.map(function (it) { return large ? larg / it.cadre.w : Math.min(cellule / it.cadre.w, 95 / it.cadre.h); });
      var hauteur = Math.max.apply(null, items.map(function (it, k) { return it.cadre.h * echelles[k]; }));
      y = h.assurer(hauteur + 12, y);
      items.forEach(function (it, k) {
        var w = it.cadre.w * echelles[k], x = large ? M + (LARG - w) / 2 : M + k * (cellule + 6) + (cellule - w) / 2;
        ecrire(it.titre, large ? M : M + k * (cellule + 6), y, { s: 9, b: 1 });
        // l'origine est décalée pour que le coin du cadre tombe en (x, y + 3)
        dessinerSchema(doc, it, x - it.cadre.x * echelles[k], y + 3 - it.cadre.y * echelles[k], echelles[k]);
      });
      y += hauteur + 10;
      i2 += items.length;
    }

    // Tableaux complets
    var colonnes = [['', 0], ['Sol', 52], ['Min', 62], ['Max', 74], ['Moy.', 86], ['Relevés', 99]];
    plan.tableaux.forEach(function (t) {
      y = h.assurer(20, y);
      ecrire(t.titre, M, y, { s: 9, b: 1, c: acc }); y += 4;
      doc.setFillColor(COULEURS.clair[0], COULEURS.clair[1], COULEURS.clair[2]); doc.rect(M, y - 3.6, LARG, 5.4, 'F');
      colonnes.forEach(function (c) { if (c[0]) ecrire(c[0], M + c[1], y, { s: 7.5, b: 1, c: gris }); });
      y += 5;
      t.lignes.forEach(function (l) {
        y = h.assurer(7, y);
        ecrire(l.element, M, y, { s: 8.5, b: 1, w: 50 });
        ecrire(l.sol, M + 52, y, { s: 8.5 }); ecrire(l.min, M + 62, y, { s: 8.5 }); ecrire(l.max, M + 74, y, { s: 8.5 }); ecrire(l.moy, M + 86, y, { s: 8.5 });
        var rx = M + 99;
        l.releves.forEach(function (r) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
          var w = doc.getTextWidth ? doc.getTextWidth(L(r.texte)) : 6;
          if (rx + w > M + LARG) { rx = M + 99; y += 4.6; y = h.assurer(5, y); }
          ecrire(r.texte, rx, y, { s: 8.5, b: 1, c: r.couleur });
          rx += w + 2.6;
        });
        doc.setDrawColor(225, 230, 228); doc.setLineWidth(0.15); doc.line(M, y + 1.8, M + LARG, y + 1.8);
        y += 6;
      });
      y += 4;
    });

    if (plan.pneus.length) {
      section('Pneus');
      plan.pneus.forEach(function (p) {
        y = h.assurer(7, y);
        ecrire(p.roue, M, y, { s: 9, b: 1 }); ecrire(p.description, M + 36, y, { s: 9, w: 100 }); ecrire(p.valeurs, M + LARG, y, { s: 9, a: 'right' });
        y += 6;
      });
    }
    return y;
  }

  var NexptgPdf = { planSynthese: planSynthese, dessiner: dessiner, COULEURS: COULEURS };

  if (typeof module !== 'undefined' && module.exports) module.exports = NexptgPdf;
  else root.NexptgPdf = NexptgPdf;
})(typeof window !== 'undefined' ? window : globalThis);
