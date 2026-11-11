/** Issue #87: authenticated same-origin Cloud Run Manager editor. */
export function managerVisitCompositionPage20(){
return \`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AMS — Separate Visits</title>
<style>body{font:14px system-ui;margin:20px auto;max-width:900px;padding:0 12px;background:#f4f6f9;color:#172033}section{background:#fff;padding:14px;margin:12px 0;border:1px solid #dbe3ee;border-radius:8px}h1{font-size:21px}h2{font-size:16px}.grid{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}.grid label{display:block;font-size:12px}.block{padding:8px;background:#f8fafc;margin:7px 0}input,select,button{padding:7px;font:inherit;border:1px solid #94a3b8;border-radius:4px}button{cursor:pointer}button:disabled{opacity:.45}.warn{color:#991b1b}.success{color:#166534}small{color:#64748b}</style></head><body>
<h1>Model C — Separately planning</h1><small>DEV · one Visit per obligation · atomic Firestore transaction</small><section id="state">Loading canonical source…</section><div id="form" hidden><section id="scopes"></section><section><button id="save" disabled>Commit all separate Visits</button><p id="result" role="status">No changes have been made.</p></section></div>
<script>(function(){'use strict';
var q=new URLSearchParams(location.search),id=q.get('auditId')||'',source=null,roster=[],enabled=false;
var el=x=>document.getElementById(x),esc=x=>{var d=document.createElement('div');d.textContent=String(x==null?'':x);return d.innerHTML;};
function fail(x){el('state').textContent=String(x);el('state').className='warn';}
async function get(path){var r=await fetch(path,{credentials:'same-origin',cache:'no-store'}),j=await r.json().catch(()=>null);if(!r.ok||!j)throw Error(j&&j.error||'Authenticated read failed');return j;}
function block(){
 var n=document.createElement('div');n.className='block';
 n.innerHTML='<div class="grid"><div><label>Date</label><input class="date" type="date"></div><div><label>Start</label><input class="start" type="time" step="900" value="08:00"></div><div><label>End</label><input class="end" type="time" step="900" value="12:00"></div><div><label>Location</label><input class="location" value="HQ"></div><button type="button" class="remove">Remove</button></div>';
 n.querySelector('.remove').onclick=()=>n.remove();return n;
}
function render(){
 el('state').textContent='Audit '+source.auditId+' · '+source.scopes.length+' obligations · '+source.totalFormalHours+' formal hours';
 el('form').hidden=false;var parent=el('scopes');parent.replaceChildren();
 source.scopes.forEach(function(o){
  var section=document.createElement('section');section.className='scope';section.dataset.obligationId=o.obligationId;
  section.innerHTML='<h2>'+esc(o.scopeName||o.scopeCode)+' — '+esc(o.requiredHours)+' hours</h2><small>Planning window '+esc(o.windowFrom||'?')+' – '+esc(o.windowTo||'?')+' · expiry '+esc(o.effectiveExpiry||'?')+'</small><p><label>Auditor</label><select class="auditor"><option value="">Choose auditor</option>'+roster.map(x=>'<option value="'+esc(x.email)+'">'+esc(x.name)+' ('+esc(x.email)+')</option>').join('')+'</select></p><div class="blocks"></div><button class="add" type="button">+ Time block</button>';
  var blocks=section.querySelector('.blocks');blocks.appendChild(block());
  section.querySelector('.add').onclick=()=>blocks.appendChild(block());
  parent.appendChild(section);
 });
 el('save').disabled=!enabled;
 if(!enabled)el('result').textContent='DEV atomic write is disabled; review only.';
}
function payload(){
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
  var body=payload();if(!confirm('Commit '+body.visits.length+' Visits atomically?'))return;
  el('save').disabled=true;el('result').textContent='Validating authoritative source and writing…';
  var r=await fetch('/api/v1/planning/visit-composition-atomic',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  var j=await r.json().catch(()=>null);if(!r.ok||j?.success!==true)throw Error(j?.error||'Atomic commit failed: '+r.status);
  el('result').className='success';el('result').textContent='Verified: '+(j.auditIds||[]).join(', ');
 }catch(e){el('result').className='warn';el('result').textContent=e.message||String(e);el('save').disabled=!enabled;}
};
(async()=>{
 try{
  if(!id||id.length>180)throw Error('Audit ID required.');
  var result=await Promise.all([get('/api/v1/manager/model-c-visit-preview?auditId='+encodeURIComponent(id)),get('/api/v1/planning/visit-composition-editor-context')]);
  source=result[0];roster=result[1].auditors||[];enabled=result[1].writeEnabled===true;
  source.scopes=(source.obligations||[]).map(x=>({obligationId:x.obligationId,scopeCode:x.scopeCode,scopeName:x.scopeCode,requiredHours:Number(x.requiredHours),windowFrom:x.windowFrom,windowTo:x.windowTo,effectiveExpiry:x.effectiveExpiry}));
  if(!source.sourceEvidenceReady||!source.scopes.length||source.scopes.length<2||!source.sourceRevisionAtomic||source.source?.status!=='Pending Planning')throw Error('Canonical source or formal hours not ready.');
  render();
 }catch(e){fail(e.message||String(e));}
})();
})();</script></body></html>\`;
}
