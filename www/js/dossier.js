import { renderMain } from './board.js';
import { camClose } from './camera.js';
import { $, S, V, VV, api, esc, flush, hist, lastWho, normPlate, queues, save, setSave, snapOf, toast } from './core.js';
import { makePdf } from './pdf.js';
import { modalShow } from './pin.js';
import { refreshChrome, renderSheet } from './sheet.js';

export function openDossier(id,tab){
  var v=V(id);if(!v)return;
  S.cur=id;S.draft=null;S.unlocked=null;S.snap=null;S.cdraft=null;
  S.photos=S.pm[id]||(S.pm[id]=[]);
  S.tab=tab||(v.statut==='brouillon'?'photos':'infos');
  renderSheet();
}
export function newEntry(){
  S.cur=null;S.photos=[];S.tab='infos';S.unlocked=null;S.cdraft=null;
  S.draft={type:'',recep:lastWho(),sortiePrevue:''};
  renderSheet();
}
export function closeSheet(){
  autoCreate();flush();camClose(true);
  S.cur=null;S.draft=null;S.photos=[];S.lb=null;S.unlocked=null;S.snap=null;S.cdraft=null;
  $('#sheet').hidden=true;$('#lightbox').hidden=true;document.documentElement.style.overflow='';renderMain();
}
export function createDossier(){
  var d=S.draft;if(!d)return;
  var pl=normPlate(d.plaque);
  if(!pl){toast('Saisir la plaque d’immatriculation');return}
  if(!d.recep){toast('Indiquer qui réceptionne le véhicule');return}
  if(!d.type){toast('Choisir la nature de l’intervention');return}
  startDossier(d);
  S.tab='photos';renderSheet();
}
/* Crée le dossier « Entrée en cours » : tout ce qui est saisi ensuite s'enregistre tout seul. */
function startDossier(d){
  var pl=normPlate(d.plaque);
  var day=new Date().toLocaleDateString('sv-SE').replace(/-/g,'');
  var id=day+'-'+pl,n=1;
  while(V(id)){n++;id=day+'-'+pl+'-'+n}
  var rec=Object.assign({},d,{id:id,plaque:d.plaque.toUpperCase(),statut:'brouillon',createdAt:Date.now(),pe:0,hist:[{ts:Date.now(),by:d.recep,a:'Dossier créé'}]});
  try{localStorage.setItem('rv-recep',d.recep)}catch(e){}
  S.list.push(rec);S.cur=id;S.draft=null;S.photos=S.pm[id]=[];
  setSave('saving');
  queues[id]=api.write('vehicules/'+id,snapOf(rec)).then(function(){setSave('ok')},function(e){setSave('err',e);toast('Création impossible : '+(e&&e.message||'erreur'))});
  return id;
}
/* Enregistre le brouillon dès que la plaque et le réceptionnaire sont connus, sans toucher à l'écran. */
export function autoCreate(){
  var d=S.draft;if(!d||S.cur||!normPlate(d.plaque)||!d.recep)return;
  startDossier(d);
  if(!$('#sheet').hidden)refreshChrome();
}

/* ---------- verrouillage de l'entrée ---------- */
var SIGLAB={sigRecep:'du réceptionnaire',sigClient:'du client'};
export function validateEntry(){
  var v3=VV();if(!v3||v3.statut!=='brouillon')return;
  S.unlocked=null;S.snap=null;
  save({statut:'atelier',entreeAt:Date.now(),hist:hist(v3,'Entrée validée : le dossier est verrouillé')}).then(function(){toast('Entrée validée, dossier en atelier');return makePdf('entree',true)});
  renderSheet();
}
/* f = signature qui vient d'être posée : si le verrouillage est refusé, elle est retirée. */
export function lockConfirm(f){
  var undo=f?'<p class="hint"><b>Si vous annulez, la signature '+esc(SIGLAB[f]||'')+' que vous venez de poser sera retirée</b> et devra être refaite avant de pouvoir verrouiller.</p>':'';
  modalShow('<h2>Verrouiller la fiche ?</h2>'+
    '<p>Les informations, les photos, le contrôle et les signatures sont complets. En validant, l’entrée est <b>verrouillée</b> : toute correction demandera le code PIN propriétaire et sera inscrite dans l’historique. Le PDF d’entrée est ensuite créé.</p>'+undo+
    '<div class="mrow2"><button class="btn" data-act="lockcancel"'+(f?' data-f="'+esc(f)+'"':'')+'>'+(f?'Annuler et retirer la signature':'Annuler')+'</button><button class="btn pri" data-act="lockok">Verrouiller la fiche</button></div>');
}
export function undoSig(f){
  var v=VV();if(!v||!v[f])return;
  var o={};o[f]=null;o.hist=hist(v,'Signature '+(SIGLAB[f]||'')+' retirée : verrouillage de la fiche non confirmé');
  save(o);renderSheet(true);toast('Signature retirée');
}

