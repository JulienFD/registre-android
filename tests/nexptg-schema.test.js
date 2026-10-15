const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { construire, teinteElement } = require('../www/nexptg-schema.js');
const { lireRapport } = require('../www/nexptg.js');

const brut = (nom) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8')).data.reports[0];
const complet = () => construire(lireRapport(brut('nexptg-rapport.json')));
const partiel = () => construire(lireRapport(brut('nexptg-rapport-mesures-ignorees.json')));
const vueDe = (s, id) => s.externe.concat(s.interne).filter((v) => v.id === id)[0];
const elDe = (v, type) => v.elements.filter((e) => e.type === type)[0];

test('un rapport complet donne quatre vues extérieures et quatre vues intérieures, dans l\'ordre', () => {
  const s = complet();
  assert.deepEqual(s.externe.map((v) => v.id), ['ext-left', 'ext-right', 'ext-top', 'ext-back']);
  assert.deepEqual(s.interne.map((v) => v.id), ['int-left', 'int-right', 'int-top', 'int-back']);
  assert.deepEqual(s.externe.map((v) => v.titre), ['Côté gauche', 'Côté droit', 'Haut', 'Dos']);
});

test('chaque élément a autant de points que de mesures, numérotés comme dans NexPTG', () => {
  const v = vueDe(complet(), 'ext-left');
  assert.deepEqual(v.elements.map((e) => e.type), ['LEFT_FRONT_FENDER', 'LEFT_FRONT_DOOR', 'LEFT_REAR_DOOR', 'LEFT_PILLAR', 'LEFT_REAR_FENDER']);
  assert.deepEqual(elDe(v, 'LEFT_FRONT_FENDER').points.map((p) => p.n), [1, 2, 3, 4]);
  assert.equal(elDe(v, 'LEFT_FRONT_DOOR').points.length, 7);
  assert.equal(vueDe(complet(), 'int-left').elements[0].points.length, 8);
});

test('un point porte sa valeur, sa couleur et son libellé', () => {
  const p = elDe(vueDe(complet(), 'ext-left'), 'LEFT_FRONT_FENDER').points[0];
  assert.equal(p.valeur, 193);
  assert.equal(p.materiau, 'Fe');
  assert.equal(p.classe, 'nx-i-2');
  assert.equal(p.libelle, 'Seconde couche');
  assert.equal(p.ignore, false);
});

test('une mesure ignorée devient un point grisé sans valeur', () => {
  const p = elDe(vueDe(partiel(), 'ext-left'), 'LEFT_FRONT_FENDER').points[0];
  assert.equal(p.ignore, true);
  assert.equal(p.valeur, null);
  assert.equal(p.classe, 'nx-i-ignore');
});

test('tous les points sont dans leur élément, dans le cadre du schéma, et ne se chevauchent pas', () => {
  const s = complet();
  for (const v of s.externe.concat(s.interne)) {
    for (const e of v.elements) {
      const f = e.forme;
      assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.w <= v.w && f.y + f.h <= v.h, v.id + ' ' + e.type + ' hors cadre');
      for (const p of e.points) {
        assert.ok(p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h, v.id + ' ' + e.type + ' point ' + p.n + ' hors de l\'élément');
      }
      for (let i = 0; i < e.points.length; i++) {
        for (let j = i + 1; j < e.points.length; j++) {
          const d = Math.hypot(e.points[i].x - e.points[j].x, e.points[i].y - e.points[j].y);
          assert.ok(d >= 2 * v.rayon + 4, v.id + ' ' + e.type + ' points ' + e.points[i].n + ' et ' + e.points[j].n + ' trop proches (' + Math.round(d) + ')');
        }
      }
    }
  }
});

test('la vue de dessus, plus réduite à l\'écran, a des points plus gros pour rester touchables', () => {
  const s = complet();
  assert.ok(vueDe(s, 'ext-top').rayon > vueDe(s, 'ext-left').rayon);
});

