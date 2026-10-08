import { $, S, esc, toast } from './core.js';
import { doImport } from './photos.js';
import { renderSheet } from './sheet.js';

var CM=null;
export function camOpen(o){
  camClose(true);
  CM={o:o,idx:0,busy:false,devs:[],di:-1,stream:null};
  var el=$('#camera');el.hidden=false;document.documentElement.style.overflow='hidden';
  el.innerHTML='<div class="camtop"><div class="lab" id="camlab"></div><button class="btn" id="camsw" data-act="camswitch" hidden>Autre caméra</button><button class="btn" data-act="camimport">Importer</button><button class="btn pri" data-act="camclose">Terminer</button></div>'+
    '<video id="camvid" autoplay playsinline muted></video><div class="flash" id="camflash"></div>'+
    '<div class="cambot">'+(o.free?'<label class="fld" style="min-width:240px;flex:1;color:#fff"><input id="camcap" type="text" placeholder="Légende (ex. impact porte arrière gauche)" value="'+esc(o.caption||'')+'" autocomplete="off"></label>':'<button class="btn" data-act="camskip">Passer cette vue</button>')+
    '<button class="shutter" data-act="camshot" aria-label="Prendre la photo"></button><div class="strip" id="camstrip"></div></div>';
  camLabel();camStart();
}
function camLabel(){
  var l=$('#camlab');if(!l||!CM)return;var o=CM.o;
  if(o.free){l.innerHTML=esc(o.title||'Photos')+'<span class="sub">Chaque photo est enregistrée aussitôt, datée et signée.</span>';return}
  var it=o.queue[CM.idx];
  l.innerHTML=esc(it.label)+'<span class="sub">Vue '+(CM.idx+1)+' sur '+o.queue.length+' · '+(o.phase==='sortie'?'sortie':'entrée')+'</span>';
}
async function camStart(){
  if(!CM)return;var vid=$('#camvid');
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('API caméra absente');
    if(CM.stream)CM.stream.getTracks().forEach(function(t){t.stop()});
    var c={video:{width:{ideal:1920},height:{ideal:1080}},audio:false};
    if(CM.di>=0&&CM.devs[CM.di])c.video.deviceId={exact:CM.devs[CM.di].deviceId};else c.video.facingMode={ideal:'environment'};
    CM.stream=await navigator.mediaDevices.getUserMedia(c);
    if(!CM)return;
    vid.srcObject=CM.stream;
    var all=await navigator.mediaDevices.enumerateDevices();
    CM.devs=all.filter(function(d){return d.kind==='videoinput'});
    var sw=$('#camsw');if(sw&&CM.devs.length>1)sw.hidden=false;
  }catch(e){
    if(!CM)return;
    var v2=$('#camvid');if(v2)v2.outerHTML='<div class="camfail"><h2>Caméra inaccessible</h2><p>Sous Windows : Paramètres, Confidentialité et sécurité, Caméra, puis autoriser l’accès à la caméra et aux applications de bureau. Vérifier aussi qu’aucune autre application n’utilise la caméra.</p><p class="sv" style="color:#ccc">'+esc(e&&e.message||'')+'</p><p>En attendant, « Importer » permet d’ajouter des images déjà prises.</p></div>';
  }
}
export function camSwitch(){if(!CM||CM.devs.length<2)return;CM.di=CM.di<0?1:(CM.di+1)%CM.devs.length;camStart()}
export async function camShot(){
  if(!CM||CM.busy)return;
  var vid=$('#camvid');if(!vid||!vid.videoWidth){toast('La caméra n’est pas prête');return}
  var o=CM.o,item;
  if(o.free){var cap=$('#camcap'),lab=(cap&&cap.value.trim())||o.defLabel||'Détail';item={phase:o.phase,slot:'x'+Date.now(),label:lab}}
  else item=o.queue[CM.idx];
  CM.busy=true;
  var f=$('#camflash');if(f){f.classList.remove('on');void f.offsetWidth;f.classList.add('on')}
  var c=document.createElement('canvas');c.width=vid.videoWidth;c.height=vid.videoHeight;c.getContext('2d').drawImage(vid,0,0);
  var r=await o.sink(c,item,{});
  if(!CM)return;
  CM.busy=false;
  if(r){
    var st=$('#camstrip');if(st&&r.thumb)st.insertAdjacentHTML('beforeend','<img alt="" src="'+esc(r.thumb)+'">');
    if(o.free){var cp=$('#camcap');if(cp)cp.value=''}
    else{CM.idx++;if(CM.idx>=o.queue.length){camClose();toast('Toutes les vues demandées sont prises');return}camLabel()}
  }
}
export function camSkip(){if(!CM||CM.o.free)return;CM.idx++;if(CM.idx>=CM.o.queue.length){camClose();return}camLabel()}
export async function camImport(){
  if(!CM)return;var o=CM.o;
  var n=await doImport(function(f,i){
    if(o.free){var cap=$('#camcap');return {phase:o.phase,slot:'x'+Date.now()+'_'+i,label:(cap&&cap.value.trim())||f.name.replace(/\.[^.]+$/,'')||o.defLabel||'Détail'}}
    var it=o.queue[CM.idx];if(!it)return null;CM.idx++;return it;
  },o.sink);
  if(!CM)return;
  if(n){if(!o.free&&CM.idx>=o.queue.length){camClose();toast('Images importées');return}camLabel();toast(n+' image(s) importée(s)')}
}
export function camClose(silent){
  if(CM&&CM.stream)CM.stream.getTracks().forEach(function(t){t.stop()});
  CM=null;var el=$('#camera');el.hidden=true;el.innerHTML='';
  if(!silent){if(S.cur||S.draft){if(!$('#sheet').hidden)document.documentElement.style.overflow='hidden';renderSheet(true)}else document.documentElement.style.overflow=''}
}

