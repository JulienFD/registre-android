
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};

/* ---------- données de référence ---------- */
var TYPES={formation:{l:'Formation',c:'--t-form'},parcours:{l:'Parcours long',c:'--t-parc'},formateur:{l:'Presta formateur',c:'--t-pf'},stagiaire:{l:'Presta stagiaire',c:'--t-ps'}};
var COLS=[['brouillon','Entrée en cours'],['atelier','En atelier'],['controle','Contrôle qualité'],['pret','Prête à sortir']];
var SLOTS=[
 ['avg','Avant gauche (3/4)'],['av','Face avant'],['avd','Avant droit (3/4)'],['d','Côté droit'],
 ['ard','Arrière droit (3/4)'],['ar','Face arrière'],['arg','Arrière gauche (3/4)'],['g','Côté gauche'],
 ['toit','Toit et capot'],['cpt','Compteur : km et voyants'],['ia','Intérieur avant'],['ir','Intérieur arrière et coffre']
].map(function(a){return {k:a[0],l:a[1]}});
var SORTIE_REQ=8;
var CHECK=[
 ['avant','Avant : pare-chocs, calandre, optiques'],['capot','Capot et ailes avant'],
 ['gauche','Côté gauche : portières, bas de caisse'],['droit','Côté droit : portières, bas de caisse'],
 ['arriere','Arrière : pare-chocs, hayon ou coffre, feux'],['toit','Toit'],
 ['vitres','Pare-brise, vitres, rétroviseurs'],['jantes','Jantes, enjoliveurs et pneus'],
 ['peinture','Peinture et vernis : état général'],['sieges','Sièges et garnitures'],
 ['tableau','Tableau de bord, console, ciel de toit'],['tapis','Tapis et moquettes'],
 ['voyants','Voyants allumés au tableau de bord'],['papiers','Papiers et accessoires à bord']
].map(function(a){return {k:a[0],l:a[1]}});
var PANELS=[['capot','Capot'],['toit','Toit'],['avg','Aile avant gauche'],['avd','Aile avant droite'],['pavg','Porte avant gauche'],['pavd','Porte avant droite'],['parg','Porte arrière gauche'],['pard','Porte arrière droite'],['arg','Aile arrière gauche'],['ard','Aile arrière droite'],['coffre','Coffre ou hayon'],['pcav','Pare-chocs avant'],['pcar','Pare-chocs arrière']];
var WORKER='vendor/pdf.worker.min.js';
var DMG=[['rayure','Rayure','#d9480f'],['impact','Impact / bosse','#b3261e'],['eclat','Éclat','#7048e8'],['rouille','Rouille / corrosion','#8d5524'],['usure','Usure / salissure','#495057'],['autre','Autre','#0b7285']];
var VIEWS={
 top:{w:200,h:400,lab:'Dessus',sh:[['b','r',30,10,140,380,56],['g','r',48,105,104,52,12],['g','r',54,282,92,44,10],['g','r',52,160,96,120,14],['w','r',12,66,22,52,7],['w','r',166,66,22,52,7],['w','r',12,286,22,52,7],['w','r',166,286,22,52,7],['w','r',6,128,24,14,5],['w','r',170,128,24,14,5]]},
 left:{w:400,h:170,lab:'Côté gauche',sh:[['b','r',12,66,376,66,26],['b','r',96,22,190,52,22],['g','r',112,32,70,34,10],['g','r',196,32,76,34,10],['w','c',100,134,28],['w','c',300,134,28]]}
};
VIEWS.right={w:400,h:170,lab:'Côté droit',sh:VIEWS.left.sh.map(function(s){return s[1]==='r'?[s[0],'r',400-s[2]-s[4],s[3],s[4],s[5],s[6]]:[s[0],'c',400-s[2],s[3],s[4]]})};

/* ---------- état ---------- */
var api=window.api;
var S={list:[],view:'board',q:'',cur:null,draft:null,tab:'infos',photos:[],pm:{},cm:{},busy:{},dmg:'rayure',lb:null,loaded:false,dberr:'',unlocked:null,snap:null,unlockTs:0,cdraft:null};
var queues={},pend={},tmr=null;

/* ---------- utilitaires ---------- */
var U=window.Utils,normPlate=U.normPlate,fmtPlate=U.fmtPlate,fmtD=U.fmtD,due=U.due,limite=U.limite,TAMPON=U.TAMPON;
function V(id){for(var i=0;i<S.list.length;i++)if(S.list[i].id===id)return S.list[i];return null}
function VV(){return S.cur?V(S.cur):S.draft}
function plateHtml(p,lg){return '<span class="plate'+(lg?' lg':'')+'"><i>F</i><b>'+esc(fmtPlate(p))+'</b></span>'}
function fmtDT(ts){return new Date(ts).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function todayISO(){return new Date().toLocaleDateString('sv-SE')}
function limTxt(v){return v.dateLimite===TAMPON?'voiture tampon, aucune date promise':new Date(v.dateLimite+'T12:00').toLocaleDateString('fr-FR')}
function srcOf(p){if(p.url)return p.url;if(window.api&&window.api.photoUrl)return window.api.photoUrl(p);return '/data/vehicules/'+encodeURIComponent(p.vid)+'/photos/'+encodeURIComponent(p.file||p.id)+(p.kind==='pdf'?'.pdf':'.jpg')}
var toastT=null;
function toast(m){var t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){t.hidden=true},3600)}
var CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';

/* ---------- écriture ---------- */
function setSave(s){var el=$('#sv');if(!el)return;
  if(s==='saving'){el.textContent='Enregistrement…';el.className='sv'}
  else if(s==='ok'){el.textContent='Enregistré '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});el.className='sv'}
  else{el.textContent='Échec de l’enregistrement, vérifier la connexion';el.className='sv err'}}
function snapOf(v){return JSON.parse(JSON.stringify(v))}
var FL={plaque:'Plaque',marque:'Marque',modele:'Modèle',couleur:'Couleur',km:'Kilométrage',fuel:'Carburant',cles:'Clés',objets:'Objets à bord',type:'Nature',rattache:'Rattaché à',resp:'Responsable',ops:'À faire',dit:'Dit au client',dateLimite:'Date limite',engageValide:'Engagement validé par',exclu:'À ne pas faire',sortiePrevue:'Sortie prévue',recep:'Réceptionné par',clientNom:'Client',clientTel:'Tél. client',clientMail:'Mail client',copie:'Copie client',clientAbsent:'Client absent',mesNotes:'Notes mesures',remisPar:'Rendu par',remisA:'Récupéré par',notesSortie:'Notes de sortie',opsFaites:'Travaux confirmés'};
function shorten(x){x=x==null?'':String(x);return x.length>40?x.slice(0,40)+'…':x}
function diffText(a,b){
  var out=[];
  Object.keys(FL).forEach(function(k){var x=a[k]==null?'':a[k],y=b[k]==null?'':b[k];if(String(x)!==String(y))out.push(FL[k]+' : « '+shorten(x)+' » → « '+shorten(y)+' »')});
  var ca=a.chk||{},cb=b.chk||{};
  CHECK.forEach(function(c){var x=ca[c.k]||{},y=cb[c.k]||{};if((x.s||'')!==(y.s||'')||(x.n||'')!==(y.n||''))out.push('Contrôle « '+c.l.split(':')[0]+' » : '+(x.s||'vide')+' → '+(y.s||'vide')+(y.n?' ('+shorten(y.n)+')':''))});
  if(JSON.stringify(a.marks||[])!==JSON.stringify(b.marks||[]))out.push('Schéma des dommages modifié ('+(a.marks||[]).length+' → '+(b.marks||[]).length+' marques)');
  ['sigRecep','sigClient','sigSortie'].forEach(function(k){if(JSON.stringify(a[k]||null)!==JSON.stringify(b[k]||null))out.push('Signature modifiée ('+k+')')});
  if(JSON.stringify(a.mes||{})!==JSON.stringify(b.mes||{}))out.push('Épaisseurs modifiées');
  return out.join(' ; ');
}
function save(local,wire){
  var id=S.cur;if(!id)return Promise.resolve();
  var v=V(id);if(!v)return Promise.resolve();
  Object.assign(v,local||{});
  var w=wire||local;if(!w||!Object.keys(w).length)return Promise.resolve();
  if(S.unlocked===id&&S.snap){
    var d=diffText(S.snap,v),h=(v.hist||[]).filter(function(x){return x.corr!==S.unlockTs});
    if(d)h.push({ts:Date.now(),by:'Propriétaire (code PIN)',a:'Corrections : '+d,corr:S.unlockTs});
    v.hist=h;
  }
  setSave('saving');
  queues[id]=(queues[id]||Promise.resolve()).then(function(){return api.write('vehicules/'+id,snapOf(V(id)))}).then(function(){setSave('ok')},function(e){setSave('err',e)});
  return queues[id];
}
function flush(){clearTimeout(tmr);var p=pend;pend={};if(Object.keys(p).length)return save({},p);return Promise.resolve()}
function hist(v,a,by){return (v.hist||[]).concat([{ts:Date.now(),by:by||v.recep||'',a:a}])}

/* ---------- verrouillage ---------- */
function isLocked(v,area){
  if(!S.cur||!v||S.unlocked===v.id)return false;
  if(area==='entry')return !!v.statut&&v.statut!=='brouillon';
  if(area==='exit')return v.statut==='sorti';
  return false;
}
function lockWrap(html,area){return '<fieldset class="lockfs"'+(isLocked(VV(),area)?' disabled':'')+'>'+html+'</fieldset>'}
function lockBar(v){
  if(!S.cur||S.tab==='compl')return '';
  var area=(S.tab==='sortie'||S.tab==='mes')?'exit':'entry';
  if(S.unlocked===v.id)return '<div class="lockbar unlockbar"><span class="grow"><b>Mode correction ouvert.</b> Chaque modification est inscrite dans l’historique du dossier, signée « Propriétaire ». Terminer les corrections quand c’est fait.</span><button class="btn pri" data-act="relock">Terminer les corrections</button></div>';
  if(!isLocked(v,area))return '';
  return '<div class="lockbar"><span class="grow"><b>Dossier verrouillé</b> depuis '+(area==='entry'?'la validation de l’entrée':'la sortie')+'. Pour ajouter une découverte (par exemple après le lavage), utiliser Compléments : rien n’est écrasé. Pour corriger une erreur, le code PIN propriétaire est demandé.</span><button class="btn pri" data-act="tab" data-v="compl">Ajouter un complément</button><button class="btn" data-act="unlock">Corriger (code PIN)</button></div>';
}
function tabInfos(v){return lockWrap(tabInfos0(v),'entry')}
function tabDom(v){return lockWrap(tabDom0(v),'entry')}
function tabSign(v){return lockWrap(tabSign0(v),'entry')}

