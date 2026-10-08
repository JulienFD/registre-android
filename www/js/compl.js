import { CAM, CK, ckLabel } from './constants.js';
import { S, V, api, esc, fmtDT, hist, lastWho, save, srcOf, toast } from './core.js';
import { renderSheet } from './sheet.js';

export function getCd() { return S.cdraft || (S.cdraft = { by: lastWho(), kind: 'lavage', text: '', pics: [] }) }
export function tabCompl() {
  var d = getCd(), list = (S.cm[S.cur] || []).slice().sort(function (a, b) { return b.ts - a.ts });
  return '<div class="sec"><h3>Ajouter un complément</h3><p class="hint">Pour tout ce qui est découvert après l’entrée (après le lavage, en cours de travaux) : texte et photos s’ajoutent à la suite, datés et signés. Rien de ce qui a été enregistré avant n’est modifié ni effacé.</p>' +
    '<div class="grid2"><label class="fld"><span>Qui ajoute <em>*</em></span><input id="cd-by" type="text" list="people" value="' + esc(d.by) + '" autocomplete="off"></label>' +
    '<label class="fld"><span>Nature</span><select id="cd-kind">' + CK.map(function (c) { return '<option value="' + c[0] + '"' + (d.kind === c[0] ? ' selected' : '') + '>' + c[1] + '</option>' }).join('') + '</select></label></div>' +
    '<label class="fld"><span>Ce qui est constaté <em>*</em></span><textarea id="cd-text" rows="3" placeholder="Ex. rayure sur l’aile arrière droite visible après lavage">' + esc(d.text) + '</textarea></label>' +
    '<div class="pickrow"><button class="btn" data-act="cdshoot">' + CAM + 'Prendre des photos</button><button class="btn" data-act="cdimport">Importer des images</button></div>' +
    (d.pics.length ? '<div class="tiles">' + d.pics.map(function (p) { return '<div class="tile has"><img class="ph" alt="" src="' + esc(p.url) + '"><span class="lb">' + esc(p.label) + '</span></div>' }).join('') + '</div>' : '') +
    '<div class="seg"><button class="btn pri" data-act="cdsave">Enregistrer le complément</button>' + (d.pics.length ? '<button class="btn" data-act="cdclear">Retirer ces photos</button>' : '') + '</div></div>' +
    '<div class="sec"><h3>Compléments enregistrés (' + list.length + ')</h3>' + (list.length ? '<div class="tl">' + list.map(function (c) {
      var pics = S.photos.filter(function (p) { return p.phase === 'compl' && p.cid === c.id }).sort(function (a, b) { return a.ts - b.ts });
      return '<div class="tli"><div class="hd"><span class="chip">' + esc(ckLabel(c.kind)) + '</span><b>' + esc(fmtDT(c.ts)) + '</b><span class="sv">par ' + esc(c.by) + '</span></div>' + (c.text ? '<p>' + esc(c.text) + '</p>' : '') +
        (pics.length ? '<div class="tiles">' + pics.map(function (p) { return '<button class="tile has" data-act="view" data-pid="' + esc(p.id) + '"><img class="ph" loading="lazy" alt="" src="' + esc(srcOf(p)) + '"><span class="lb">' + esc(p.label || '') + '</span></button>' }).join('') + '</div>' : '') + '</div>'
    }).join('') + '</div>' : '<p class="sv">Aucun complément pour ce véhicule.</p>') + '</div>';
}

export async function cdSave() {
  var v = V(S.cur), d = S.cdraft; if (!v || !d) return;
  if (!d.by.trim()) { toast('Indiquer qui ajoute le complément'); return }
  if (!d.text.trim() && !d.pics.length) { toast('Décrire ce qui est constaté ou ajouter une photo'); return }
  var cid = 'c' + Date.now(), id = S.cur, ids = [];
  try {
    for (var i = 0; i < d.pics.length; i++) {
      var p = d.pics[i], slot = cid + '_' + (i + 1), pid = 'compl_' + slot;
      await api.savePhoto(id, pid, p.bytes);
      var rec = { phase: 'compl', slot: slot, cid: cid, label: p.label, ts: p.ts, by: d.by.trim(), file: pid, rev: 1 };
      if (p.imported) { rec.imported = true; rec.origName = p.origName }
      await api.write('vehicules/' + id + '/photos/' + pid, rec);
      rec.id = pid; rec.vid = id; S.photos.push(rec); ids.push(pid);
    }
    var c = { id: cid, ts: Date.now(), by: d.by.trim(), kind: d.kind, text: d.text.trim(), n: ids.length };
    await api.write('vehicules/' + id + '/compl/' + cid, c);
    (S.cm[id] = S.cm[id] || []).push(c);
    try { localStorage.setItem('rv-recep', d.by.trim()) } catch (e) { }
    save({ hist: hist(v, 'Complément ajouté : ' + ckLabel(d.kind) + ' (' + ids.length + ' photo' + (ids.length > 1 ? 's' : '') + ')', d.by.trim()) });
    S.cdraft = null; renderSheet(true); toast('Complément enregistré');
  } catch (e) { toast('Complément non enregistré : ' + (e && e.message || 'erreur')) }
}

