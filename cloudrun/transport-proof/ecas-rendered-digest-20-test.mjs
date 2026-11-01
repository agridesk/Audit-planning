import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
const escape=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sandbox={NB_clean_:x=>String(x??'').trim(),NB_mpsNumber_:x=>String(x.mpsNumber||''),NB_scopeBadgesHtml_:a=>a.map(escape).join(', '),NB_scopeDisplayList_:a=>a,NB_html_:escape,NB_getTz_:()=> 'Europe/Amsterdam',SpreadsheetApp:{getActiveSpreadsheet:()=>({})},Utilities:{formatDate:()=> '01-11-2026 10:00'},Date,String,Array,Number,JSON};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const base={auditId:'A',company:'Farm',mpsNumber:'913518',auditorName:'Auditor',scopes:['ABC'],plannedHours:8,blocks:[{date:'2026-11-05',start:'08:00',end:'16:00'}]};
for(const [event,status,reason] of [['ECAS_AUDIT_CANCELLED_DIGEST','Geannuleerd','Cancelled by client'],['ECAS_AUDIT_REJECTED_DIGEST','Afgewezen','Rejected by manager']]){
 const out=sandbox.NB_renderExternalOperationalDigest_('ecas@example.invalid',[{...base,eventType:event,ecasComment:reason}]);
 assert.ok(out.body.includes(status),event+' status');assert.ok(out.body.includes(reason),event+' reason');
 assert.ok(out.htmlBody.includes(status),event+' HTML status');assert.ok(out.htmlBody.includes(reason),event+' HTML reason');
 assert.ok(out.htmlBody.includes('Reden'),event+' final reason header');
}
assert.throws(()=>sandbox.NB_renderExternalOperationalDigest_('ecas@example.invalid',[{...base,eventType:'ECAS_AUDIT_REJECTED_DIGEST',ecasComment:''}]),/partial digest/);
console.log('ECAS Cancel/Reject rendered HTML and text reason column OK');