/* ---------- compléments ---------- */
var CK=[['lavage','Découvert après lavage'],['info','Information ou correction'],['photo','Photos complémentaires'],['client','Remarque du client'],['autre','Autre']];
function ckLabel(k){return (CK.filter(function(c){return c[0]===k})[0]||[0,'Complément'])[1]}
function lastWho(){var l='';try{l=localStorage.getItem('rv-recep')||''}catch(e){}return l}
function getCd(){return S.cdraft||(S.cdraft={by:lastWho(),kind:'lavage',text:'',pics:[]})}
function tabCompl(){
  var d=getCd(),list=(S.cm[S.cur]||[]).slice().sort(function(a,b){return b.ts-a.ts});
  return '<div class="sec"><h3>Ajouter un complément</h3><p class="hint">Pour tout ce qui est découvert après l’entrée (après le lavage, en cours de travaux) : texte et photos s’ajoutent à la suite, datés et signés. Rien de ce qui a été enregistré avant n’est modifié ni effacé.</p>'+
    '<div class="grid2"><label class="fld"><span>Qui ajoute <em>*</em></span><input id="cd-by" type="text" list="people" value="'+esc(d.by)+'" autocomplete="off"></label>'+
    '<label class="fld"><span>Nature</span><select id="cd-kind">'+CK.map(function(c){return '<option value="'+c[0]+'"'+(d.kind===c[0]?' selected':'')+'>'+c[1]+'</option>'}).join('')+'</select></label></div>'+
    '<label class="fld"><span>Ce qui est constaté <em>*</em></span><textarea id="cd-text" rows="3" placeholder="Ex. rayure sur l’aile arrière droite visible après lavage">'+esc(d.text)+'</textarea></label>'+
    '<div class="pickrow"><button class="btn" data-act="cdshoot">'+CAM+'Prendre des photos</button><button class="btn" data-act="cdimport">Importer des images</button></div>'+
    (d.pics.length?'<div class="tiles">'+d.pics.map(function(p){return '<div class="tile has"><img class="ph" alt="" src="'+esc(p.url)+'"><span class="lb">'+esc(p.label)+'</span></div>'}).join('')+'</div>':'')+
    '<div class="seg"><button class="btn pri" data-act="cdsave">Enregistrer le complément</button>'+(d.pics.length?'<button class="btn" data-act="cdclear">Retirer ces photos</button>':'')+'</div></div>'+
    '<div class="sec"><h3>Compléments enregistrés ('+list.length+')</h3>'+(list.length?'<div class="tl">'+list.map(function(c){
      var pics=S.photos.filter(function(p){return p.phase==='compl'&&p.cid===c.id}).sort(function(a,b){return a.ts-b.ts});
      return '<div class="tli"><div class="hd"><span class="chip">'+esc(ckLabel(c.kind))+'</span><b>'+esc(fmtDT(c.ts))+'</b><span class="sv">par '+esc(c.by)+'</span></div>'+(c.text?'<p>'+esc(c.text)+'</p>':'')+
        (pics.length?'<div class="tiles">'+pics.map(function(p){return '<button class="tile has" data-act="view" data-pid="'+esc(p.id)+'"><img class="ph" loading="lazy" alt="" src="'+esc(srcOf(p))+'"><span class="lb">'+esc(p.label||'')+'</span></button>'}).join('')+'</div>':'')+'</div>'}).join('')+'</div>':'<p class="sv">Aucun complément pour ce véhicule.</p>')+'</div>';
}

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
function renderMain(){
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

/* ---------- fiche ---------- */
function entrySet(){var s={};S.photos.forEach(function(p){if(p.phase==='entree'&&p.slot)s[p.slot]=1});return s}
function exitSet(){var s={};S.photos.forEach(function(p){if(p.phase==='sortie'&&p.slot)s[p.slot]=1});return s}
function readiness(v){
  var es=entrySet(),np=SLOTS.filter(function(s){return es[s.k]}).length;
  var nc=CHECK.filter(function(c){return v.chk&&v.chk[c.k]&&v.chk[c.k].s}).length;
  return [
    {t:'Informations',ok:!!(v.plaque&&v.recep&&v.type&&v.ops&&v.sortiePrevue&&v.resp&&v.dateLimite&&v.engageValide),tab:'infos'},
    {t:'Photos '+np+'/'+SLOTS.length,ok:np===SLOTS.length,tab:'photos'},
    {t:'Contrôle '+nc+'/'+CHECK.length,ok:nc===CHECK.length,tab:'dom'},
    {t:'Signatures',ok:!!v.sigRecep&&(!!v.sigClient||!!v.clientAbsent),tab:'sign'}
  ];
}
function fld(f,label,o){o=o||{};var v=VV()||{};
  return '<label class="fld"><span>'+label+(o.req?' <em>*</em>':'')+'</span><input id="f-'+f+'" data-f="'+f+'" type="'+(o.type||'text')+'" value="'+esc(v[f]==null?'':v[f])+'" placeholder="'+esc(o.ph||'')+'"'+(o.list?' list="'+o.list+'"':'')+(o.min?' min="'+o.min+'"':'')+(o.type==='number'?' inputmode="numeric"':'')+' autocomplete="off"></label>'}
function area(f,label,o){o=o||{};var v=VV()||{};
  return '<label class="fld"><span>'+label+(o.req?' <em>*</em>':'')+'</span><textarea id="f-'+f+'" data-f="'+f+'" rows="'+(o.rows||4)+'" placeholder="'+esc(o.ph||'')+'">'+esc(v[f]||'')+'</textarea></label>'}

function tabInfos0(v){
  var fuel=['','Réserve','1/4','1/2','3/4','Plein'];
  return '<div class="sec"><h3>Véhicule</h3><div class="grid2">'+
    fld('plaque','Plaque d’immatriculation',{req:1,ph:'AB-123-CD'})+fld('marque','Marque',{ph:'Porsche'})+fld('modele','Modèle',{ph:'911 Carrera'})+fld('couleur','Couleur',{ph:'Gris'})+
    fld('km','Kilométrage',{type:'number',ph:'45200'})+
    '<label class="fld"><span>Niveau de carburant</span><select id="f-fuel" data-f="fuel">'+fuel.map(function(o){return '<option value="'+esc(o)+'"'+((v.fuel||'')===o?' selected':'')+'>'+(o||'Non relevé')+'</option>'}).join('')+'</select></label>'+
    fld('cles','Clés remises (nombre)',{type:'number',ph:'2'})+'</div>'+
    area('objets','Objets personnels et accessoires laissés à bord',{rows:2,ph:'Aucun, ou liste précise'})+'</div>'+
  '<div class="sec"><h3>Nature de l’intervention <em>*</em></h3><div class="types">'+Object.keys(TYPES).map(function(k){return '<button class="type" style="--c:var('+TYPES[k].c+')" aria-pressed="'+(v.type===k)+'" data-act="type" data-v="'+k+'">'+TYPES[k].l+'</button>'}).join('')+'</div>'+
    '<div class="grid2">'+fld('rattache','Rattaché à (session, stagiaire, parcours)',{ph:'Ex. session polissage du 14 octobre'})+fld('resp','Responsable de la voiture',{req:1,list:'people',ph:'Un nom'})+'</div></div>'+
  '<div class="sec"><h3>Ce qui doit être fait</h3>'+
    area('ops','Opérations à réaliser',{req:1,rows:5,ph:'Ex. décontamination, polissage 2 étapes capot et ailes, lavage intérieur'})+
    area('dit','Ce qui a été dit au client (engagements, délais, limites)',{rows:4,ph:'Ex. la rayure du pare-chocs ne sera pas reprise, voiture rendue vendredi 17 h'})+
    '<div class="grid2">'+fld('dateLimite','Engagement : date maximum promise',{type:'date',req:1})+fld('engageValide','Engagement validé par',{req:1,list:'people',ph:'Qui a donné cet accord'})+'</div>'+
    '<div class="seg"><button class="btn sm" data-act="tampon">Voiture tampon : 01/01/2100</button><span class="sv" style="align-self:center">Voiture tampon, sans délai promis : noter 01/01/2100.</span></div>'+
    area('exclu','À ne pas faire',{rows:2,ph:'Ex. ne pas toucher aux jantes'})+'</div>'+
  '<div class="sec"><h3>Dates et personnes</h3><div class="grid2">'+
    fld('sortiePrevue','Date de sortie prévue',{type:'date',req:1,min:todayISO()})+fld('recep','Réceptionné par',{req:1,list:'people',ph:'Jonathan, Hervé…'})+
    fld('clientNom','Client ou propriétaire',{ph:'Nom'})+fld('clientTel','Téléphone du client',{type:'tel'})+fld('clientMail','E-mail du client',{type:'email'})+'</div>'+
    '<label class="tgl"><input type="checkbox" id="f-copie" data-f="copie"'+(v.copie?' checked':'')+'> Le client reçoit une copie du PDF</label></div>';
}

function tile(phase,s,nextKey){
  var id=phase+'_'+s.k,p=S.photos.filter(function(x){return x.id===id})[0],busy=S.busy[id];
  var ref=phase==='sortie'?S.photos.filter(function(x){return x.id==='entree_'+s.k})[0]:null;
  var cls='tile'+(p?' has':'')+(!p&&nextKey===s.k?' next':'');
  if(!p&&isLocked(VV(),phase==='entree'?'entry':'exit'))return '<div class="'+cls+'"><span>—</span><span class="lb">'+esc(s.l)+'</span></div>';
  return '<button class="'+cls+'" data-act="'+(p?'view':'shoot')+'" data-phase="'+phase+'" data-slot="'+s.k+'" data-label="'+esc(s.l)+'">'+
    (p?'<img class="ph" loading="lazy" alt="'+esc(s.l)+'" src="'+esc(srcOf(p))+'"><span class="ok">✓</span>':(busy?'<span>Envoi…</span>':CAM+'<span>Prendre</span>'))+
    (ref?'<img class="ref" alt="Entrée" src="'+esc(srcOf(ref))+'">':'')+
    '<span class="lb">'+esc(s.l)+(busy&&p?' · envoi…':'')+'</span></button>';
}
function extraTiles(extras,phase){return extras.length?'<div class="tiles">'+extras.map(function(p){return '<button class="tile has" data-act="view" data-phase="'+phase+'" data-pid="'+esc(p.id)+'"><img class="ph" loading="lazy" alt="'+esc(p.label)+'" src="'+esc(srcOf(p))+'"><span class="lb">'+esc(p.label||'Détail')+'</span></button>'}).join('')+'</div>':''}
function photoGrid(phase){
  var v=VV(),lk=isLocked(v,phase==='entree'?'entry':'exit');
  var set=phase==='entree'?entrySet():exitSet();
  var next=null;SLOTS.forEach(function(s){if(!next&&!set[s.k])next=s.k});
  var done=SLOTS.filter(function(s){return set[s.k]}).length;
  var extras=S.photos.filter(function(p){return p.phase===phase&&p.slot&&p.slot.charAt(0)==='x'}).sort(function(a,b){return a.ts-b.ts});
  var bar='<div class="pbar" aria-hidden="true"><i style="width:'+Math.min(100,Math.round(done/SLOTS.length*100))+'%"></i></div>';
  var tiles='<div class="tiles">'+SLOTS.map(function(s){return tile(phase,s,next)}).join('')+'</div>';
  if(lk)return bar+'<div class="seg"><span class="sv">'+done+' sur '+SLOTS.length+' · photos verrouillées. Les ajouts se font dans Compléments.</span></div>'+tiles+(extras.length?'<div class="sec" style="background:var(--bg)"><h3>Photos de détail</h3>'+extraTiles(extras,phase)+'</div>':'');
  return bar+
    '<div class="seg"><button class="btn pri shoot" data-act="next" data-phase="'+phase+'">'+CAM+(next?'Photo suivante : '+esc(SLOTS.filter(function(s){return s.k===next})[0].l):'Toutes les vues sont prises')+'</button>'+
    '<span class="sv" style="align-self:center">'+done+' sur '+SLOTS.length+(phase==='sortie'?' · '+SORTIE_REQ+' minimum pour valider la sortie':'')+'</span></div>'+tiles+
    '<div class="sec" style="background:var(--bg)"><h3>Photos de détail</h3><p class="hint">Rayure, impact, numéro de série, tout ce qui mérite un gros plan. On peut en ajouter à tout moment.</p>'+
    '<div class="seg"><label class="fld" style="flex:1;min-width:200px"><span>Légende</span><input id="xl-'+phase+'" type="text" placeholder="Ex. impact porte arrière gauche" autocomplete="off"></label>'+
    '<button class="btn" style="align-self:flex-end" data-act="extra" data-phase="'+phase+'">'+CAM+'Prendre</button>'+
    '<button class="btn" style="align-self:flex-end" data-act="extragal" data-phase="'+phase+'">Importer</button></div>'+extraTiles(extras,phase)+'</div>';
}
function tabPhotos(){return '<div class="sec"><h3>Photos à l’arrivée</h3><p class="hint">Chaque photo est enregistrée dès la prise de vue, avec la plaque, la date et l’heure incrustées. Les douze vues sont obligatoires pour valider l’entrée.</p><div id="pg-entree" class="sec" style="border:0;padding:0">'+photoGrid('entree')+'</div></div>'}

function carView(k){
  var vw=VIEWS[k],v=VV(),marks=(v.marks||[]);
  var sh=vw.sh.map(function(s){var cls='s'+s[0];
    return s[1]==='r'?'<rect class="'+cls+'" x="'+s[2]+'" y="'+s[3]+'" width="'+s[4]+'" height="'+s[5]+'" rx="'+s[6]+'"/>':'<circle class="'+cls+'" cx="'+s[2]+'" cy="'+s[3]+'" r="'+s[4]+'"/>'}).join('');
  var lab=k==='top'?'<text class="o" x="100" y="26" text-anchor="middle">AVANT</text><text class="o" x="100" y="396" text-anchor="middle">ARRIÈRE</text>':
    '<text class="o" x="'+(k==='left'?16:384)+'" y="160" text-anchor="'+(k==='left'?'start':'end')+'">AVANT</text>';
  var mk=marks.map(function(m,i){if(m.v!==k)return '';var col=(DMG.filter(function(d){return d[0]===m.t})[0]||DMG[5])[2];
    return '<g class="mk"><circle cx="'+(m.x/100*vw.w)+'" cy="'+(m.y/100*vw.h)+'" r="'+(k==='top'?11:12)+'" fill="'+col+'"/><text x="'+(m.x/100*vw.w)+'" y="'+(m.y/100*vw.h)+'">'+(i+1)+'</text></g>'}).join('');
  return '<div class="cv'+(k==='top'?' top-v':'')+'"><h4>'+vw.lab+'</h4><svg viewBox="0 0 '+vw.w+' '+vw.h+'" data-view="'+k+'" role="img" aria-label="Schéma '+vw.lab+', toucher pour marquer un défaut">'+sh+lab+mk+'</svg></div>';
}
function tabDom0(v){
  var marks=v.marks||[];
  var rows=marks.map(function(m,i){
    return '<div class="mrow"><span class="mnum" style="background:'+(DMG.filter(function(d){return d[0]===m.t})[0]||DMG[5])[2]+'">'+(i+1)+'</span>'+
      '<select class="mt" data-mk="'+i+'" data-mf="t" aria-label="Type de défaut" style="min-height:44px;border-radius:6px;border:1.5px solid var(--line);background:var(--bg);padding:0 8px">'+DMG.map(function(d){return '<option value="'+d[0]+'"'+(m.t===d[0]?' selected':'')+'>'+d[1]+'</option>'}).join('')+'</select>'+
      '<input type="text" data-mk="'+i+'" data-mf="n" value="'+esc(m.n||'')+'" placeholder="Précision (taille, position)" aria-label="Précision du défaut '+(i+1)+'">'+
      '<button class="btn sm bad" data-act="delmk" data-i="'+i+'" aria-label="Supprimer le défaut '+(i+1)+'">Supprimer</button></div>'}).join('');
  var ch=CHECK.map(function(c){var s=(v.chk&&v.chk[c.k])||{};
    return '<div class="crow"><span>'+esc(c.l)+'</span><div class="sgm">'+[['ras','RAS'],['def','Défaut'],['na','N/A']].map(function(o){return '<button class="'+o[0]+'" aria-pressed="'+(s.s===o[0])+'" data-act="chk" data-k="'+c.k+'" data-s="'+o[0]+'">'+o[1]+'</button>'}).join('')+'</div>'+
      (s.s==='def'?'<div class="nt"><input type="text" data-ck="'+c.k+'" value="'+esc(s.n||'')+'" placeholder="Décrire le défaut constaté" aria-label="Défaut : '+esc(c.l)+'"></div>':'')+'</div>'}).join('');
  return '<div class="sec"><h3>Schéma des dommages</h3><p class="hint">Choisir le type de défaut, puis toucher le schéma à l’endroit exact.</p>'+
    '<div class="dmg">'+DMG.map(function(d){return '<button class="btn sm'+(S.dmg===d[0]?' on':'')+'" data-act="dmg" data-v="'+d[0]+'"><span style="width:12px;height:12px;border-radius:50%;background:'+d[2]+';display:inline-block"></span>'+d[1]+'</button>'}).join('')+'</div>'+
    '<div class="carviews">'+carView('top')+carView('left')+carView('right')+'</div>'+
    (marks.length?'<div class="stack">'+rows+'</div>':'<p class="hint">Aucun dommage marqué. Si le véhicule est sans défaut, laisser vide et cocher RAS partout ci-dessous.</p>')+'</div>'+
  '<div class="sec"><h3>Contrôle point par point</h3><div>'+ch+'</div></div>';
}

function mesBody(){
  var by=function(a,b){return a.ts-b.ts};
  var pdfs=S.photos.filter(function(p){return p.phase==='mesures'&&p.kind==='pdf'}).sort(by);
  var ph=S.photos.filter(function(p){return p.phase==='mesures'&&p.kind!=='pdf'}).sort(by);
  return '<h3 style="font-size:18px">PDF reçu du NexDiag</h3><p class="hint">Dans le mail envoyé par le NexDiag, enregistrer la pièce jointe sur le PC, puis la choisir ici. Ses pages sont ajoutées au PDF final du véhicule.</p>'+
    (pdfs.length?'<div class="stack">'+pdfs.map(function(p){return '<div class="arow"><span class="grow"><b>'+esc(p.label)+'</b><br><span class="sv">Ajouté le '+esc(fmtDT(p.ts))+(p.by?' par '+esc(p.by):'')+'</span></span><button class="btn sm" data-act="openpdf" data-pid="'+esc(p.id)+'">Ouvrir</button><button class="btn sm bad" data-act="delphoto" data-pid="'+esc(p.id)+'">Retirer</button></div>'}).join('')+'</div>':'<p class="sv">Aucun PDF ajouté pour l’instant.</p>')+
    '<div class="seg"><button class="btn pri" data-act="addpdf">Ajouter le PDF du NexDiag</button></div>'+
    '<h3 style="font-size:18px">Photos de mesure</h3>'+
    '<div class="seg"><label class="fld" style="flex:1;min-width:200px"><span>Légende</span><input id="xl-mesures" type="text" placeholder="Ex. capot, zone repeinte" autocomplete="off"></label>'+
    '<button class="btn" style="align-self:flex-end" data-act="extra" data-phase="mesures">'+CAM+'Prendre</button>'+
    '<button class="btn" style="align-self:flex-end" data-act="extragal" data-phase="mesures">Importer</button></div>'+
    (ph.length?'<div class="tiles">'+ph.map(function(p){return '<button class="tile has" data-act="view" data-phase="mesures" data-pid="'+esc(p.id)+'"><img class="ph" loading="lazy" alt="'+esc(p.label)+'" src="'+esc(srcOf(p))+'"><span class="lb">'+esc(p.label||'Mesure')+'</span></button>'}).join('')+'</div>':'');
}
function tabMes(v){
  var mes=v.mes||{};
  return '<div class="sec"><h3>Analyse NexDiag</h3><div id="pg-mes" class="stack">'+mesBody()+'</div></div>'+
    '<div class="sec"><h3>Épaisseurs relevées à la main</h3><p class="hint">Facultatif, en microns. Utile quand le PDF de l’appareil n’est pas disponible.</p><div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">'+
    PANELS.map(function(p){return '<label class="fld"><span>'+p[1]+'</span><input type="number" inputmode="numeric" data-mesk="'+p[0]+'" value="'+esc(mes[p[0]]==null?'':mes[p[0]])+'" placeholder="µm"></label>'}).join('')+'</div></div>'+
    '<div class="sec"><h3>Notes d’analyse</h3>'+area('mesNotes','Remarques (zones repeintes, valeurs suspectes, conseils au client)',{rows:4})+'</div>';
}
function sigBlock(field,title,defName){
  var v=VV(),s=v[field];
  return '<div class="sec"><h3>'+title+'</h3>'+
    (s?'<div class="sigimg"><img alt="Signature" src="'+esc(s.img)+'"></div><div class="sv">Signé par '+esc(s.nom||'—')+' le '+esc(fmtDT(s.ts))+'</div><div><button class="btn sm" data-act="resig" data-f="'+field+'">Refaire la signature</button></div>':
    '<label class="fld"><span>Nom du signataire</span><input type="text" id="sn-'+field+'" value="'+esc(defName||'')+'" autocomplete="off"></label>'+
    '<canvas class="pad" width="600" height="200" data-pad="'+field+'" aria-label="Zone de signature"></canvas>'+
    '<div class="seg"><button class="btn" data-act="clearpad" data-f="'+field+'">Effacer</button><button class="btn pri" data-act="savesig" data-f="'+field+'">Enregistrer la signature</button></div>')+'</div>';
}
function tabSign0(v){
  return '<div class="banner">Le réceptionnaire et le client signent après avoir relu les informations, les dommages relevés et le travail à réaliser.</div>'+
    sigBlock('sigRecep','Signature du réceptionnaire',v.recep)+
    '<label class="tgl sec"><input type="checkbox" id="f-ca" data-f="clientAbsent"'+(v.clientAbsent?' checked':'')+'> Client absent à l’arrivée du véhicule (pas de signature client)</label>'+
    (v.clientAbsent?'':sigBlock('sigClient','Signature du client',v.clientNom));
}

function tabSortie(v){
  if(v.statut==='brouillon')return '<div class="banner">La sortie devient possible une fois l’entrée validée.</div>';
  var rem='<div class="sec"><h3>Rappel de ce qui était prévu</h3><div class="remind"><b>À réaliser</b>'+esc(v.ops||'—')+'</div>'+
    (v.dit?'<div class="remind"><b>Dit au client</b>'+esc(v.dit)+'</div>':'')+
    (v.dateLimite?'<div class="remind"><b>Engagement client</b>Maximum : '+esc(limTxt(v))+(v.engageValide?'. Validé par '+esc(v.engageValide):'')+'</div>':'')+(v.exclu?'<div class="remind"><b>À ne pas faire</b>'+esc(v.exclu)+'</div>':'')+
    '<div class="seg"><span class="chip">Entrée '+esc(v.entreeAt?fmtDT(v.entreeAt):'—')+'</span><span class="chip">Sortie prévue '+esc(v.sortiePrevue?fmtD(v.sortiePrevue):'—')+'</span></div></div>';
  if(v.statut==='sorti'&&S.unlocked!==v.id)return rem+'<div class="sec"><h3>Véhicule sorti</h3><div class="grid2"><div class="remind"><b>Date et heure de sortie</b>'+esc(fmtDT(v.sortieAt))+'</div><div class="remind"><b>Véhicule rendu par</b>'+esc(v.remisPar||'—')+'</div><div class="remind"><b>Récupéré par</b>'+esc(v.remisA||'—')+'</div></div>'+(v.notesSortie?'<div class="remind"><b>Notes de sortie</b>'+esc(v.notesSortie)+'</div>':'')+'<div class="tiles" id="pg-sortie-ro">'+SLOTS.map(function(s){var p=S.photos.filter(function(x){return x.id==='sortie_'+s.k})[0];return p?'<button class="tile has" data-act="view" data-phase="sortie" data-slot="'+s.k+'"><img class="ph" loading="lazy" alt="'+esc(s.l)+'" src="'+esc(srcOf(p))+'"><span class="lb">'+esc(s.l)+'</span></button>':''}).join('')+'</div></div>';
  return rem+
    '<div class="sec"><h3>Remise du véhicule</h3><div class="remind"><b>Date et heure de sortie</b><span id="clk">'+esc(fmtDT(Date.now()))+'</span> : enregistrées automatiquement à la validation de la sortie.</div><div class="grid2">'+fld('remisPar','Qui a rendu le véhicule',{req:1,list:'people',ph:'Nom de la personne de l’atelier'})+fld('remisA','Nom de la personne qui vient le récupérer',{req:1,ph:'Nom et prénom'})+'</div>'+
    area('notesSortie','Notes de sortie (réserves, remarques du client)',{rows:3})+
    '<label class="tgl"><input type="checkbox" id="f-of" data-f="opsFaites"'+(v.opsFaites?' checked':'')+'> Tout ce qui figure dans « À réaliser » a été fait ou signalé</label></div>'+
    '<div class="sec"><h3>Photos à la sortie</h3><p class="hint">Même série que l’entrée, la photo d’entrée apparaît en vignette pour comparer.</p><div id="pg-sortie" class="sec" style="border:0;padding:0">'+photoGrid('sortie')+'</div></div>'+
    sigBlock('sigSortie','Signature à la remise',v.remisA);
}
function exitReady(v){var es=exitSet(),n=SLOTS.filter(function(s,i){return i<SORTIE_REQ&&es[s.k]}).length;
  return [{t:'Rendu par et récupéré par',ok:!!(v.remisPar&&v.remisA)},{t:'Travaux confirmés',ok:!!v.opsFaites},{t:'Photos '+n+'/'+SORTIE_REQ,ok:n===SORTIE_REQ},{t:'Signature',ok:!!v.sigSortie}]}

function sheetHead(v){
  var t=TYPES[v.type];
  var seg='';
  if(S.cur&&v.statut&&v.statut!=='brouillon'&&v.statut!=='sorti'){
    seg='<div class="seg">'+COLS.slice(1).map(function(c){return '<button class="btn sm'+(v.statut===c[0]?' on':'')+'" data-act="status" data-v="'+c[0]+'">'+c[1]+'</button>'}).join('')+'</div>';
  }
  var nc=S.cur?(S.cm[S.cur]||[]).length:0;var tabs=[['infos','Informations'],['photos','Photos'],['dom','Dommages et contrôle'],['mes','Mesures'],['sign','Signatures'],['compl','Compléments'+(nc?' ('+nc+')':'')],['sortie','Sortie']];
  if(!S.cur)tabs=[['infos','Informations']];
  return '<div class="sh"><div class="shin"><div class="shrow"><button class="btn" data-act="close">← Tableau</button>'+
    '<div class="ttl">'+plateHtml(v.plaque||'')+'<div>'+esc([v.marque,v.modele].filter(Boolean).join(' ')||'Nouvelle entrée')+(t?' · '+esc(t.l):'')+'</div></div>'+seg+
    (S.cur?'<button class="btn" data-act="pdf" data-mode="entree">PDF d’entrée (client)</button><button class="btn" data-act="pdf" data-mode="full">PDF complet</button>':'')+
    ((v.arch&&v.arch.length)?'<span class="chip ok">Dernier PDF archivé '+esc(fmtDT(v.arch[v.arch.length-1].ts))+'</span>':'')+'<span class="sv" id="sv"></span></div>'+
    '<div class="tabs" role="tablist">'+tabs.map(function(a){return '<button class="tab" role="tab" aria-selected="'+(S.tab===a[0])+'" data-act="tab" data-v="'+a[0]+'">'+a[1]+'</button>'}).join('')+'</div></div></div>';
}
function gate(v){
  if(!S.cur)return '<div class="gate"><div class="shin"><div class="chips"><span class="sv">Renseigner la plaque, le réceptionnaire et la nature de l’intervention pour créer le dossier et passer aux photos.</span></div><button class="btn pri shoot" data-act="create">Créer le dossier et prendre les photos</button></div></div>';
  if(v.statut==='brouillon'){
    var r=readiness(v),all=r.every(function(x){return x.ok});
    return '<div class="gate"><div class="shin"><div class="chips">'+r.map(function(x){return '<button class="chip '+(x.ok?'ok':'warn')+'" data-act="tab" data-v="'+x.tab+'" style="background:none">'+(x.ok?'✓ ':'')+esc(x.t)+'</button>'}).join('')+'</div><button class="btn pri shoot" data-act="validate"'+(all?'':' disabled')+'>Valider l’entrée</button></div></div>';
  }
  if(S.tab==='sortie'&&v.statut!=='sorti'){
    var e=exitReady(v),ok=e.every(function(x){return x.ok});
    return '<div class="gate"><div class="shin"><div class="chips">'+e.map(function(x){return '<span class="chip '+(x.ok?'ok':'warn')+'">'+(x.ok?'✓ ':'')+esc(x.t)+'</span>'}).join('')+'</div><button class="btn pri shoot" data-act="validateexit"'+(ok?'':' disabled')+'>Valider la sortie</button></div></div>';
  }
  return '';
}
function tabHtml(v){return S.tab==='compl'?tabCompl(v):S.tab==='photos'?tabPhotos(v):S.tab==='dom'?tabDom(v):S.tab==='mes'?tabMes(v):S.tab==='sign'?tabSign(v):S.tab==='sortie'?tabSortie(v):tabInfos(v)}
function renderSheet(keepScroll){
  var sh=$('#sheet'),v=VV();if(!v){sh.hidden=true;return}
  var y=keepScroll?sh.scrollTop:0;
  var st=v.statut==='sorti'?'<div class="banner">Véhicule sorti le '+esc(fmtDT(v.sortieAt))+(v.remisA?', récupéré par '+esc(v.remisA):'')+(v.remisPar?', rendu par '+esc(v.remisPar):'')+'. Le dossier reste consultable ; ce qui est découvert ensuite s’ajoute dans Compléments.</div>':'';
  sh.innerHTML=sheetHead(v)+'<div class="body">'+lockBar(v)+st+tabHtml(v)+'</div>'+gate(v);
  sh.hidden=false;document.documentElement.style.overflow='hidden';
  sh.scrollTop=y;
  mountPads();
}
function mountPads(){
  document.querySelectorAll('canvas.pad').forEach(function(cv){
    var ctx=cv.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
    ctx.lineWidth=3.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#111';
    var drawing=false;
    function pos(e){var r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*cv.width/r.width,y:(e.clientY-r.top)*cv.height/r.height}}
    cv.addEventListener('pointerdown',function(e){drawing=true;cv.dataset.dirty='1';try{cv.setPointerCapture(e.pointerId)}catch(x){}var p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y);ctx.stroke();e.preventDefault()});
    cv.addEventListener('pointermove',function(e){if(!drawing)return;var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()});
    ['pointerup','pointercancel','pointerleave'].forEach(function(n){cv.addEventListener(n,function(){drawing=false})});
  });
}
function refreshChrome(){
  var v=VV();if(!v||$('#sheet').hidden)return;
  var sh=$('#sheet');
  var cur=sh.querySelector('.gate');
  var html=gate(v);
  if(cur){var d=document.createElement('div');d.innerHTML=html;if(d.firstChild)cur.replaceWith(d.firstChild);else cur.remove()}
  else if(html){sh.insertAdjacentHTML('beforeend',html)}
}
function refreshPhotos(){
  ['entree','sortie'].forEach(function(ph){var el=$('#pg-'+ph);if(el){var inp=$('#xl-'+ph),val=inp?inp.value:'';el.innerHTML=photoGrid(ph);var i2=$('#xl-'+ph);if(i2)i2.value=val}});
  var em=$('#pg-mes');if(em){var xi=$('#xl-mesures'),xv=xi?xi.value:'';em.innerHTML=mesBody();var x2=$('#xl-mesures');if(x2)x2.value=xv}
  refreshChrome();
}

