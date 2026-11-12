/** Issue #87: authenticated same-origin Cloud Run Manager editor. */
export function managerVisitCompositionPage20(){
return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AMS — Visit Composition</title>
<style>body{font:14px system-ui;margin:20px auto;max-width:900px;padding:0 12px;background:#f4f6f9;color:#172033}section{background:#fff;padding:14px;margin:12px 0;border:1px solid #dbe3ee;border-radius:8px}h1{font-size:21px}h2{font-size:16px}.grid{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.grid label{display:block;font-size:12px}.block{padding:8px;background:#f8fafc;margin:7px 0}input,select,button{padding:7px;font:inherit;border:1px solid #94a3b8;border-radius:4px}button{cursor:pointer}button:disabled{opacity:.45}.warn{color:#991b1b}.success{color:#166534}small{color:#64748b}</style></head><body>
<h1>Model C — Together / Separately</h1><small>DEV · authoritative atomic planning</small><section id="state">Loading canonical source…</section><div id="form" hidden><section><label><input id="modeTogether" type="radio" name="mode" value="TOGETHER"> Together — shared Visit with explicit scope allocation</label><label><input id="modeSeparate" type="radio" name="mode" value="SEPARATELY"> Separately — one Visit per scope</label></section><section id="scopes"></section><section><button id="save" disabled>Commit planning atomically</button><p id="result" role="status">No changes have been made.</p></section></div>
<script>(function(){'use strict';
var q=new URLSearchParams(location.search),id=q.get('auditId')||'',mode=q.get('mode')==='TOGETHER'?'TOGETHER':'SEPARATELY',source=null,roster=[],enabled=false;
var el=x=>document.getElementById(x),esc=x=>{var d=document.createElement('div');d.textContent=String(x==null?'':x);return d.innerHTML;};
function fail(x){el('state').textContent=String(x);el('state').className='warn';}
function dateLabel(x){return x?String(x):'Not recorded in Model C';}
function usableIsoDate(x){
 var value=String(x||'').trim();
 if(!value)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 var m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
 if(!m)return '';
 var iso=m[3]+'-'+m[2]+'-'+m[1];
 var d=new Date(iso+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:'';
}
async function get(path){var r=await fetch(path,{credentials:'same-origin',cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||!j)throw Error(j&&j.error||'Authenticated read failed');return j;}
function block(together){
 var n=document.createElement('div');n.className='block';
 n.innerHTML='<div class="grid"><div><label>Date</label><input class="date" type="date"></div><div><label>Start</label><input class="start" type="time" step="900" min="08:00" max="18:00" value="08:00"></div><div><label>End</label><input class="end" type="time" step="900" min="08:00" max="18:00" value="12:00"></div><div><label>Location</label><input class="location" value="HQ"></div><button type="button" class="remove">Remove</button></div>';
 if(together){
  var allocation=document.createElement('div');allocation.className='grid allocations';
  source.scopes.forEach(function(scope){
   var field=document.createElement('div');field.dataset.obligationId=scope.obligationId;
   field.innerHTML='<label>'+esc(scope.scopeName||scope.scopeCode)+' minutes</label><input class="minutes" type="number" step="15" min="0" value="0">';
   allocation.appendChild(field);
  });n.appendChild(allocation);
 }
 n.querySelector('.remove').onclick=()=>n.remove();return n;
}
function render(){
 var totalMinutes=source.scopes.reduce((sum,scope)=>sum+Math.round(Number(scope.requiredHours)*60),0);
 el('state').textContent='Audit '+source.auditId+' · '+source.scopes.length+' obligations · '+(totalMinutes/60)+' formal hours';
 el('form').hidden=false;var parent=el('scopes');parent.replaceChildren();
 el('modeTogether').checked=mode==='TOGETHER';el('modeSeparate').checked=mode==='SEPARATELY';
 if(mode==='TOGETHER'){
  var section=document.createElement('section');section.className='together';
  section.innerHTML='<h2>One Visit · all scopes</h2><p>All scope windows must be respected. Allocate each time block by obligation in minutes.</p><label>Assigned auditor</label><select class="auditor"><option value="">Choose auditor</option>'+roster.map(x=>'<option value="'+esc(x.email)+'">'+esc(x.name)+' ('+esc(x.email)+')</option>').join('')+'</select><div class="blocks"></div><button class="add" type="button">+ Time block</button>';
  var blocks=section.querySelector('.blocks');blocks.appendChild(block(true));
  section.querySelector('.add').onclick=()=>blocks.appendChild(block(true));
  parent.appendChild(section);
 }else source.scopes.forEach(function(o){
  var section=document.createElement('section');section.className='scope';section.dataset.obligationId=o.obligationId;
  section.innerHTML='<h2>'+esc(o.scopeName||o.scopeCode)+' — '+esc(o.requiredHours)+' hours</h2><small>Planning window '+esc(dateLabel(o.windowFrom))+' – '+esc(dateLabel(o.windowTo))+' · expiry '+esc(dateLabel(o.effectiveExpiry))+'</small><p><label>Auditor</label><select class="auditor"><option value="">Choose auditor</option>'+roster.map(x=>'<option value="'+esc(x.email)+'">'+esc(x.name)+' ('+esc(x.email)+')</option>').join('')+'</select></p><div class="blocks"></div><button class="add" type="button">+ Time block</button>';
  var blocks=section.querySelector('.blocks');blocks.appendChild(block(false));
  section.querySelectorAll('.date').forEach(function(input){
    var from=usableIsoDate(o.windowFrom),to=usableIsoDate(o.windowTo);
    if(from)input.min=from;if(to)input.max=to;
  });
  section.querySelector('.add').onclick=()=>blocks.appendChild(block(false));
  parent.appendChild(section);
 });
 el('save').disabled=!enabled;
 if(!enabled)el('result').textContent='Atomic writer is not available on this DEV revision; review only.';
}
function payload(){
 if(mode==='TOGETHER'){
  var section=document.querySelector('.together'),email=section.querySelector('.auditor').value;
  if(!email)throw Error('Select one qualified auditor.');
  var rows=Array.from(section.querySelectorAll('.block')),allocations=[],blocks=[];
  if(!rows.length)throw Error('At least one time block is required.');
  rows.forEach(function(node){
   var b={date:node.querySelector('.date').value,start:node.querySelector('.start').value,
    end:node.querySelector('.end').value,execLoc:node.querySelector('.location').value,
    executionType:'ONSITE'};
   if(!b.date||!b.start||!b.end||!b.execLoc)throw Error('Complete each time block.');
   var [sh,sm]=b.start.split(':').map(Number),[eh,em]=b.end.split(':').map(Number),
    duration=(eh*60+em)-(sh*60+sm);
   if(!(duration>0)||duration%15)throw Error('Invalid 15-minute time block.');
   var blockId=b.date+'|'+b.start+'|'+b.end,sum=0;
   node.querySelectorAll('.allocations>div').forEach(function(field){
    var n=Number(field.querySelector('.minutes').value);
    if(!Number.isSafeInteger(n)||n<0||n%15)throw Error('Allocation must be nonnegative 15-minute units.');
    if(n){allocations.push({blockId,obligationId:field.dataset.obligationId,minutes:n});sum+=n;}
   });
   if(sum!==duration)throw Error('Each block must be fully allocated: '+blockId);
   blocks.push(b);
  });
  for(const scope of source.scopes){
   var total=allocations.filter(a=>a.obligationId===scope.obligationId).reduce((n,a)=>n+a.minutes,0);
   if(total!==Math.round(Number(scope.requiredHours)*60))
    throw Error(scope.scopeCode+': expected '+scope.requiredHours+' hours, allocated '+total/60);
  }
  var auditor=roster.find(x=>x.email===email);
  return {auditId:id,composition:'TOGETHER',sourceRevision:source.sourceRevisionAtomic,
   auditorEmail:email,auditorName:auditor?.name||email,blocks,scopeAllocations:allocations};
 }
 var visits=Array.from(document.querySelectorAll('.scope')).map(function(n){
  var o=source.scopes.find(x=>x.obligationId===n.dataset.obligationId),email=n.querySelector('.auditor').value;
  var blocks=Array.from(n.querySelectorAll('.block')).map(x=>({date:x.querySelector('.date').value,start:x.querySelector('.start').value,end:x.querySelector('.end').value,execLoc:x.querySelector('.location').value,executionType:'ONSITE'}));
  if(!email||!blocks.length||blocks.some(b=>!b.date||!b.start||!b.end||!b.execLoc))throw Error('Complete every date, auditor and time block.');
  var minutes=blocks.reduce((n,b)=>{var a=b.start.split(':').map(Number),z=b.end.split(':').map(Number);return n+z[0]*60+z[1]-a[0]*60-a[1];},0);
  if(minutes!==Math.round(Number(o.requiredHours)*60))throw Error(o.scopeCode+': planned hours must match '+o.requiredHours);
  return {obligationId:o.obligationId,auditorEmail:email,blocks};
 });
 return {auditId:id,composition:'SEPARATELY',sourceRevision:source.sourceRevisionAtomic,visits};
}
el('save').onclick=async function(){
 try{
  var body=payload();if(!confirm(mode==='TOGETHER'?'Commit one combined Visit with verified scope hours?':'Commit '+body.visits.length+' separate Visits atomically?'))return;
  el('save').disabled=true;el('result').textContent='Validating authoritative source and writing…';
  var route=mode==='TOGETHER'?'/api/v1/planning/direct-commit':'/api/v1/planning/visit-composition-atomic';
  var r=await fetch(route,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  var j=await r.json().catch(()=>null);if(!r.ok||j?.success!==true)throw Error(j?.error||'Atomic commit failed: '+r.status);
  el('result').className='success';el('result').textContent='Verified: '+(j.auditIds||[j.auditId||id]).join(', ');
 }catch(e){el('result').className='warn';el('result').textContent=e.message||String(e);el('save').disabled=!enabled;}
};
(async()=>{
 try{
  if(!id||id.length>180)throw Error('Audit ID required.');
  var result=await Promise.all([get('/api/v1/manager/model-c-visit-preview?auditId='+encodeURIComponent(id)),get('/api/v1/planning/visit-composition-editor-context')]);
  source=result[0];roster=result[1].auditors||[];enabled=result[1].writeEnabled===true;
  source.scopes=(source.obligations||[]).map(x=>({obligationId:x.obligationId,scopeCode:x.scopeCode,scopeName:x.scopeCode,requiredHours:Number(x.requiredHours),windowFrom:x.windowFrom,windowTo:x.windowTo,effectiveExpiry:x.effectiveExpiry}));
  if(source.scopes.some(x=>!x.obligationId||!x.scopeCode||!Number.isFinite(x.requiredHours)||x.requiredHours<=0))throw Error('Canonical obligation identity or required hours are incomplete.');
  if(!source.sourceEvidenceReady||!source.scopes.length||source.scopes.length<2||!source.sourceRevisionAtomic||source.source?.status!=='Pending Planning')throw Error('Canonical source or formal hours not ready.');
  el('modeTogether').addEventListener('change',function(){mode='TOGETHER';render()});
  el('modeSeparate').addEventListener('change',function(){mode='SEPARATELY';render()});
  render();
 }catch(e){fail(e.message||String(e));}
})();
})();</script></body></html>`;
}