test('la vue de droite est le miroir de celle de gauche, les numéros restent les mêmes', () => {
  const s = complet();
  const g = vueDe(s, 'ext-left'), d = vueDe(s, 'ext-right');
  const eg = elDe(g, 'LEFT_FRONT_DOOR'), ed = elDe(d, 'RIGHT_FRONT_DOOR');
  assert.equal(ed.points.length, eg.points.length);
  assert.equal(Math.round(ed.forme.x + ed.forme.w), Math.round(g.w - eg.forme.x));
  assert.equal(Math.round(ed.points[0].x), Math.round(g.w - eg.points[0].x));
  assert.deepEqual(ed.points.map((p) => p.n), eg.points.map((p) => p.n));
});

test('la teinte d\'un élément est celle de sa mesure la plus défavorable, hors mesures ignorées', () => {
  const m = (i) => ({ valeur: i < 0 ? null : 100, interpretation: i });
  assert.equal(teinteElement([m(2), m(2), m(2), m(5)]), 'nx-t-5');
  assert.equal(teinteElement([m(1), m(1)]), 'nx-t-1');
  assert.equal(teinteElement([m(1), m(2)]), 'nx-t-2');
  assert.equal(teinteElement([m(-2), m(-2)]), 'nx-t-vide');
  assert.equal(teinteElement([m(-2), m(1)]), 'nx-t-1');
  assert.equal(teinteElement([]), 'nx-t-vide');
});

test('un élément inconnu de NexPTG n\'est jamais perdu : il est listé hors schéma', () => {
  const b = brut('nexptg-rapport.json');
  b.data[0].data.push({ type: 'LEFT_MIRROR', values: [{ value: '90', interpretation: 1, type: 'Fe', timestamp: 1, position: 1 }] });
  const s = construire(lireRapport(b));
  assert.deepEqual(s.horsSchema.map((h) => [h.section, h.zone, h.type]), [['externe', 'left', 'LEFT_MIRROR']]);
  assert.equal(elDe(vueDe(s, 'ext-left'), 'LEFT_MIRROR'), undefined);
});

test('une section vide du rapport ne produit aucune vue', () => {
  const s = partiel();
  assert.equal(s.externe.length, 4);
  assert.deepEqual(s.interne, []);
  assert.deepEqual(s.horsSchema, []);
});

test('chaque vue expose ses silhouettes en primitives (polygones, cercles, rectangles) dans le cadre du schéma', () => {
  const s = complet();
  for (const v of s.externe.concat(s.interne)) {
    assert.ok(v.decorFormes.length > 0, v.id);
    for (const f of v.decorFormes) {
      assert.ok(['caisse', 'vitre', 'montant', 'roue', 'jante', 'feu', 'trait'].includes(f.role), v.id + ' rôle ' + f.role);
      const pts = f.t === 'poly' || f.t === 'trait' ? f.pts : f.t === 'cercle' ? [[f.cx - f.r, f.cy - f.r], [f.cx + f.r, f.cy + f.r]] : [[f.x, f.y], [f.x + f.w, f.y + f.h]];
      for (const [x, y] of pts) assert.ok(x >= -0.5 && y >= -0.5 && x <= v.w + 0.5 && y <= v.h + 0.5, v.id + ' primitive hors cadre');
    }
  }
});

test('le SVG des silhouettes est dérivé des primitives, sans transformation', () => {
  const v = vueDe(complet(), 'ext-left');
  assert.match(v.decor, /<polygon class="nx-caisse"/);
  assert.match(v.decor, /<circle class="nx-roue"/);
  assert.equal(v.decor.includes('transform='), false);
});

test('la vue de droite a ses silhouettes en miroir de celles de gauche', () => {
  const s = complet();
  const g = vueDe(s, 'ext-left').decorFormes.filter((f) => f.role === 'roue');
  const d = vueDe(s, 'ext-right').decorFormes.filter((f) => f.role === 'roue');
  assert.equal(Math.round(d[0].cx), Math.round(vueDe(s, 'ext-left').w - g[0].cx));
});

