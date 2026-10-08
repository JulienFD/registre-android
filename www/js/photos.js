import { camOpen } from './camera.js';
import { getCd } from './compl.js';
import { SLOTS } from './constants.js';
import { $, S, V, VV, api, fmtDT, fmtPlate, hist, isLocked, save, srcOf, toast } from './core.js';
import { askPin } from './pin.js';
import { refreshPhotos } from './sheet.js';

export function entrySet(){var s={};S.photos.forEach(function(p){if(p.phase==='entree'&&p.slot)s[p.slot]=1});return s}
export function exitSet(){var s={};S.photos.forEach(function(p){if(p.phase==='sortie'&&p.slot)s[p.slot]=1});return s}
function loadBitmap(file){
  if(window.createImageBitmap){return createImageBitmap(file,{imageOrientation:'from-image'}).catch(function(){return viaImg(file)})}
  return viaImg(file);
}
function viaImg(file){return new Promise(function(res,rej){var u=URL.createObjectURL(file),i=new Image();i.onload=function(){res(i)};i.onerror=rej;i.src=u})}
function stamped(src,max,stamp){
  var sw=src.videoWidth||src.naturalWidth||src.width,sh=src.videoHeight||src.naturalHeight||src.height;
  var k=Math.min(1,max/Math.max(sw,sh)),w=Math.round(sw*k),h=Math.round(sh*k);
  var c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.drawImage(src,0,0,w,h);
  var fs=Math.max(14,Math.round(w/58));x.font='600 '+fs+'px sans-serif';
  x.fillStyle='rgba(0,0,0,.6)';x.fillRect(0,h-fs*1.9,w,fs*1.9);x.fillStyle='#fff';x.textBaseline='middle';x.fillText(stamp,fs*.6,h-fs*.95);
  return c;
}
function toBlob(c,q){return new Promise(function(res){c.toBlob(function(b){res(b)},'image/jpeg',q)})}
function whoFor(v,phase){return phase==='sortie'?(v.remisPar||v.recep||''):(v.recep||'')}
function phaseTag(ph){return ph==='sortie'?'SORTIE':ph==='mesures'?'MESURES':ph==='compl'?'COMPLÉMENT':'ENTRÉE'}
async function makeJpeg(src,v,phase,who,opt){
  var stamp=fmtPlate(v.plaque)+'  ·  '+fmtDT(Date.now())+'  ·  '+who+'  ·  '+phaseTag(phase)+(opt&&opt.imported?'  ·  IMPORTÉE':'');
  var blob=await toBlob(stamped(src,1600,stamp),.78);
  return {blob:blob,bytes:new Uint8Array(await blob.arrayBuffer())};
}
export async function commitPhoto(src,item,opt){
  opt=opt||{};
  var id=S.cur,v=V(id);if(!v)return null;
  var pid=item.phase+'_'+item.slot;S.busy[pid]=1;refreshPhotos();
  try{
    var who=whoFor(v,item.phase);
    var jp=await makeJpeg(src,v,item.phase,who,opt);
    var old=S.photos.filter(function(x){return x.id===pid})[0];
    var rev=old?(old.rev||1)+1:1,file=rev>1?pid+'_r'+rev:pid;
    await api.savePhoto(id,file,jp.bytes);
    var rec={phase:item.phase,slot:item.slot,label:item.label,ts:Date.now(),by:who,file:file,rev:rev};
    if(old)rec.prev=(old.prev||[]).concat([{file:old.file||old.id,ts:old.ts,by:old.by}]);
    if(opt.imported){rec.imported=true;rec.origName=opt.name||''}
    await api.write('vehicules/'+id+'/photos/'+pid,rec);
    rec.id=pid;rec.vid=id;
    if(old)S.photos.splice(S.photos.indexOf(old),1);
    S.photos.push(rec);
    var upd={};
    if(item.phase==='entree'||item.phase==='sortie'){
      var set=item.phase==='entree'?entrySet():exitSet(),cnt=SLOTS.filter(function(s){return set[s.k]}).length;
      if(item.phase==='entree')upd.pe=cnt;else upd.ps=cnt;
    }
    if(old)upd.hist=hist(v,'Photo reprise : '+item.label+' (version '+rev+', la précédente est conservée)',S.unlocked===id?'Propriétaire (code PIN)':undefined);
    if(Object.keys(upd).length)save(upd);
    delete S.busy[pid];refreshPhotos();
    return {thumb:srcOf(rec)};
  }catch(e){delete S.busy[pid];refreshPhotos();toast('Photo non enregistrée : '+(e&&e.message||'erreur'));return null}
}
export async function complSink(src,item,opt){
  var v=VV(),d=getCd();if(!v)return null;
  try{
    var jp=await makeJpeg(src,v,'compl',d.by||'',opt);
    var url=URL.createObjectURL(jp.blob);
    d.pics.push({bytes:jp.bytes,url:url,label:item.label||'Complément',ts:Date.now(),imported:!!(opt&&opt.imported),origName:opt&&opt.name||''});
    return {thumb:url};
  }catch(e){toast('Photo non prise en compte');return null}
}
export function canShoot(phase){
  var v=VV();if(!v)return false;
  if((phase==='entree'&&isLocked(v,'entry'))||((phase==='sortie'||phase==='mesures')&&isLocked(v,'exit'))){toast('Dossier verrouillé : utiliser Compléments, ou le code PIN pour corriger');return false}
  return true;
}
function missing(phase){var set=phase==='entree'?entrySet():exitSet();return SLOTS.filter(function(s){return !set[s.k]}).map(function(s){return {phase:phase,slot:s.k,label:s.l}})}
export function startQueue(phase,first){
  if(!canShoot(phase))return;
  var q=missing(phase);
  if(first){
    var it=SLOTS.filter(function(s){return s.k===first})[0];if(!it)return;
    var cur=q.filter(function(x){return x.slot===first})[0];
    q=cur?[cur].concat(q.filter(function(x){return x.slot!==first})):[{phase:phase,slot:first,label:it.l}];
  }
  if(!q.length){toast('Toutes les vues sont prises');return}
  camOpen({queue:q,sink:commitPhoto,phase:phase});
}
export async function doImport(next,sink){
  var files=await api.importImages();if(!files||!files.length)return 0;
  var n=0;
  for(var i=0;i<files.length;i++){
    var it=next(files[i],i);if(!it)break;
    try{var bmp=await loadBitmap(new Blob([files[i].bytes]));var r=await sink(bmp,it,{imported:true,name:files[i].name});if(r)n++}
    catch(e){toast('Image illisible : '+files[i].name)}
  }
  return n;
}
export async function handlePdf(){
  var id=S.cur,v=V(id);if(!v||!canShoot('mesures'))return;
  var slot='x'+Date.now(),pid='mesures_'+slot;
  try{
    var name=await api.addPdf(id,pid);if(!name)return;
    var rec={phase:'mesures',kind:'pdf',slot:slot,label:name,ts:Date.now(),by:v.recep||'',file:pid};
    await api.write('vehicules/'+id+'/photos/'+pid,rec);
    rec.id=pid;rec.vid=id;S.photos.push(rec);
    save({hist:hist(v,'PDF NexDiag ajouté : '+name)});refreshPhotos();toast('PDF ajouté au dossier');
  }catch(e){toast('PDF non ajouté : '+(e&&e.message||'erreur'))}
}
export async function delPhoto(pid){
  var v=VV(),p=S.photos.filter(function(x){return x.id===pid})[0];
  if(!v||!p||p.phase==='compl')return;
  var post=!!v.statut&&v.statut!=='brouillon';
  if(post){var pin=await askPin('Code PIN propriétaire','Retirer « '+(p.label||'photo')+' » du dossier');if(!pin)return}
  try{
    await api.del('vehicules/'+S.cur+'/photos/'+pid);
    S.photos.splice(S.photos.indexOf(p),1);S.lb=null;$('#lightbox').hidden=true;
    save({hist:hist(v,'Élément retiré : '+(p.label||pid),post?'Propriétaire (code PIN)':undefined)});
    refreshPhotos();toast('Retiré du dossier');
  }catch(e){toast('Suppression impossible')}
}

