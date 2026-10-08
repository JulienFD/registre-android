import { tabCompl } from './compl.js';
import { CAM, CHECK, COLS, DMG, PANELS, SLOTS, SORTIE_REQ, TYPES, VIEWS } from './constants.js';
import { $, S, V, VV, esc, fmtD, fmtDT, isLocked, limTxt, plateHtml, srcOf, todayISO } from './core.js';
import { entrySet, exitSet } from './photos.js';

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
export function readiness(v){
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
export function exitReady(v){var es=exitSet(),n=SLOTS.filter(function(s,i){return i<SORTIE_REQ&&es[s.k]}).length;
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
export function renderSheet(keepScroll){
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
export function refreshChrome(){
  var v=VV();if(!v||$('#sheet').hidden)return;
  var sh=$('#sheet');
  var cur=sh.querySelector('.gate');
  var html=gate(v);
  if(cur){var d=document.createElement('div');d.innerHTML=html;if(d.firstChild)cur.replaceWith(d.firstChild);else cur.remove()}
  else if(html){sh.insertAdjacentHTML('beforeend',html)}
}
export function refreshPhotos(){
  ['entree','sortie'].forEach(function(ph){var el=$('#pg-'+ph);if(el){var inp=$('#xl-'+ph),val=inp?inp.value:'';el.innerHTML=photoGrid(ph);var i2=$('#xl-'+ph);if(i2)i2.value=val}});
  var em=$('#pg-mes');if(em){var xi=$('#xl-mesures'),xv=xi?xi.value:'';em.innerHTML=mesBody();var x2=$('#xl-mesures');if(x2)x2.value=xv}
  refreshChrome();
}

/* ---------- visionneuse ---------- */
function findPhoto(){
  if(!S.lb)return null;
  return S.photos.filter(function(x){return x.id===S.lb})[0]||null;
}
export function updateLightbox(){
  var lb=$('#lightbox'),p=findPhoto();
  if(!p){lb.hidden=true;S.lb=null;return}
  var fixed=SLOTS.some(function(x){return x.k===p.slot});
  lb.innerHTML='<img alt="'+esc(p.label)+'" src="'+esc(srcOf(p))+'"><div class="bar"><span>'+esc(p.label||'')+' · '+esc(fmtDT(p.ts))+(p.by?' · '+esc(p.by):'')+'</span>'+
    (fixed&&(p.phase==='entree'||p.phase==='sortie')&&S.cur&&V(S.cur)&&!isLocked(V(S.cur),p.phase==='sortie'?'exit':'entry')?'<button class="btn sm" data-act="retake" data-phase="'+esc(p.phase)+'" data-slot="'+esc(p.slot)+'" data-label="'+esc(p.label)+'">Reprendre</button>':'')+
    (!fixed&&p.phase!=='compl'?'<button class="btn sm bad" data-act="delphoto" data-pid="'+esc(p.id)+'">Supprimer</button>':'')+
    '<button class="btn sm" data-act="lbclose">Fermer</button></div>';
  lb.hidden=false;
}

