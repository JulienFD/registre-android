import { CHECK, DMG, PANELS, TYPES, VIEWS, WORKER, ckLabel } from './constants.js';
import { S, VV, api, flush, fmtD, fmtDT, fmtPlate, hist, limTxt, nomPdf, save, srcOf, toast } from './core.js';
import { renderSheet } from './sheet.js';

function L(s) { return String(s == null ? '' : s).replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '?') }
function imgFrom(src) { return new Promise(function (r) { var i = new Image(); i.onload = function () { r(i) }; i.onerror = function () { r(null) }; i.src = src }) }
async function pdfImg(p) {
  try {
    var i = await imgFrom(srcOf(p)); if (!i) return null;
    var k = Math.min(1, 1000 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k);
    c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); return { d: c.toDataURL('image/jpeg', .72), w: c.width, h: c.height }
  } catch (e) { return null }
}
function pdfCar(doc, k, ox, oy, sc, marks) {
  var vw = VIEWS[k];
  vw.sh.forEach(function (s) {
    if (s[0] === 'b') { doc.setFillColor(221, 228, 225); doc.setDrawColor(74, 93, 99) } else if (s[0] === 'g') { doc.setFillColor(255, 255, 255); doc.setDrawColor(74, 93, 99) } else { doc.setFillColor(60, 70, 74); doc.setDrawColor(30, 35, 38) }
    doc.setLineWidth(.3);
    if (s[1] === 'r') doc.roundedRect(ox + s[2] * sc, oy + s[3] * sc, s[4] * sc, s[5] * sc, s[6] * sc, s[6] * sc, 'FD'); else doc.circle(ox + s[2] * sc, oy + s[3] * sc, s[4] * sc, 'FD');
  });
  doc.setFontSize(6); doc.setTextColor(90, 105, 110);
  if (k === 'top') { doc.text('AVANT', ox + vw.w * sc / 2, oy + 5 * sc, { align: 'center' }); doc.text('ARRIERE', ox + vw.w * sc / 2, oy + (vw.h - 2) * sc, { align: 'center' }) }
  else doc.text('AVANT', ox + (k === 'left' ? 4 : vw.w - 4) * sc, oy + 158 * sc, { align: k === 'left' ? 'left' : 'right' });
  marks.forEach(function (m, i) {
    if (m.v !== k) return;
    var col = (DMG.filter(function (d) { return d[0] === m.t })[0] || DMG[5])[2];
    var rgb = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]); doc.setDrawColor(255, 255, 255); doc.setLineWidth(.3);
    var cx = ox + m.x / 100 * vw.w * sc, cy = oy + m.y / 100 * vw.h * sc; doc.circle(cx, cy, 2.4, 'FD');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.text(String(i + 1), cx, cy + 1, { align: 'center' }); doc.setFont('helvetica', 'normal');
  });
}
/* mode : 'entree', 'full' ou 'compl' (cid = identifiant du complément). */
export async function buildPdf(v, photos, mode, cid) {
  mode = mode || 'full';
  var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4' }), W = 210, M = 14, y = 0, curTitle = '';
  var ink = [22, 37, 42], mut = [90, 105, 110], acc = [14, 90, 107], bad = [179, 38, 30];
  function txt(t, x, yy, o) {
    o = o || {}; doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 10); var c = o.c || ink; doc.setTextColor(c[0], c[1], c[2]);
    var lines = o.w ? doc.splitTextToSize(L(t), o.w) : [L(t)]; doc.text(lines, x, yy, o.a ? { align: o.a } : undefined); return lines.length * ((o.s || 10) * 0.42)
  }
  function band(title, sub) { curTitle = title; doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(0, 0, W, 22, 'F'); txt('SP FORMATION · FD Formation Detailing', M, 9, { s: 9, c: [255, 255, 255] }); txt(title, M, 17, { s: 15, b: 1, c: [255, 255, 255] }); if (sub) txt(sub, W - M, 17, { s: 9, c: [255, 255, 255], a: 'right' }); y = 30 }
  function ens(h, title) { if (y + h > 282) { doc.addPage(); band(title || curTitle || 'ÉTAT DES LIEUX', fmtPlate(v.plaque)); } }
  function h2(t) { ens(14); txt(t.toUpperCase(), M, y, { s: 11, b: 1, c: acc }); doc.setDrawColor(200, 208, 205); doc.line(M, y + 1.6, W - M, y + 1.6); y += 7 }
  function kv(a, b, x, w) { txt(a.toUpperCase(), x, y, { s: 7, c: mut }); return txt(b || '-', x, y + 4, { s: 10, b: 1, w: w }) }
  function para(label, t) { if (!t) return; h2(label); var hgt = txt(t, M, y, { s: 10, w: W - 2 * M }); y += hgt + 5 }
  var es = photos.filter(function (p) { return p.phase === 'entree' }).sort(function (a, b) { return a.ts - b.ts });
  var xs = photos.filter(function (p) { return p.phase === 'sortie' }).sort(function (a, b) { return a.ts - b.ts });

  var cl = (S.cm[v.id] || []).slice().sort(function (a, b) { return a.ts - b.ts });
  async function complements(list) {
    for (var ci = 0; ci < list.length; ci++) {
      var cc = list[ci], cp = photos.filter(function (p) { return p.phase === 'compl' && p.cid === cc.id }).sort(function (a, b) { return a.ts - b.ts });
      ens(40); h2(fmtDT(cc.ts) + ' · ' + ckLabel(cc.kind) + ' · par ' + cc.by);
      if (cc.text) { var th = txt(cc.text, M, y, { s: 10, w: W - 2 * M }); y += th + 4 }
      var tw = (W - 2 * M - 8) / 3, th2 = tw * 0.75;
      for (var pi = 0; pi < cp.length; pi++) {
        var col = pi % 3; if (col === 0) ens(th2 + 12);
        var im = await pdfImg(cp[pi]), px = M + col * (tw + 4);
        if (im) { var rr = Math.min(tw / im.w, th2 / im.h); doc.addImage(im.d, 'JPEG', px, y, im.w * rr, im.h * rr) }
        txt(cp[pi].label || '', px, y + th2 + 4, { s: 7, c: mut, w: tw });
        if (col === 2 || pi === cp.length - 1) y += th2 + 10;
      }
      y += 4;
    }
  }
  function finish() {
    var n = doc.getNumberOfPages();
    for (var i = 1; i <= n; i++) { doc.setPage(i); txt('Plaque ' + fmtPlate(v.plaque) + ' · Dossier ' + v.id, M, 290, { s: 7.5, c: mut }); txt('Page ' + i + ' / ' + n + ' · généré le ' + fmtDT(Date.now()), W - M, 290, { s: 7.5, c: mut, a: 'right' }) }
    return doc.output('blob');
  }

  band(mode === 'full' ? 'DOSSIER COMPLET DU VÉHICULE' : mode === 'compl' ? 'COMPLÉMENT AU DOSSIER' : "ÉTAT DES LIEUX D'ENTRÉE", 'Dossier ' + v.id);
  doc.setFillColor(246, 246, 241); doc.setDrawColor(17, 17, 17); doc.setLineWidth(.6); doc.roundedRect(M, y - 2, 70, 16, 2, 2, 'FD');
  doc.setFillColor(31, 79, 163); doc.rect(M, y - 2, 7, 16, 'F'); txt('F', M + 3.5, y + 10, { s: 8, b: 1, c: [255, 255, 255], a: 'center' });
  txt(fmtPlate(v.plaque), M + 40, y + 9, { s: 20, b: 1, c: [17, 17, 17], a: 'center' });
  txt((TYPES[v.type] || { l: '' }).l.toUpperCase(), W - M, y + 4, { s: 11, b: 1, c: acc, a: 'right' });
  txt('Entrée validée le ' + (v.entreeAt ? fmtDT(v.entreeAt) : '(non validée)'), W - M, y + 10, { s: 9, c: mut, a: 'right' });
  y += 24;
  var cw = (W - 2 * M) / 3;
  kv('Marque / modèle', [v.marque, v.modele].filter(Boolean).join(' '), M, cw - 3); kv('Couleur', v.couleur, M + cw, cw - 3); kv('Kilométrage', v.km ? v.km + ' km' : '', M + 2 * cw, cw - 3); y += 12;
  if (mode === 'compl') { await complements(cl.filter(function (c) { return c.id === cid })); return finish() }
  kv('Carburant', v.fuel, M, cw - 3); kv('Clés remises', v.cles, M + cw, cw - 3); kv('Sortie prévue', v.sortiePrevue ? fmtD(v.sortiePrevue) : '', M + 2 * cw, cw - 3); y += 12;
  kv('Réceptionné par', v.recep, M, cw - 3); kv('Responsable du véhicule', v.resp, M + cw, cw - 3); kv('Rattaché à', v.rattache, M + 2 * cw, cw - 3); y += 12;
  kv('Client', v.clientNom, M, cw - 3); kv('Téléphone', v.clientTel, M + cw, cw - 3); kv('E-mail', v.clientMail, M + 2 * cw, cw - 3); y += 12;
  para('Ce qui doit être fait', v.ops); para('Ce qui a été dit au client', v.dit);
  if (v.dateLimite) { ens(16); h2('Engagement client'); y += txt('Date maximum promise : ' + limTxt(v) + '.   Engagement validé par : ' + (v.engageValide || 'non renseigné'), M, y, { s: 10, b: 1, w: W - 2 * M }) + 5 }
  para('À ne pas faire', v.exclu); para('Objets laissés à bord', v.objets);

  doc.addPage(); band('DOMMAGES ET CONTRÔLE', fmtPlate(v.plaque));
  var marks = v.marks || [];
  pdfCar(doc, 'top', M, y, 0.2, marks); pdfCar(doc, 'left', M + 48, y, 0.2, marks); pdfCar(doc, 'right', M + 48, y + 44, 0.2, marks);
  y += 0.2 * 400 + 4;
  txt('Vue de dessus · côté gauche (haut) · côté droit (bas)', M, y, { s: 7, c: mut }); y += 6;
  h2('Dommages relevés');
  if (!marks.length) { txt('Aucun dommage marqué sur le schéma.', M, y, { s: 10 }); y += 7 }
  marks.forEach(function (m, i) { ens(7); var d = DMG.filter(function (x) { return x[0] === m.t })[0] || DMG[5]; txt((i + 1) + '.  ' + d[1] + (m.n ? ' : ' + m.n : '') + '  (' + VIEWS[m.v].lab.toLowerCase() + ')', M, y, { s: 10, w: W - 2 * M }); y += 6 });
  y += 3; h2('Contrôle point par point');
  CHECK.forEach(function (c) {
    var s = (v.chk && v.chk[c.k]) || {}; ens(7);
    txt(c.l, M, y, { s: 9.5, w: 110 });
    var lab = s.s === 'ras' ? 'RAS' : s.s === 'def' ? 'DEFAUT' : s.s === 'na' ? 'N/A' : 'non relevé';
    txt(lab, M + 115, y, { s: 9.5, b: 1, c: s.s === 'def' ? bad : ink });
    if (s.s === 'def' && s.n) { txt(s.n, M + 135, y, { s: 9, w: W - M - 135 - M, c: bad }) }
    y += 6.2
  });

  var sigs = function (lab, s, x) {
    txt(lab.toUpperCase(), x, y, { s: 7, c: mut });
    if (s) { try { doc.addImage(s.img, 'JPEG', x, y + 2, 60, 20) } catch (e) { try { doc.addImage(s.img, 'PNG', x, y + 2, 60, 20) } catch (e2) { } } doc.setDrawColor(150, 160, 160); doc.rect(x, y + 2, 60, 20); txt((s.nom || '') + ' · ' + fmtDT(s.ts), x, y + 26, { s: 8, c: mut, w: 80 }) }
    else txt(v.clientAbsent && lab.indexOf('lient') > -1 ? 'Client absent à l\'arrivée' : 'Non signé', x, y + 10, { s: 9, c: mut })
  };
  ens(46); y += 4; h2("Signatures à l'entrée"); sigs('Réceptionnaire', v.sigRecep, M); sigs('Client', v.sigClient, M + 95); y += 34;
  txt("Les mentions ci-dessus ont été relevées à l'arrivée du véhicule et validées par signature.", M, y, { s: 8, c: mut, w: W - 2 * M });

  async function photoPages(list, title) {
    if (!list.length) return;
    doc.addPage(); band(title, fmtPlate(v.plaque));
    var bw = (W - 2 * M - 8) / 2, bh = bw * 0.75, col = 0, row = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (row === 3) { doc.addPage(); band(title, fmtPlate(v.plaque)); row = 0; col = 0 }
      var x = M + col * (bw + 8), yy = 30 + row * (bh + 14);
      txt((p.label || 'Photo'), x, yy, { s: 9, b: 1, w: bw });
      var im = await pdfImg(p);
      if (im) { var r = Math.min(bw / im.w, bh / im.h), w = im.w * r, h = im.h * r; doc.addImage(im.d, 'JPEG', x, yy + 2, w, h) }
      else { doc.setDrawColor(200, 208, 205); doc.rect(x, yy + 2, bw, bh); txt('Photo indisponible', x + 4, yy + 10, { s: 9, c: mut }) }
      txt(fmtDT(p.ts) + (p.by ? ' · ' + p.by : ''), x, yy + bh + 6, { s: 7.5, c: mut, w: bw });
      col++; if (col === 2) { col = 0; row++ }
    }
  }
  await photoPages(es, "PHOTOS D'ENTRÉE");

  async function pdfPages(p) {
    var title = 'ANALYSE NEXDIAG';
    try {
      if (!window.pdfjsLib) throw new Error('pdfjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
      var buf = await (await fetch(srcOf(p))).arrayBuffer();
      var pd = await pdfjsLib.getDocument({ data: buf }).promise;
      var n = Math.min(pd.numPages, 12);
      for (var i = 1; i <= n; i++) {
        var pg = await pd.getPage(i), vp = pg.getViewport({ scale: 1.6 }), c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        var cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: cx, viewport: vp }).promise;
        doc.addPage(); band(title, fmtPlate(v.plaque));
        txt(p.label + '  ·  page ' + i + ' / ' + pd.numPages, M, y, { s: 8, c: mut }); y += 4;
        var bw = W - 2 * M, bh = 282 - y, r = Math.min(bw / c.width, bh / c.height);
        doc.addImage(c.toDataURL('image/jpeg', .8), 'JPEG', M, y, c.width * r, c.height * r);
      }
    } catch (e) {
      doc.addPage(); band(title, fmtPlate(v.plaque));
      txt('Le PDF joint « ' + p.label + ' » n\'a pas pu être intégré à ce document. Il reste disponible dans le dossier, onglet Mesures.', M, y, { s: 10, w: W - 2 * M });
    }
  }
  var mes = v.mes || {}, mrows = PANELS.filter(function (q) { return mes[q[0]] });
  var mph = photos.filter(function (p) { return p.phase === 'mesures' && p.kind !== 'pdf' }).sort(function (a, b) { return a.ts - b.ts });
  var mpd = photos.filter(function (p) { return p.phase === 'mesures' && p.kind === 'pdf' }).sort(function (a, b) { return a.ts - b.ts });
  if (mode === 'full' && (mrows.length || v.mesNotes || mph.length || mpd.length)) {
    doc.addPage(); band("MESURES D'ÉPAISSEUR", fmtPlate(v.plaque));
    if (mrows.length) {
      h2('Épaisseurs relevées (microns)'); var c3 = (W - 2 * M) / 3;
      mrows.forEach(function (q, i) { if (i > 0 && i % 3 === 0) y += 11; kv(q[1], mes[q[0]] + ' µm', M + (i % 3) * c3, c3 - 3) }); y += 14;
    }
    para('Notes d\'analyse', v.mesNotes);
    if (!mrows.length && !v.mesNotes) { txt(mpd.length ? 'Analyse de l\'appareil jointe aux pages suivantes.' : 'Photos de mesure aux pages suivantes.', M, y, { s: 10 }) }
    await photoPages(mph, 'PHOTOS DE MESURE');
    for (var qi = 0; qi < mpd.length; qi++)await pdfPages(mpd[qi]);
  }

  if (mode === 'full' && cl.length) { doc.addPage(); band('COMPLÉMENTS AU DOSSIER', fmtPlate(v.plaque)); await complements(cl) }
  if (mode === 'full' && (v.statut === 'sorti' || xs.length)) {
    doc.addPage(); band('FICHE DE SORTIE', fmtPlate(v.plaque));
    var w3 = (W - 2 * M) / 3;
    kv('Date et heure de sortie', v.sortieAt ? fmtDT(v.sortieAt) : '(non validée)', M, w3 - 3); kv('Véhicule rendu par', v.remisPar, M + w3, w3 - 3); kv('Récupéré par (nom)', v.remisA, M + 2 * w3, w3 - 3); y += 14;
    para('À réaliser (rappel de la fiche d\'entrée)', v.ops);
    h2('Confirmation'); txt(v.opsFaites ? 'Tout ce qui figure dans la fiche a été fait ou signalé.' : 'Confirmation non cochée.', M, y, { s: 10 }); y += 8;
    para('Notes de sortie', v.notesSortie);
    ens(40); h2('Signature à la remise'); sigs('Personne qui récupère', v.sigSortie, M); y += 32;
    await photoPages(xs, 'PHOTOS DE SORTIE');
  }
  var hs = v.hist || [];
  if (mode === 'full' && hs.length) { doc.addPage(); band('HISTORIQUE DU DOSSIER', fmtPlate(v.plaque)); hs.forEach(function (h) { ens(10); var hh = txt(fmtDT(h.ts) + '  ·  ' + (h.by || '') + '  ·  ' + h.a, M, y, { s: 9, w: W - 2 * M }); y += Math.max(6, hh + 2) }) }
  return finish();
}
const LIBELLE = { entree: 'PDF d’entrée', full: 'PDF complet', compl: 'PDF du complément' };
const SOUS_DOSSIER = { entree: 'Entrees', full: 'Dossiers', compl: 'Dossiers' };
/* Copie dans le dossier choisi dans les réglages ; ecraser = false pour les PDF figés. Un échec n'invalide pas l'archive interne. */
async function copier(v, nom, bytes, ecraser) {
  try { await api.copier({ dossier: v.id, nom: nom, bytes: bytes, ecraser: ecraser }) }
  catch (e) { toast('Copie vers le dossier choisi impossible : ' + (e && e.message || 'erreur')) }
}
/* mode 'compl' : cid = identifiant du complément à mettre en PDF. */
export async function makePdf(mode, silent, cid) {
  mode = mode === 'entree' || mode === 'compl' ? mode : 'full';
  var v = VV(); if (!v || !S.cur) return null;
  if (!window.jspdf) { toast('Le module PDF ne s’est pas chargé. Relancer l’application.'); return null }
  await flush();
  if (!silent) toast('Génération du PDF…');
  try {
    var n = mode === 'compl' ? (S.cm[v.id] || []).slice().sort(function (a, b) { return a.ts - b.ts }).findIndex(function (c) { return c.id === cid }) + 1 : 0;
    var blob = await buildPdf(v, S.photos.slice(), mode, cid);
    var bytes = new Uint8Array(await blob.arrayBuffer()), nom = nomPdf(v, mode, n, Date.now());
    var r = await api.archive({ name: nom, sub: SOUS_DOSSIER[mode], bytes: bytes });
    await copier(v, nom, bytes, mode === 'full');
    save({ arch: (v.arch || []).concat([{ ts: Date.now(), mode: mode, rel: r.rel, sha: r.sha256 }]), hist: hist(v, LIBELLE[mode] + ' archivé en lecture seule : ' + r.rel + ' (empreinte ' + r.sha256.slice(0, 12) + ')') });
    renderSheet(true);
    if (silent) toast(LIBELLE[mode] + ' archivé : ' + r.rel);
    else { toast('PDF archivé en lecture seule : ' + r.rel); api.openFile(r.path) }
    return r;
  } catch (e) { toast('PDF non généré : ' + (e && (e.message || e.code) || 'erreur')); return null }
}