/* ---------- ouverture et création ---------- */
function openDossier(id,tab){
  var v=V(id);if(!v)return;
  S.cur=id;S.draft=null;S.unlocked=null;S.snap=null;S.cdraft=null;
  S.photos=S.pm[id]||(S.pm[id]=[]);
  S.tab=tab||(v.statut==='brouillon'?'photos':'infos');
  renderSheet();
}
function newEntry(){
  S.cur=null;S.photos=[];S.tab='infos';S.unlocked=null;S.cdraft=null;
  S.draft={type:'',recep:lastWho(),sortiePrevue:''};
  renderSheet();
}
function closeSheet(){
  autoCreate();flush();camClose(true);
  S.cur=null;S.draft=null;S.photos=[];S.lb=null;S.unlocked=null;S.snap=null;S.cdraft=null;
  $('#sheet').hidden=true;$('#lightbox').hidden=true;document.documentElement.style.overflow='';renderMain();
}
function createDossier(){
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
function autoCreate(){
  var d=S.draft;if(!d||S.cur||!normPlate(d.plaque)||!d.recep)return;
  startDossier(d);
  if(!$('#sheet').hidden)refreshChrome();
}

/* ---------- verrouillage de l'entrée ---------- */
var SIGLAB={sigRecep:'du réceptionnaire',sigClient:'du client'};
function validateEntry(){
  var v3=VV();if(!v3||v3.statut!=='brouillon')return;
  S.unlocked=null;S.snap=null;
  save({statut:'atelier',entreeAt:Date.now(),hist:hist(v3,'Entrée validée : le dossier est verrouillé')}).then(function(){toast('Entrée validée, dossier en atelier');return makePdf('entree',true)});
  renderSheet();
}
/* f = signature qui vient d'être posée : si le verrouillage est refusé, elle est retirée. */
function lockConfirm(f){
  var undo=f?'<p class="hint"><b>Si vous annulez, la signature '+esc(SIGLAB[f]||'')+' que vous venez de poser sera retirée</b> et devra être refaite avant de pouvoir verrouiller.</p>':'';
  modalShow('<h2>Verrouiller la fiche ?</h2>'+
    '<p>Les informations, les photos, le contrôle et les signatures sont complets. En validant, l’entrée est <b>verrouillée</b> : toute correction demandera le code PIN propriétaire et sera inscrite dans l’historique. Le PDF d’entrée est ensuite créé.</p>'+undo+
    '<div class="mrow2"><button class="btn" data-act="lockcancel"'+(f?' data-f="'+esc(f)+'"':'')+'>'+(f?'Annuler et retirer la signature':'Annuler')+'</button><button class="btn pri" data-act="lockok">Verrouiller la fiche</button></div>');
}
function undoSig(f){
  var v=VV();if(!v||!v[f])return;
  var o={};o[f]=null;o.hist=hist(v,'Signature '+(SIGLAB[f]||'')+' retirée : verrouillage de la fiche non confirmé');
  save(o);renderSheet(true);toast('Signature retirée');
}

/* ---------- photos ---------- */
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
async function commitPhoto(src,item,opt){
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
async function complSink(src,item,opt){
  var v=VV(),d=getCd();if(!v)return null;
  try{
    var jp=await makeJpeg(src,v,'compl',d.by||'',opt);
    var url=URL.createObjectURL(jp.blob);
    d.pics.push({bytes:jp.bytes,url:url,label:item.label||'Complément',ts:Date.now(),imported:!!(opt&&opt.imported),origName:opt&&opt.name||''});
    return {thumb:url};
  }catch(e){toast('Photo non prise en compte');return null}
}
function canShoot(phase){
  var v=VV();if(!v)return false;
  if((phase==='entree'&&isLocked(v,'entry'))||((phase==='sortie'||phase==='mesures')&&isLocked(v,'exit'))){toast('Dossier verrouillé : utiliser Compléments, ou le code PIN pour corriger');return false}
  return true;
}
function missing(phase){var set=phase==='entree'?entrySet():exitSet();return SLOTS.filter(function(s){return !set[s.k]}).map(function(s){return {phase:phase,slot:s.k,label:s.l}})}
function startQueue(phase,first){
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
async function doImport(next,sink){
  var files=await api.importImages();if(!files||!files.length)return 0;
  var n=0;
  for(var i=0;i<files.length;i++){
    var it=next(files[i],i);if(!it)break;
    try{var bmp=await loadBitmap(new Blob([files[i].bytes]));var r=await sink(bmp,it,{imported:true,name:files[i].name});if(r)n++}
    catch(e){toast('Image illisible : '+files[i].name)}
  }
  return n;
}
async function handlePdf(){
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
async function delPhoto(pid){
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

/* ---------- caméra intégrée ---------- */
var CM=null;
function camOpen(o){
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
function camSwitch(){if(!CM||CM.devs.length<2)return;CM.di=CM.di<0?1:(CM.di+1)%CM.devs.length;camStart()}
async function camShot(){
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
function camSkip(){if(!CM||CM.o.free)return;CM.idx++;if(CM.idx>=CM.o.queue.length){camClose();return}camLabel()}
async function camImport(){
  if(!CM)return;var o=CM.o;
  var n=await doImport(function(f,i){
    if(o.free){var cap=$('#camcap');return {phase:o.phase,slot:'x'+Date.now()+'_'+i,label:(cap&&cap.value.trim())||f.name.replace(/\.[^.]+$/,'')||o.defLabel||'Détail'}}
    var it=o.queue[CM.idx];if(!it)return null;CM.idx++;return it;
  },o.sink);
  if(!CM)return;
  if(n){if(!o.free&&CM.idx>=o.queue.length){camClose();toast('Images importées');return}camLabel();toast(n+' image(s) importée(s)')}
}
function camClose(silent){
  if(CM&&CM.stream)CM.stream.getTracks().forEach(function(t){t.stop()});
  CM=null;var el=$('#camera');el.hidden=true;el.innerHTML='';
  if(!silent){if(S.cur||S.draft){if(!$('#sheet').hidden)document.documentElement.style.overflow='hidden';renderSheet(true)}else document.documentElement.style.overflow=''}
}

/* ---------- compléments : enregistrement ---------- */
async function cdSave(){
  var v=V(S.cur),d=S.cdraft;if(!v||!d)return;
  if(!d.by.trim()){toast('Indiquer qui ajoute le complément');return}
  if(!d.text.trim()&&!d.pics.length){toast('Décrire ce qui est constaté ou ajouter une photo');return}
  var cid='c'+Date.now(),id=S.cur,ids=[];
  try{
    for(var i=0;i<d.pics.length;i++){
      var p=d.pics[i],slot=cid+'_'+(i+1),pid='compl_'+slot;
      await api.savePhoto(id,pid,p.bytes);
      var rec={phase:'compl',slot:slot,cid:cid,label:p.label,ts:p.ts,by:d.by.trim(),file:pid,rev:1};
      if(p.imported){rec.imported=true;rec.origName=p.origName}
      await api.write('vehicules/'+id+'/photos/'+pid,rec);
      rec.id=pid;rec.vid=id;S.photos.push(rec);ids.push(pid);
    }
    var c={id:cid,ts:Date.now(),by:d.by.trim(),kind:d.kind,text:d.text.trim(),n:ids.length};
    await api.write('vehicules/'+id+'/compl/'+cid,c);
    (S.cm[id]=S.cm[id]||[]).push(c);
    try{localStorage.setItem('rv-recep',d.by.trim())}catch(e){}
    save({hist:hist(v,'Complément ajouté : '+ckLabel(d.kind)+' ('+ids.length+' photo'+(ids.length>1?'s':'')+')',d.by.trim())});
    S.cdraft=null;renderSheet(true);toast('Complément enregistré');
  }catch(e){toast('Complément non enregistré : '+(e&&e.message||'erreur'))}
}

/* ---------- code PIN et réglages ---------- */
function modalShow(html){var m=$('#modal');m.innerHTML='<div class="mbox">'+html+'</div>';m.hidden=false}
function modalHide(){var m=$('#modal');m.hidden=true;m.innerHTML='';m.onclick=null}
function pinEntry(title,sub,o){
  o=o||{};
  return new Promise(function(res){
    var val='';
    function paint(){var h='';for(var i=0;i<Math.max(4,val.length);i++)h+='<i class="'+(i<val.length?'on':'')+'"></i>';var e=$('#pdots');if(e)e.innerHTML=h}
    modalShow('<h2>'+esc(title)+'</h2>'+(sub?'<p class="hint">'+esc(sub)+'</p>':'')+'<div class="pinbox" id="pdots"></div><div class="perr" id="perr">'+esc(o.msg||'')+'</div><div class="keypad">'+['1','2','3','4','5','6','7','8','9','⌫','0','OK'].map(function(k){return '<button type="button" data-pin="'+k+'">'+k+'</button>'}).join('')+'</div>'+(o.cancel===false?'':'<div class="seg" style="justify-content:center"><button class="btn" data-pin="cancel">Annuler</button></div>'));
    paint();
    function done(r){document.removeEventListener('keydown',kd,true);$('#modal').onclick=null;res(r)}
    function press(k){
      if(k==='cancel'){done(null);return}
      if(k==='⌫'||k==='Backspace'){val=val.slice(0,-1);paint();return}
      if(k==='OK'||k==='Enter'){if(val.length<4){$('#perr').textContent='4 chiffres minimum';return}done(val);return}
      if(/^\d$/.test(k)&&val.length<8){val+=k;paint()}
    }
    function kd(e){
      if(e.key==='Escape'&&o.cancel!==false){e.preventDefault();done(null);return}
      if(/^\d$/.test(e.key)||e.key==='Backspace'||e.key==='Enter'){e.preventDefault();e.stopPropagation();press(e.key)}
    }
    document.addEventListener('keydown',kd,true);
    $('#modal').onclick=function(e){var b=e.target.closest('[data-pin]');if(b)press(b.dataset.pin)};
  });
}
async function askPin(title,sub){
  var msg='';
  for(;;){
    var p=await pinEntry(title,sub,{msg:msg});
    if(p===null){modalHide();return null}
    var r=await api.pinVerify(p);
    if(r.ok){modalHide();return p}
    if(r.none){modalHide();toast('Aucun code PIN défini');return null}
    msg=r.wait?'Trop d’essais : patienter '+r.wait+' s':'Code incorrect'+(r.left!=null?' ('+r.left+' essai'+(r.left>1?'s':'')+' restant'+(r.left>1?'s':'')+')':'');
  }
}
async function newPin(first){
  var msg='';
  for(;;){
    var a=await pinEntry(first?'Créer le code PIN propriétaire':'Nouveau code PIN',first?'Ce code protège les corrections, le retrait d’éléments et les réglages. 4 à 8 chiffres. À ne donner à personne d’autre.':'4 à 8 chiffres',{cancel:!first,msg:msg});
    if(a===null){modalHide();return null}
    var b=await pinEntry('Confirmer le code PIN','Saisir le même code une seconde fois',{cancel:!first});
    if(b===null){modalHide();return null}
    if(a===b){modalHide();return a}
    msg='Les deux codes sont différents, recommencer';
  }
}
var SETPIN=null;
async function openSettings(){
  var pin=await askPin('Réglages','Code PIN propriétaire');if(!pin)return;
  SETPIN=pin;drawSettings();
}
async function drawSettings(){
  var s=await api.settings();
  modalShow('<h2>Réglages</h2><p class="hint">Dossier des données de ce poste :</p><div class="path">'+esc(s.dataDir)+'</div><p class="hint">Dossier des archives PDF (lecture seule, avec registre d’intégrité) :</p><div class="path">'+esc(s.archiveDir)+'</div>'+
    '<p class="hint">Pour sauvegarder sur Google Drive : choisir ici un sous-dossier du dossier « Google Drive » créé par l’application Drive pour ordinateur, puis partager ce dossier en « Lecteur » avec l’équipe. Seul le propriétaire du Drive peut alors le modifier.</p>'+
    '<div class="seg"><button class="btn" data-act="openarch">Ouvrir les archives</button><button class="btn" data-act="chooseArch">Changer le dossier d’archives</button><button class="btn" data-act="changepin">Changer le code PIN</button></div>'+
    '<p class="sv">Version '+esc(s.version)+'</p><div class="seg"><button class="btn pri" data-act="closemodal">Fermer</button></div>');
}
async function unlock(){
  var v=VV();if(!v)return;
  var pin=await askPin('Code PIN propriétaire','Ouvrir le mode correction du dossier '+fmtPlate(v.plaque));if(!pin)return;
  await flush();
  S.unlocked=v.id;S.snap=snapOf(v);S.unlockTs=Date.now();
  save({hist:hist(v,'Mode correction ouvert avec le code PIN propriétaire','Propriétaire (code PIN)')});
  renderSheet(true);
}
function relock(){
  var v=VV();if(!v)return;
  flush().then(function(){
    save({hist:hist(v,'Mode correction terminé','Propriétaire (code PIN)')});
    S.unlocked=null;S.snap=null;renderSheet(true);toast('Dossier verrouillé');
  });
}

/* ---------- visionneuse ---------- */
function findPhoto(){
  if(!S.lb)return null;
  return S.photos.filter(function(x){return x.id===S.lb})[0]||null;
}
function updateLightbox(){
  var lb=$('#lightbox'),p=findPhoto();
  if(!p){lb.hidden=true;S.lb=null;return}
  var fixed=SLOTS.some(function(x){return x.k===p.slot});
  lb.innerHTML='<img alt="'+esc(p.label)+'" src="'+esc(srcOf(p))+'"><div class="bar"><span>'+esc(p.label||'')+' · '+esc(fmtDT(p.ts))+(p.by?' · '+esc(p.by):'')+'</span>'+
    (fixed&&(p.phase==='entree'||p.phase==='sortie')&&S.cur&&V(S.cur)&&!isLocked(V(S.cur),p.phase==='sortie'?'exit':'entry')?'<button class="btn sm" data-act="retake" data-phase="'+esc(p.phase)+'" data-slot="'+esc(p.slot)+'" data-label="'+esc(p.label)+'">Reprendre</button>':'')+
    (!fixed&&p.phase!=='compl'?'<button class="btn sm bad" data-act="delphoto" data-pid="'+esc(p.id)+'">Supprimer</button>':'')+
    '<button class="btn sm" data-act="lbclose">Fermer</button></div>';
  lb.hidden=false;
}

/* ---------- PDF ---------- */
function L(s){return String(s==null?'':s).replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/…/g,'...').replace(/[^\x00-\xFF]/g,'?')}
function imgFrom(src){return new Promise(function(r){var i=new Image();i.onload=function(){r(i)};i.onerror=function(){r(null)};i.src=src})}
async function pdfImg(p){
  try{var i=await imgFrom(srcOf(p));if(!i)return null;
    var k=Math.min(1,1000/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
    c.getContext('2d').drawImage(i,0,0,c.width,c.height);return {d:c.toDataURL('image/jpeg',.72),w:c.width,h:c.height}}catch(e){return null}
}
function pdfCar(doc,k,ox,oy,sc,marks){
  var vw=VIEWS[k];
  vw.sh.forEach(function(s){
    if(s[0]==='b'){doc.setFillColor(221,228,225);doc.setDrawColor(74,93,99)}else if(s[0]==='g'){doc.setFillColor(255,255,255);doc.setDrawColor(74,93,99)}else{doc.setFillColor(60,70,74);doc.setDrawColor(30,35,38)}
    doc.setLineWidth(.3);
    if(s[1]==='r')doc.roundedRect(ox+s[2]*sc,oy+s[3]*sc,s[4]*sc,s[5]*sc,s[6]*sc,s[6]*sc,'FD');else doc.circle(ox+s[2]*sc,oy+s[3]*sc,s[4]*sc,'FD');
  });
  doc.setFontSize(6);doc.setTextColor(90,105,110);
  if(k==='top'){doc.text('AVANT',ox+vw.w*sc/2,oy+5*sc,{align:'center'});doc.text('ARRIERE',ox+vw.w*sc/2,oy+(vw.h-2)*sc,{align:'center'})}
  else doc.text('AVANT',ox+(k==='left'?4:vw.w-4)*sc,oy+158*sc,{align:k==='left'?'left':'right'});
  marks.forEach(function(m,i){if(m.v!==k)return;
    var col=(DMG.filter(function(d){return d[0]===m.t})[0]||DMG[5])[2];
    var rgb=[parseInt(col.slice(1,3),16),parseInt(col.slice(3,5),16),parseInt(col.slice(5,7),16)];
    doc.setFillColor(rgb[0],rgb[1],rgb[2]);doc.setDrawColor(255,255,255);doc.setLineWidth(.3);
    var cx=ox+m.x/100*vw.w*sc,cy=oy+m.y/100*vw.h*sc;doc.circle(cx,cy,2.4,'FD');
    doc.setTextColor(255,255,255);doc.setFontSize(7);doc.setFont('helvetica','bold');doc.text(String(i+1),cx,cy+1,{align:'center'});doc.setFont('helvetica','normal');
  });
}
async function buildPdf(v,photos,mode){
  mode=mode||'full';
  var J=window.jspdf.jsPDF,doc=new J({unit:'mm',format:'a4'}),W=210,M=14,y=0,curTitle='';
  var ink=[22,37,42],mut=[90,105,110],acc=[14,90,107],bad=[179,38,30];
  function txt(t,x,yy,o){o=o||{};doc.setFont('helvetica',o.b?'bold':'normal');doc.setFontSize(o.s||10);var c=o.c||ink;doc.setTextColor(c[0],c[1],c[2]);
    var lines=o.w?doc.splitTextToSize(L(t),o.w):[L(t)];doc.text(lines,x,yy,o.a?{align:o.a}:undefined);return lines.length*((o.s||10)*0.42)}
  function band(title,sub){curTitle=title;doc.setFillColor(acc[0],acc[1],acc[2]);doc.rect(0,0,W,22,'F');txt('SP FORMATION · FD Formation Detailing',M,9,{s:9,c:[255,255,255]});txt(title,M,17,{s:15,b:1,c:[255,255,255]});if(sub)txt(sub,W-M,17,{s:9,c:[255,255,255],a:'right'});y=30}
  function ens(h,title){if(y+h>282){doc.addPage();band(title||curTitle||'ÉTAT DES LIEUX',fmtPlate(v.plaque));}}
  function h2(t){ens(14);txt(t.toUpperCase(),M,y,{s:11,b:1,c:acc});doc.setDrawColor(200,208,205);doc.line(M,y+1.6,W-M,y+1.6);y+=7}
  function kv(a,b,x,w){txt(a.toUpperCase(),x,y,{s:7,c:mut});return txt(b||'-',x,y+4,{s:10,b:1,w:w})}
  function para(label,t){if(!t)return;h2(label);var hgt=txt(t,M,y,{s:10,w:W-2*M});y+=hgt+5}
  var es=photos.filter(function(p){return p.phase==='entree'}).sort(function(a,b){return a.ts-b.ts});
  var xs=photos.filter(function(p){return p.phase==='sortie'}).sort(function(a,b){return a.ts-b.ts});

  band(mode==='full'?'DOSSIER COMPLET DU VÉHICULE':"ÉTAT DES LIEUX D'ENTRÉE",'Dossier '+v.id);
  doc.setFillColor(246,246,241);doc.setDrawColor(17,17,17);doc.setLineWidth(.6);doc.roundedRect(M,y-2,70,16,2,2,'FD');
  doc.setFillColor(31,79,163);doc.rect(M,y-2,7,16,'F');txt('F',M+3.5,y+10,{s:8,b:1,c:[255,255,255],a:'center'});
  txt(fmtPlate(v.plaque),M+40,y+9,{s:20,b:1,c:[17,17,17],a:'center'});
  txt((TYPES[v.type]||{l:''}).l.toUpperCase(),W-M,y+4,{s:11,b:1,c:acc,a:'right'});
  txt('Entrée validée le '+(v.entreeAt?fmtDT(v.entreeAt):'(non validée)'),W-M,y+10,{s:9,c:mut,a:'right'});
  y+=24;
  var cw=(W-2*M)/3;
  kv('Marque / modèle',[v.marque,v.modele].filter(Boolean).join(' '),M,cw-3);kv('Couleur',v.couleur,M+cw,cw-3);kv('Kilométrage',v.km?v.km+' km':'',M+2*cw,cw-3);y+=12;
  kv('Carburant',v.fuel,M,cw-3);kv('Clés remises',v.cles,M+cw,cw-3);kv('Sortie prévue',v.sortiePrevue?fmtD(v.sortiePrevue):'',M+2*cw,cw-3);y+=12;
  kv('Réceptionné par',v.recep,M,cw-3);kv('Responsable du véhicule',v.resp,M+cw,cw-3);kv('Rattaché à',v.rattache,M+2*cw,cw-3);y+=12;
  kv('Client',v.clientNom,M,cw-3);kv('Téléphone',v.clientTel,M+cw,cw-3);kv('E-mail',v.clientMail,M+2*cw,cw-3);y+=12;
  para('Ce qui doit être fait',v.ops);para('Ce qui a été dit au client',v.dit);
  if(v.dateLimite){ens(16);h2('Engagement client');y+=txt('Date maximum promise : '+limTxt(v)+'.   Engagement validé par : '+(v.engageValide||'non renseigné'),M,y,{s:10,b:1,w:W-2*M})+5}
  para('À ne pas faire',v.exclu);para('Objets laissés à bord',v.objets);

  doc.addPage();band('DOMMAGES ET CONTRÔLE',fmtPlate(v.plaque));
  var marks=v.marks||[];
  pdfCar(doc,'top',M,y,0.2,marks);pdfCar(doc,'left',M+48,y,0.2,marks);pdfCar(doc,'right',M+48+86,y,0.2,marks);
  y+=0.2*400+4;
  txt('Vue de dessus · côté gauche · côté droit',M,y,{s:7,c:mut});y+=6;
  h2('Dommages relevés');
  if(!marks.length){txt('Aucun dommage marqué sur le schéma.',M,y,{s:10});y+=7}
  marks.forEach(function(m,i){ens(7);var d=DMG.filter(function(x){return x[0]===m.t})[0]||DMG[5];txt((i+1)+'.  '+d[1]+(m.n?' : '+m.n:'')+'  ('+VIEWS[m.v].lab.toLowerCase()+')',M,y,{s:10,w:W-2*M});y+=6});
  y+=3;h2('Contrôle point par point');
  CHECK.forEach(function(c){var s=(v.chk&&v.chk[c.k])||{};ens(7);
    txt(c.l,M,y,{s:9.5,w:110});
    var lab=s.s==='ras'?'RAS':s.s==='def'?'DEFAUT':s.s==='na'?'N/A':'non relevé';
    txt(lab,M+115,y,{s:9.5,b:1,c:s.s==='def'?bad:ink});
    if(s.s==='def'&&s.n){txt(s.n,M+135,y,{s:9,w:W-M-135-M,c:bad})}
    y+=6.2});

  var sigs=function(lab,s,x){txt(lab.toUpperCase(),x,y,{s:7,c:mut});
    if(s){try{doc.addImage(s.img,'JPEG',x,y+2,60,20)}catch(e){try{doc.addImage(s.img,'PNG',x,y+2,60,20)}catch(e2){}}doc.setDrawColor(150,160,160);doc.rect(x,y+2,60,20);txt((s.nom||'')+' · '+fmtDT(s.ts),x,y+26,{s:8,c:mut,w:80})}
    else txt(v.clientAbsent&&lab.indexOf('lient')>-1?'Client absent à l\'arrivée':'Non signé',x,y+10,{s:9,c:mut})};
  ens(46);y+=4;h2("Signatures à l'entrée");sigs('Réceptionnaire',v.sigRecep,M);sigs('Client',v.sigClient,M+95);y+=34;
  txt("Les mentions ci-dessus ont été relevées à l'arrivée du véhicule et validées par signature.",M,y,{s:8,c:mut,w:W-2*M});

  async function photoPages(list,title){
    if(!list.length)return;
    doc.addPage();band(title,fmtPlate(v.plaque));
    var bw=(W-2*M-8)/2,bh=bw*0.75,col=0,row=0;
    for(var i=0;i<list.length;i++){
      var p=list[i];
      if(row===3){doc.addPage();band(title,fmtPlate(v.plaque));row=0;col=0}
      var x=M+col*(bw+8),yy=30+row*(bh+14);
      txt((p.label||'Photo'),x,yy,{s:9,b:1,w:bw});
      var im=await pdfImg(p);
      if(im){var r=Math.min(bw/im.w,bh/im.h),w=im.w*r,h=im.h*r;doc.addImage(im.d,'JPEG',x,yy+2,w,h)}
      else{doc.setDrawColor(200,208,205);doc.rect(x,yy+2,bw,bh);txt('Photo indisponible',x+4,yy+10,{s:9,c:mut})}
      txt(fmtDT(p.ts)+(p.by?' · '+p.by:''),x,yy+bh+6,{s:7.5,c:mut,w:bw});
      col++;if(col===2){col=0;row++}
    }
  }
  await photoPages(es,"PHOTOS D'ENTRÉE");

  async function pdfPages(p){
    var title='ANALYSE NEXDIAG';
    try{
      if(!window.pdfjsLib)throw new Error('pdfjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc=WORKER;
      var buf=await (await fetch(srcOf(p))).arrayBuffer();
      var pd=await pdfjsLib.getDocument({data:buf}).promise;
      var n=Math.min(pd.numPages,12);
      for(var i=1;i<=n;i++){
        var pg=await pd.getPage(i),vp=pg.getViewport({scale:1.6}),c=document.createElement('canvas');
        c.width=Math.round(vp.width);c.height=Math.round(vp.height);
        var cx=c.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,c.width,c.height);
        await pg.render({canvasContext:cx,viewport:vp}).promise;
        doc.addPage();band(title,fmtPlate(v.plaque));
        txt(p.label+'  ·  page '+i+' / '+pd.numPages,M,y,{s:8,c:mut});y+=4;
        var bw=W-2*M,bh=282-y,r=Math.min(bw/c.width,bh/c.height);
        doc.addImage(c.toDataURL('image/jpeg',.8),'JPEG',M,y,c.width*r,c.height*r);
      }
    }catch(e){
      doc.addPage();band(title,fmtPlate(v.plaque));
      txt('Le PDF joint « '+p.label+' » n\'a pas pu être intégré à ce document. Il reste disponible dans le dossier, onglet Mesures.',M,y,{s:10,w:W-2*M});
    }
  }
  var mes=v.mes||{},mrows=PANELS.filter(function(q){return mes[q[0]]});
  var mph=photos.filter(function(p){return p.phase==='mesures'&&p.kind!=='pdf'}).sort(function(a,b){return a.ts-b.ts});
  var mpd=photos.filter(function(p){return p.phase==='mesures'&&p.kind==='pdf'}).sort(function(a,b){return a.ts-b.ts});
  if(mode==='full'&&(mrows.length||v.mesNotes||mph.length||mpd.length)){
    doc.addPage();band("MESURES D'ÉPAISSEUR",fmtPlate(v.plaque));
    if(mrows.length){
      h2('Épaisseurs relevées (microns)');var c3=(W-2*M)/3;
      mrows.forEach(function(q,i){if(i>0&&i%3===0)y+=11;kv(q[1],mes[q[0]]+' µm',M+(i%3)*c3,c3-3)});y+=14;
    }
    para('Notes d\'analyse',v.mesNotes);
    if(!mrows.length&&!v.mesNotes){txt(mpd.length?'Analyse de l\'appareil jointe aux pages suivantes.':'Photos de mesure aux pages suivantes.',M,y,{s:10})}
    await photoPages(mph,'PHOTOS DE MESURE');
    for(var qi=0;qi<mpd.length;qi++)await pdfPages(mpd[qi]);
  }

  var cl=(S.cm[v.id]||[]).slice().sort(function(a,b){return a.ts-b.ts});
  if(mode==='full'&&cl.length){
    doc.addPage();band('COMPLÉMENTS AU DOSSIER',fmtPlate(v.plaque));
    for(var ci=0;ci<cl.length;ci++){
      var cc=cl[ci],cp=photos.filter(function(p){return p.phase==='compl'&&p.cid===cc.id}).sort(function(a,b){return a.ts-b.ts});
      ens(40);h2(fmtDT(cc.ts)+' · '+ckLabel(cc.kind)+' · par '+cc.by);
      if(cc.text){var th=txt(cc.text,M,y,{s:10,w:W-2*M});y+=th+4}
      var tw=(W-2*M-8)/3,th2=tw*0.75;
      for(var pi=0;pi<cp.length;pi++){
        var col=pi%3;if(col===0)ens(th2+12);
        var im=await pdfImg(cp[pi]),px=M+col*(tw+4);
        if(im){var rr=Math.min(tw/im.w,th2/im.h);doc.addImage(im.d,'JPEG',px,y,im.w*rr,im.h*rr)}
        txt(cp[pi].label||'',px,y+th2+4,{s:7,c:mut,w:tw});
        if(col===2||pi===cp.length-1)y+=th2+10;
      }
      y+=4;
    }
  }
  if(mode==='full'&&(v.statut==='sorti'||xs.length)){
    doc.addPage();band('FICHE DE SORTIE',fmtPlate(v.plaque));
    var w3=(W-2*M)/3;
    kv('Date et heure de sortie',v.sortieAt?fmtDT(v.sortieAt):'(non validée)',M,w3-3);kv('Véhicule rendu par',v.remisPar,M+w3,w3-3);kv('Récupéré par (nom)',v.remisA,M+2*w3,w3-3);y+=14;
    para('À réaliser (rappel de la fiche d\'entrée)',v.ops);
    h2('Confirmation');txt(v.opsFaites?'Tout ce qui figure dans la fiche a été fait ou signalé.':'Confirmation non cochée.',M,y,{s:10});y+=8;
    para('Notes de sortie',v.notesSortie);
    ens(40);h2('Signature à la remise');sigs('Personne qui récupère',v.sigSortie,M);y+=32;
    await photoPages(xs,'PHOTOS DE SORTIE');
  }
  var hs=v.hist||[];
  if(mode==='full'&&hs.length){doc.addPage();band('HISTORIQUE DU DOSSIER',fmtPlate(v.plaque));hs.forEach(function(h){ens(10);var hh=txt(fmtDT(h.ts)+'  ·  '+(h.by||'')+'  ·  '+h.a,M,y,{s:9,w:W-2*M});y+=Math.max(6,hh+2)})}
  var n=doc.getNumberOfPages();
  for(var i=1;i<=n;i++){doc.setPage(i);txt('Plaque '+fmtPlate(v.plaque)+' · Dossier '+v.id,M,290,{s:7.5,c:mut});txt('Page '+i+' / '+n+' · généré le '+fmtDT(Date.now()),W-M,290,{s:7.5,c:mut,a:'right'})}
  return doc.output('blob');
}
function pdfName(v,mode){return (mode==='entree'?'EDL-ENTREE_':'DOSSIER-COMPLET_')+normPlate(v.plaque)+'_'+(v.createdAt?new Date(v.createdAt).toLocaleDateString('sv-SE'):todayISO())+'.pdf'}
async function makePdf(mode,silent){
  mode=mode==='entree'?'entree':'full';
  var v=VV();if(!v||!S.cur)return null;
  if(!window.jspdf){toast('Le module PDF ne s’est pas chargé. Relancer l’application.');return null}
  await flush();
  if(!silent)toast('Génération du PDF…');
  try{
    var blob=await buildPdf(v,S.photos.slice(),mode);
    var bytes=new Uint8Array(await blob.arrayBuffer());
    var r=await api.archive({name:pdfName(v,mode),sub:mode==='entree'?'Entrees':'Dossiers',bytes:bytes});
    save({arch:(v.arch||[]).concat([{ts:Date.now(),mode:mode,rel:r.rel,sha:r.sha256}]),hist:hist(v,(mode==='entree'?'PDF d’entrée':'PDF complet')+' archivé en lecture seule : '+r.rel+' (empreinte '+r.sha256.slice(0,12)+')')});
    renderSheet(true);
    if(silent)toast((mode==='entree'?'PDF d’entrée':'PDF complet')+' archivé : '+r.rel);
    else{toast('PDF archivé en lecture seule : '+r.rel);api.openFile(r.path)}
    return r;
  }catch(e){toast('PDF non généré : '+(e&&(e.message||e.code)||'erreur'));return null}
}

/* ---------- actions ---------- */
function act(a,b){
  var d=b.dataset;
  if(a==='view'){S.view=d.v;$('#q').value='';renderMain();return}
  if(a==='new'){newEntry();return}
  if(a==='open'){openDossier(d.id);return}
  if(a==='close'){closeSheet();return}
  if(a==='tab'){flush();S.tab=d.v;renderSheet();return}
  if(a==='type'){var v=VV();v.type=d.v;if(S.cur)save({type:d.v});else autoCreate();renderSheet(true);return}
  if(a==='create'){createDossier();return}
  if(a==='tampon'){var vt=VV();vt.dateLimite=TAMPON;if(S.cur)save({dateLimite:TAMPON});renderSheet(true);toast('Voiture tampon : 01/01/2100');return}
  if(a==='status'){var v2=VV();save({statut:d.v,hist:hist(v2,'Statut : '+(COLS.filter(function(c){return c[0]===d.v})[0]||[0,d.v])[1])});renderSheet(true);return}
  if(a==='validate'){var v3=VV();if(!readiness(v3).every(function(x){return x.ok})){toast('Il reste des points à compléter');return}
    lockConfirm(null);return}
  if(a==='lockok'){modalHide();validateEntry();return}
  if(a==='lockcancel'){modalHide();if(d.f)undoSig(d.f);return}
  if(a==='next'){startQueue(d.phase,null);return}
  if(a==='shoot'){startQueue(d.phase,d.slot);return}
  if(a==='retake'){$('#lightbox').hidden=true;S.lb=null;startQueue(d.phase,d.slot);return}
  if(a==='extra'){if(!canShoot(d.phase))return;var inp=$('#xl-'+d.phase),lab=(inp&&inp.value.trim())||'Détail';if(inp)inp.value='';
    camOpen({free:true,phase:d.phase,title:d.phase==='mesures'?'Photos de mesure':'Photos de détail',defLabel:lab,caption:lab==='Détail'?'':lab,sink:commitPhoto});return}
  if(a==='extragal'){if(!canShoot(d.phase))return;var inp2=$('#xl-'+d.phase),lab2=inp2&&inp2.value.trim();if(inp2)inp2.value='';
    doImport(function(f,i){return {phase:d.phase,slot:'x'+Date.now()+'_'+i,label:lab2||f.name.replace(/\.[^.]+$/,'')||'Détail'}},commitPhoto).then(function(n){if(n)toast(n+' image(s) importée(s)')});return}
  if(a==='lbclose'){S.lb=null;$('#lightbox').hidden=true;return}
  if(a==='delphoto'){delPhoto(d.pid);return}
  if(a==='dmg'){S.dmg=d.v;renderSheet(true);return}
  if(a==='delmk'){var v4=VV(),m=(v4.marks||[]).slice();m.splice(+d.i,1);save({marks:m});renderSheet(true);return}
  if(a==='chk'){var v5=VV(),cur=(v5.chk&&v5.chk[d.k])||{},nv={s:d.s,n:d.s==='def'?(cur.n||''):''};
    v5.chk=Object.assign({},v5.chk||{});v5.chk[d.k]=nv;var w={chk:{}};w.chk[d.k]=nv;save({},w);renderSheet(true);return}
  if(a==='clearpad'){var cv=$('canvas.pad[data-pad="'+d.f+'"]');if(cv){var c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);cv.dataset.dirty=''}return}
  if(a==='resig'){var o={};o[d.f]=null;save(o);renderSheet(true);return}
  if(a==='savesig'){var cv2=$('canvas.pad[data-pad="'+d.f+'"]');if(!cv2||!cv2.dataset.dirty){toast('Signer d’abord dans le cadre');return}
    var nm=($('#sn-'+d.f)||{}).value||'';var img=cv2.toDataURL('image/png');
    var sg={img:img,nom:nm,ts:Date.now()},o2={};o2[d.f]=sg;save(o2);renderSheet(true);toast('Signature enregistrée');
    var vs=VV();if(S.cur&&vs.statut==='brouillon'&&readiness(vs).every(function(x){return x.ok}))lockConfirm(d.f);return}
  if(a==='validateexit'){var v7=VV();if(!exitReady(v7).every(function(x){return x.ok})){toast('Il reste des points à compléter');return}
    S.unlocked=null;S.snap=null;
    save({statut:'sorti',sortieAt:Date.now(),hist:hist(v7,'Sortie validée : véhicule rendu par '+(v7.remisPar||'—')+', récupéré par '+(v7.remisA||'—'),v7.remisPar||undefined)}).then(function(){toast('Sortie validée');return makePdf('full',true)});renderSheet();return}
  if(a==='pdf'){makePdf(d.mode,false);return}
  if(a==='addpdf'){handlePdf();return}
  if(a==='openpdf'){var pp=S.photos.filter(function(x){return x.id===d.pid})[0];if(pp){if(api.openPdf)api.openPdf(pp);else window.open(srcOf(pp))}return}
  if(a==='unlock'){unlock();return}
  if(a==='relock'){relock();return}
  if(a==='cdshoot'){getCd();camOpen({free:true,phase:'compl',title:'Photos du complément',defLabel:'Complément',sink:complSink});return}
  if(a==='cdimport'){getCd();doImport(function(f,i){return {phase:'compl',slot:'x'+i,label:f.name.replace(/\.[^.]+$/,'')||'Complément'}},complSink).then(function(n){if(n){renderSheet(true);toast(n+' image(s) ajoutée(s)')}});return}
  if(a==='cdclear'){if(S.cdraft)S.cdraft.pics=[];renderSheet(true);return}
  if(a==='cdsave'){cdSave();return}
  if(a==='camshot'){camShot();return}
  if(a==='camskip'){camSkip();return}
  if(a==='camclose'){camClose();return}
  if(a==='camswitch'){camSwitch();return}
  if(a==='camimport'){camImport();return}
  if(a==='settings'){openSettings();return}
  if(a==='closemodal'){SETPIN=null;modalHide();return}
  if(a==='openarch'){api.openArchive();return}
  if(a==='chooseArch'){api.chooseArchive(SETPIN).then(function(r){if(r&&r.ok)drawSettings();else toast('Opération refusée')});return}
  if(a==='changepin'){(async function(){var old=await askPin('Code PIN actuel','Pour le modifier');if(!old)return;var nw=await newPin(false);if(!nw)return;var r=await api.pinChange(old,nw);toast(r&&r.ok?'Code PIN modifié':(r&&r.error)||'Modification refusée')})();return}
}

document.addEventListener('click',function(e){
  var b=e.target.closest('[data-act]');
  if(!b){return}
  if(b.dataset.act==='view'&&(b.dataset.slot||b.dataset.pid)){
    S.lb=b.dataset.pid||(b.dataset.phase+'_'+b.dataset.slot);updateLightbox();return}
  act(b.dataset.act,b);
});
/* Brouillon : créé dès qu'on quitte un champ, ou quand l'app passe en arrière-plan. */
document.addEventListener('change',function(e){if(S.draft&&e.target&&e.target.dataset&&e.target.dataset.f)autoCreate()});
document.addEventListener('visibilitychange',function(){if(document.hidden){autoCreate();flush()}});
document.addEventListener('input',function(e){
  var t=e.target;
  if(t.id==='q'){S.q=t.value;renderMain();return}
  if(t.id==='cd-by'){getCd().by=t.value;return}
  if(t.id==='cd-text'){getCd().text=t.value;return}
  if(t.id==='cd-kind'){getCd().kind=t.value;return}
  if(t.dataset&&t.dataset.f){
    var v=VV();if(!v)return;var f=t.dataset.f,val=t.type==='checkbox'?t.checked:t.value;
    if(f==='plaque'){val=val.toUpperCase();if(t.value!==val)t.value=val}
    v[f]=val;
    if(S.cur){pend[f]=val;clearTimeout(tmr);tmr=setTimeout(function(){flush().then(refreshChrome)},500)}
    if(t.type==='checkbox'){if(S.cur){flush()}renderSheet(true)}
    else if(S.cur)setTimeout(refreshChrome,0);
    return;
  }
  if(t.dataset&&t.dataset.mk!=null){var v2=VV(),m=(v2.marks||[]).map(function(x){return Object.assign({},x)});var i=+t.dataset.mk;if(m[i]){m[i][t.dataset.mf]=t.value;v2.marks=m;pend.marks=m;clearTimeout(tmr);tmr=setTimeout(flush,500);if(t.tagName==='SELECT')renderSheet(true)}return}
  if(t.dataset&&t.dataset.mesk){var v4=VV();v4.mes=Object.assign({},v4.mes||{});v4.mes[t.dataset.mesk]=t.value;pend.mes=Object.assign({},pend.mes||{});pend.mes[t.dataset.mesk]=t.value;clearTimeout(tmr);tmr=setTimeout(flush,500);return}
  if(t.dataset&&t.dataset.ck){var v3=VV();v3.chk=Object.assign({},v3.chk||{});var c=Object.assign({},v3.chk[t.dataset.ck]||{s:'def'});c.n=t.value;v3.chk[t.dataset.ck]=c;pend.chk=Object.assign({},pend.chk||{});pend.chk[t.dataset.ck]=c;clearTimeout(tmr);tmr=setTimeout(flush,500);return}
});
document.addEventListener('click',function(e){
  var s=e.target.closest&&e.target.closest('svg[data-view]');if(!s)return;
  var v=VV();if(!v)return;
  if(isLocked(v,'entry')){toast('Dossier verrouillé : utiliser Compléments, ou le code PIN pour corriger');return}
  var r=s.getBoundingClientRect(),x=Math.round((e.clientX-r.left)/r.width*1000)/10,y=Math.round((e.clientY-r.top)/r.height*1000)/10;
  var m=(v.marks||[]).concat([{v:s.dataset.view,x:x,y:y,t:S.dmg,n:''}]);
  v.marks=m;if(S.cur)save({marks:m});renderSheet(true);
});

/* ---------- démarrage ---------- */
renderMain();
(async function(){
  try{
    var all=await api.loadAll();
    S.list=Object.keys(all.vehicules).map(function(id){var o=all.vehicules[id];o.id=id;return o});
    Object.keys(all.photos).forEach(function(id){S.pm[id]=Object.keys(all.photos[id]).map(function(pid){var o=all.photos[id][pid];o.id=pid;o.vid=id;return o})});
    Object.keys(all.compl).forEach(function(id){S.cm[id]=Object.keys(all.compl[id]).map(function(cid){var o=all.compl[id][cid];o.id=cid;return o})});
  }catch(e){S.dberr='Lecture des dossiers impossible : '+(e&&e.message||'erreur')}
  S.loaded=true;renderMain();
  setInterval(function(){var c=$('#clk');if(c)c.textContent=fmtDT(Date.now())},15000);
  try{var ps=await api.pinStatus();if(!ps.set){var p=await newPin(true);var r=await api.pinSet(p);toast(r&&r.ok?'Code PIN enregistré':(r&&r.error)||'Code PIN non enregistré')}}catch(e){}
})();
})();
