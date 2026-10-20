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

// A manager cancellation keeps each original recipient isolated even in DEV redirection.
const cancelRecipientGroups=[];
const cancellationRows=[
 ['TimestampCreated','Status','Event','Recipient','Audit ID'],
 ['auditor.one@example.org','AUDITOR_1'],
 ['auditor.two@example.org','AUDITOR_2']
].slice(1).map((entry,i)=>[
 new Date(now-180000),'RESERVED','AUDIT_CANCELLED_BY_MANAGER',entry[0],entry[1],
 'Test company','Cancellation','Body',0,'','','',
 JSON.stringify({payload:{config:{sendEmail:true,consolidate:true,bufferMinutes:10,digestGroup:'LIFECYCLE_AUDITOR'}},windowKey:'cancel-window',groupKey:entry[0]+'|LIFECYCLE_AUDITOR|cancel-window',windowDueAtMs:now-1000})
]);
cancellationRows.unshift(['TimestampCreated','Status','Event','Recipient','Audit ID']);
const cancelCtx={...ctx,
 ns_currentEmailPermissions_:()=>({AUDIT_CANCELLED_BY_MANAGER:true}),
 ns_buildDigestEmail_:(to,items)=>{cancelRecipientGroups.push([to,items.length]);return{subject:'Cancellation',body:'Body',htmlBody:'',fromName:'AMS'};},
 ns_resolveNotificationDelivery_:to=>({mode:'DRY_RUN',send:false,recipient:'',originalRecipients:[to],overridden:false})
};
vm.runInNewContext(source.slice(start,end),cancelCtx);
const cancelSheet={getRange:(r,c)=>({getValue:()=>cancellationRows[r-1][c-1],setValue:v=>{cancellationRows[r-1][c-1]=v;}})};
const cancelResult=cancelCtx.ns_sendDueReserved_(cancelSheet,cancellationRows);
assert.equal(cancelResult.sentGroups,2,'Cancellations must never be merged across original recipients');
assert.equal(cancelRecipientGroups.length,2);
assert.notEqual(cancelRecipientGroups[0][0],cancelRecipientGroups[1][0]);
assert.ok(cancellationRows.slice(1).every(r=>r[1]==='SENT_SIMULATED'));
assert.equal(sent.length,0,'No test scenario sends live mail');
assert.equal(cancelCtx.ns_sendDueReserved_(cancelSheet,cancellationRows).sentGroups,0,'Re-running sender must not redeliver a completed cancellation');

// Provider exceptions must be recorded as FAILED, never silently marked SENT.
// A subsequent sender pass must not automatically resend an ambiguous failure.
let providerAttempts=0;
const failedRows=[['Header'],[new Date(now-180000),'RESERVED','AUDIT_CANCELLED_BY_MANAGER','paco@example.org','AUD_FAILED','Company','Subject','Body',0,'','','',JSON.stringify({payload:{},windowKey:'W',groupKey:'paco@example.org|W',windowDueAtMs:now-1000})]];
const failureCtx={...ctx,
 ns_currentEmailPermissions_:()=>({AUDIT_CANCELLED_BY_MANAGER:true}),
 ns_buildDigestEmail_:()=>({subject:'Cancellation',body:'Body',htmlBody:''}),
 ns_resolveNotificationDelivery_:to=>({mode:'TEST_TO_SELF',send:true,recipient:'test@example.org',originalRecipients:[to],overridden:true}),
 NS_sendEmailWithConfiguredIdentity_:()=>{providerAttempts++;throw Error('SIMULATED_PROVIDER_FAILURE');}
};
vm.runInNewContext(source.slice(start,end),failureCtx);
const failedSheet={getRange:(r,c)=>({getValue:()=>failedRows[r-1][c-1],setValue:v=>{failedRows[r-1][c-1]=v;}})};
const failureFirst=failureCtx.ns_sendDueReserved_(failedSheet,failedRows);
const failureSecond=failureCtx.ns_sendDueReserved_(failedSheet,failedRows);
assert.equal(failureFirst.failedGroups,1);
assert.equal(failedRows[1][1],'FAILED');
assert.equal(failedRows[1][8],1);
assert.match(failedRows[1][9],/SIMULATED_PROVIDER_FAILURE/);
assert.equal(failureSecond.processedGroups,0,'Ambiguous failures must not be resent automatically');
assert.equal(providerAttempts,1);

// Long digest windows must survive the stale-reservation sweep until due.
const staleStart=source.indexOf('function ns_resetStaleReserved_(');
const staleEnd=source.indexOf('/* ============================================================\n * Digest rendering',staleStart);
assert.ok(staleStart>0&&staleEnd>staleStart);
const staleCtx={Date,Number,Math,isFinite,JSON,String,
 NS_STALE_RESERVED_MINUTES:60,
 ns_parseReserved_:v=>JSON.parse(v),
 ns_toMs_:v=>new Date(v).getTime(),
 ns_timestamp_:()=>new Date().toISOString()};
vm.runInNewContext(source.slice(staleStart,staleEnd),staleCtx);
const twentyMinutesAgo=Date.now()-20*60000;
const twoHoursAgo=Date.now()-120*60000;
const longWindowRows=[['header'],
 [new Date(twoHoursAgo),'RESERVED','WEEKLY_MANAGER_DIGEST','manager@example.org','A','','','',0,'','','',JSON.stringify({reservedAtMs:twoHoursAgo,windowDueAtMs:Date.now()+40*60000})],
 [new Date(twoHoursAgo),'RESERVED','AUDIT_ACCEPTED','manager@example.org','B','','','',0,'','','',JSON.stringify({reservedAtMs:twoHoursAgo,windowDueAtMs:twentyMinutesAgo})],
 [new Date(twoHoursAgo),'RESERVED','AUDIT_ACCEPTED','manager@example.org','C','','','',0,'','','',JSON.stringify({reservedAtMs:twoHoursAgo,windowDueAtMs:twoHoursAgo})]
];
const staleSheet={getRange:(r,c)=>({setValue:v=>{longWindowRows[r-1][c-1]=v;}})};
assert.equal(staleCtx.ns_resetStaleReserved_(staleSheet,longWindowRows),1);
assert.equal(longWindowRows[1][1],'RESERVED','A future due time is not a stale reservation');
assert.equal(longWindowRows[2][1],'RESERVED','Recently due digest must not be reset before it can be sent');
assert.equal(longWindowRows[3][1],'PENDING','Old overdue reservation may be recovered');
console.log('notification-digest-send-simulation: PASS');
