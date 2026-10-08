import { COLS, SLOTS, TYPES } from './constants.js';
import { $, S, due, esc, fmtDT, limite, plateHtml } from './core.js';

/* ---------- tableau ---------- */
function card(v){
  var t=TYPES[v.type]||{l:'Type à préciser',c:'--ink2'};var d=due(v);
  var np=v.pe||0,lim=limite(v);
  return '<button class="card" data-act="open" data-id="'+esc(v.id)+'" style="--c:var('+t.c+')">'+
    '<div class="r1">'+plateHtml(v.plaque)+'<span class="chip" style="--c:var('+t.c+')">'+esc(t.l)+'</span></div>'+
    '<div class="mod">'+esc([v.marque,v.modele].filter(Boolean).join(' ')||'Modèle non renseigné')+(v.couleur?' · '+esc(v.couleur):'')+'</div>'+
    '<div class="ops">'+esc(v.ops||'Travaux à définir')+'</div>'+
    '<div class="r1"><span class="chip '+d.c+'">'+esc(d.t)+'</span><span class="sv">'+np+'/'+SLOTS.length+' photos</span></div>'+
    (lim?'<div class="r1"><span class="chip '+lim.c+'">'+esc(lim.t)+'</span>'+(v.engageValide?'<span class="sv">validé par '+esc(v.engageValide)+'</span>':'')+'</div>':'')+
    '<div class="meta"><span>Resp. '+esc(v.resp||'à désigner')+'</span>'+(v.entreeAt?'<span>Entrée '+esc(new Date(v.entreeAt).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}))+'</span>':'')+'</div></button>';
}
export function renderMain(){
  var m=$('#main');
  $('#nv-board').className='btn'+(S.view==='board'?' on':'');
  $('#nv-arch').className='btn'+(S.view==='arch'?' on':'');
  if(S.dberr){m.innerHTML='<div class="empty"><h2>Données illisibles</h2><p>'+esc(S.dberr)+'</p></div>';return}
  if(!S.loaded){m.innerHTML='<div class="empty"><p>Chargement des dossiers…</p></div>';return}
  var q=S.q.trim().toUpperCase().replace(/[^A-Z0-9 ]/g,'');
  var match=function(v){return !q||[v.plaque,v.marque,v.modele,v.clientNom,v.resp,v.rattache,v.recep].join(' ').toUpperCase().replace(/[^A-Z0-9 ]/g,'').indexOf(q)>-1};
  if(S.view==='arch'){
    var out=S.list.filter(function(v){return v.statut==='sorti'&&match(v)}).sort(function(a,b){return (b.sortieAt||0)-(a.sortieAt||0)});
    $('#nv-arch').textContent='Sorties ('+S.list.filter(function(v){return v.statut==='sorti'}).length+')';
    m.innerHTML=out.length?'<div class="arch">'+out.map(function(v){var t=TYPES[v.type]||{l:'',c:'--ink2'};
      return '<button class="arow" data-act="open" data-id="'+esc(v.id)+'">'+plateHtml(v.plaque)+'<span class="grow"><b>'+esc([v.marque,v.modele].filter(Boolean).join(' '))+'</b><br><span class="sv">'+esc(v.clientNom||v.rattache||'')+'</span></span><span class="chip" style="--c:var('+t.c+')">'+esc(t.l)+'</span><span class="sv">Sortie '+esc(v.sortieAt?fmtDT(v.sortieAt):'')+(v.remisA?' · récupéré par '+esc(v.remisA):'')+'</span></button>'}).join('')+'</div>'
      :'<div class="empty"><h2>Aucune sortie</h2><p>Les véhicules rendus apparaissent ici avec leur dossier complet et le PDF d’entrée et de sortie.</p></div>';
    return;
  }
  $('#nv-arch').textContent='Sorties';
  var act=S.list.filter(function(v){return v.statut!=='sorti'});
  if(!act.length&&!q){
    m.innerHTML='<div class="empty"><h2>Aucune voiture à l’atelier</h2><p>Chaque véhicule qui entre a sa fiche : état des lieux, photos prises à la tablette, ce qui doit être fait, ce qui a été dit au client, signatures. Le tableau se remplit à mesure des entrées.</p><button class="btn pri shoot" data-act="new">+ Nouvelle entrée</button></div>';
    return;
  }
  m.innerHTML='<div class="board">'+COLS.map(function(c){
    var items=act.filter(function(v){return (v.statut||'brouillon')===c[0]&&match(v)}).sort(function(a,b){return (a.sortiePrevue||'9999').localeCompare(b.sortiePrevue||'9999')});
    return '<section class="col"><h2>'+c[1]+'<b>'+items.length+'</b></h2><div class="stack">'+(items.length?items.map(card).join(''):'<div class="none">Aucun véhicule</div>')+'</div></section>';
  }).join('')+'</div>';
}

