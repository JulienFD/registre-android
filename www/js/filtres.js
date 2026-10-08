import { TYPES } from './constants.js';
import { $, S, esc } from './core.js';

function chip(k, v, label, on) {
  return '<button type="button" class="fchip' + (on ? ' on' : '') + '" data-act="filter" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '</button>';
}

export function activeFilters() { return (S.f.type ? 1 : 0) + (S.f.resp ? 1 : 0) + (S.f.retard ? 1 : 0) }

/* Les responsables proposés sont ceux déjà saisis sur les dossiers. */
export function renderFilters() {
  var resps = [];
  S.list.forEach(function (v) { if (v.resp && resps.indexOf(v.resp) < 0) resps.push(v.resp) });
  resps.sort();
  $('#filters').innerHTML = Object.keys(TYPES).map(function (k) { return chip('type', k, TYPES[k].l, S.f.type === k) }).join('') +
    chip('retard', '1', 'En retard', S.f.retard) +
    '<select class="fsel' + (S.f.resp ? ' on' : '') + '" data-filter="resp" aria-label="Filtrer par responsable"><option value="">Tous les responsables</option>' +
    resps.map(function (r) { return '<option' + (r === S.f.resp ? ' selected' : '') + '>' + esc(r) + '</option>' }).join('') + '</select>' +
    (activeFilters() ? '<button type="button" class="fclear" data-act="filter-reset">Effacer les filtres</button>' : '');
}