test('le cadre de chaque vue entoure tout ce qui est dessiné, et recadre le vide', () => {
  const s = complet();
  for (const v of s.externe.concat(s.interne)) {
    const c = v.cadre;
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= v.w + 0.5 && c.y + c.h <= v.h + 0.5, v.id + ' cadre hors schéma');
    const dedans = (x, y, r) => x - r >= c.x - 0.5 && x + r <= c.x + c.w + 0.5 && y - r >= c.y - 0.5 && y + r <= c.y + c.h + 0.5;
    for (const f of v.decorFormes) {
      if (f.t === 'poly' || f.t === 'trait') f.pts.forEach(([x, y]) => assert.ok(dedans(x, y, 0), v.id + ' silhouette hors cadre'));
      else if (f.t === 'cercle') assert.ok(dedans(f.cx, f.cy, f.r), v.id + ' roue hors cadre');
    }
    for (const e of v.elements) for (const p of e.points) assert.ok(dedans(p.x, p.y, v.rayon), v.id + ' point ' + p.n + ' hors cadre');
  }
  const g = vueDe(s, 'ext-left');
  assert.ok(g.cadre.h < g.h * 0.85, 'la vue latérale n\'est pas recadrée');
});

const dansPoly = (x, y, pts) => {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
};

test('chaque élément a le contour réel de son panneau, et ses points tombent dedans', () => {
  const s = complet();
  for (const v of s.externe.concat(s.interne)) {
    for (const e of v.elements) {
      assert.ok(e.contour && e.contour.length >= 4, v.id + ' ' + e.type + ' sans contour');
      for (const [x, y] of e.contour) assert.ok(x >= e.forme.x - 0.5 && x <= e.forme.x + e.forme.w + 0.5 && y >= e.forme.y - 0.5 && y <= e.forme.y + e.forme.h + 0.5, v.id + ' ' + e.type + ' contour hors de sa boîte');
      for (const p of e.points) assert.ok(dansPoly(p.x, p.y, e.contour), v.id + ' ' + e.type + ' point ' + p.n + ' hors du contour');
    }
  }
});

test('les points reprennent la disposition de NexPTG : la porte avant a 3 points sur chaque bord et un au centre', () => {
  const porte = elDe(vueDe(complet(), 'ext-left'), 'LEFT_FRONT_DOOR');
  const [p1, p2, p3, p4, p5, p6, p7] = porte.points;
  assert.ok(p1.y < p2.y && p2.y < p3.y, 'bord avant, de haut en bas');
  assert.ok(p5.y < p6.y && p6.y < p7.y, 'bord arrière, de haut en bas');
  assert.ok(p1.x < p4.x && p4.x < p5.x, 'le point 4 est au centre');
});

test('la porte arrière est derrière la porte avant, le montant suit le toit et l\'aile arrière est la plus en arrière', () => {
  const v = vueDe(complet(), 'ext-left');
  const cx = (t) => { const f = elDe(v, t).forme; return f.x + f.w / 2; };
  assert.ok(cx('LEFT_FRONT_FENDER') < cx('LEFT_FRONT_DOOR') && cx('LEFT_FRONT_DOOR') < cx('LEFT_REAR_DOOR') && cx('LEFT_REAR_DOOR') < cx('LEFT_REAR_FENDER'));
  const montant = elDe(v, 'LEFT_PILLAR').points;
  assert.ok(montant[1].y < montant[0].y && montant[2].y < montant[3].y, 'le montant monte puis redescend avec le toit');
});

test('les schémas ont des roues détaillées : pneu, jante et rayons', () => {
  const d = vueDe(complet(), 'ext-left').decorFormes;
  assert.equal(d.filter((f) => f.role === 'roue').length, 2);
  assert.equal(d.filter((f) => f.role === 'jante').length, 2);
  assert.ok(d.filter((f) => f.t === 'trait').length >= 20, 'rayons, joints de portes, poignées');
});
