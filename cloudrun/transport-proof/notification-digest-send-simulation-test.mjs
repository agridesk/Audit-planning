import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const start=source.indexOf('function ns_sendDueReserved_('),end=source.indexOf('function ns_resetStaleReserved_(',start);
assert.ok(start>=0&&end>start,'Sender function boundary');
const sent=[];
const now=Date.now();
const cfg={sendEmail:true,consolidate:true,bufferMinutes:2,digestGroup:'AUDITOR_OPERATIONAL'};
const reservation=(audit,group,due)=>JSON.stringify({payload:{config:cfg},windowKey:group,groupKey:group,windowDueAtMs:due,rollingExternal:false});
const row=(id,recipient,group,due)=>[new Date(now-180000),'RESERVED','AUDIT_PLANNED_BY_MANAGER',recipient,id,'Company '+id,'Subject','Body',0,'','','',reservation(id,group,due)];
const rows=[['TimestampCreated','Status','Event','Recipient','Audit ID'],row('AUD_ONE','info@agridesk.com','info@agridesk.com|AUDITOR_OPERATIONAL|first',now-1000),row('AUD_TWO','info@agridesk.com','info@agridesk.com|AUDITOR_OPERATIONAL|first',now-1000),row('AUD_THREE','isalia@agriqa.es','isalia@agriqa.es|AUDITOR_OPERATIONAL|first',now-1000),row('AUD_FUTURE','info@agridesk.com','info@agridesk.com|AUDITOR_OPERATIONAL|future',now+60000)];
const ctx={
Date,JSON,String,Number,Object,Math,Array,
NS_DEFAULT_FROM_NAME:'AMS',NS_DEFAULT_FROM_EMAIL:'planning@agriqa.es',
ns_parseReserved_:v=>JSON.parse(v),ns_toMs_:v=>new Date(v).getTime(),
ns_normalizeBody_:v=>String(v??''),
ns_currentEmailPermissions_:()=>({AUDIT_PLANNED_BY_MANAGER:true}),
ns_buildDigestEmail_:(to,items)=>({subject:'Digest '+items.length,body:items.map(x=>x.auditId).join(','),htmlBody:'',fromName:'AMS'}),
ns_resolveNotificationDelivery_:to=>({mode:'DRY_RUN',send:false,recipient:'',originalRecipients:[to],overridden:false}),
NotificationDeliveryGuard_assertDeliveryAllowed:()=>{},
NS_sendEmailWithConfiguredIdentity_:(...args)=>sent.push(args),
ns_timestamp_:()=>new Date(now).toISOString(),
ns_escapeHtml_:v=>v
};
vm.runInNewContext(source.slice(start,end),ctx);
const sheet={getRange:(r,c)=>({getValue:()=>rows[r-1][c-1],setValue:v=>{rows[r-1][c-1]=v;}})};
const result=ctx.ns_sendDueReserved_(sheet,rows);
assert.equal(result.sentGroups,2,'One digest per original auditor');
assert.equal(result.sentRows,3,'Two audits combined for Paco, one for Isalia');
assert.equal(result.failedGroups,0);
assert.equal(sent.length,0,'Simulation never sends actual email');
assert.equal(rows[4][1],'RESERVED','Undue notification remains queued');
for(const index of [1,2,3])assert.equal(rows[index][1],'SENT_SIMULATED');
console.log('notification-digest-send-simulation: PASS');
