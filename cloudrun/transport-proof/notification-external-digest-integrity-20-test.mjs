import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const external=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
const begin=external.indexOf('function NB_renderExternalOperationalDigest_(');
const stop=external.indexOf('function NB_externalOperationalSubject_(',begin);
assert.ok(begin>=0&&stop>begin,'External renderer found');
const ctx={
 NB_externalValidateDigestItems_:()=>({validItems:[{company:'Valid company'}],invalid:[{index:1,company:'Incomplete company',missing:['scopes']}] }),
 JSON,Error
};
vm.createContext(ctx);vm.runInContext(external.slice(begin,stop),ctx);
assert.throws(()=>ctx.NB_renderExternalOperationalDigest_('ecas@example.org',[{},{}]),/refused partial digest/,'Mixed valid and invalid external rows must never send a partial email');
ctx.NB_externalValidateDigestItems_=()=>({validItems:[],invalid:[]});
assert.throws(()=>ctx.NB_renderExternalOperationalDigest_('ecas@example.org',[]),/no valid rows/);


// ECAS-specific cancellation/change explanation must never leak an internal comment.
const reasonStart=external.indexOf('function NB_externalReasonText_(');
const reasonEnd=external.indexOf('/* ============================================================\\n * Input validation',reasonStart);
assert.ok(reasonStart>=0&&reasonEnd>reasonStart,'External explanation helper found');
const explainCtx={NB_clean_:x=>String(x??'').trim()};
vm.createContext(explainCtx);
vm.runInContext(external.slice(reasonStart,reasonEnd),explainCtx);
assert.equal(explainCtx.NB_externalReasonText_({eventCode:'ECAS_AUDIT_CANCELLED_DIGEST',comment:'INTERNAL ONLY',ecasComment:'Audit vervalt'}),'Audit vervalt');
assert.equal(explainCtx.NB_externalReasonText_({eventCode:'ECAS_AUDIT_CANCELLED_DIGEST',comment:'INTERNAL ONLY'}),'','No internal fallback for external cancellation');
assert.equal(explainCtx.NB_externalReasonText_({eventCode:'ECAS_AUDIT_CHANGED_DIGEST',comment:'INTERNAL ONLY',ecasComment:'Datumvolgorde aangepast'}),'Datumvolgorde aangepast');
assert.equal(explainCtx.NB_externalReasonText_({eventCode:'CUSTOMER_AUDIT_CANCELLED_DIGEST',comment:'Customer reason'}),'Customer reason','Non-ECAS legacy behavior preserved');
const validationStart=external.indexOf('function NB_externalMissingRequiredFields_(');
const validationEnd=external.indexOf('function NB_externalSkippedRowsHtml_(',validationStart);
assert.ok(validationStart>=0&&validationEnd>validationStart);
const validationCtx={NB_clean_:x=>String(x??'').trim(),NB_mpsNumber_:x=>x.mpsNumber,NB_externalScheduleRows_:()=>[{}]};
vm.createContext(validationCtx);
vm.runInContext(external.slice(validationStart,validationEnd),validationCtx);
const validChange={eventCode:'ECAS_AUDIT_CHANGED_DIGEST',company:'Teler',mpsNumber:'123',auditorName:'Auditor',scopes:['ABC'],plannedHours:2};
assert.ok(validationCtx.NB_externalMissingRequiredFields_(validChange).includes('ecasComment'));
assert.ok(!validationCtx.NB_externalMissingRequiredFields_({...validChange,ecasComment:'Datum gewijzigd'}).includes('ecasComment'));

// Cancellation identification must use the last communicated schedule after
// the status machine clears current planning blocks.
const scheduleStart=external.indexOf('function NB_externalScheduleRows_(');
const scheduleEnd=external.indexOf('function NB_externalParsePlannedDateLine_(',scheduleStart);
assert.ok(scheduleStart>=0&&scheduleEnd>scheduleStart);
const scheduleCtx={NB_clean_:x=>String(x??'').trim(),NB_externalFormatDateNl_:x=>x,NB_externalTimeRangeNl_:(x,y)=>x+' - '+y};
vm.createContext(scheduleCtx);
vm.runInContext(external.slice(scheduleStart,scheduleEnd),scheduleCtx);
const cancelled={eventCode:'ECAS_AUDIT_CANCELLED_DIGEST',blocks:[],plannedDates:[],previousBlocks:[{date:'2026-11-17',start:'08:00',end:'12:00'}]};
assert.equal(scheduleCtx.NB_externalScheduleRows_(cancelled)[0].date,'2026-11-17');
assert.equal(scheduleCtx.NB_externalScheduleRows_({...cancelled,previousBlocks:[]}).length,0,'Must fail closed if old plan is missing');
assert.equal(scheduleCtx.NB_externalScheduleRows_({eventCode:'ECAS_AUDIT_APPROVAL_DIGEST',blocks:[{date:'2026-11-18'}]})[0].date,'2026-11-18');

const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const sendBegin=sender.indexOf('function ns_sendDueReserved_(');
const sendEnd=sender.indexOf('function ns_resetStaleReserved_(',sendBegin);
assert.ok(sendBegin>=0&&sendEnd>sendBegin);
let deliveries=0;
const now=Date.now();
const row=(audit)=>[new Date(now-180000),'RESERVED','ECAS_AUDIT_APPROVAL_DIGEST','ecas@example.org',audit,'Company','Subject','Body',0,'','','',JSON.stringify({payload:{},windowKey:'ECAS_WINDOW',groupKey:'ecas@example.org|ECAS_WINDOW',windowDueAtMs:now-1000})];
const rows=[['header'],row('AUD_VALID'),row('AUD_INCOMPLETE')];
const context={
 ns_parseReserved_:x=>JSON.parse(x),
 ns_toMs_:x=>new Date(x).getTime(),
 ns_normalizeBody_:x=>String(x??''),
 ns_currentEmailPermissions_:()=>({ECAS_AUDIT_APPROVAL_DIGEST:true}),
 ns_buildDigestEmail_:()=>{throw Error('PlanningToClientDigest refused partial digest: invalid rows')},
 ns_resolveNotificationDelivery_:()=>({mode:'DRY_RUN',send:false,originalRecipients:['ecas@example.org']}),
 NotificationDeliveryGuard_assertDeliveryAllowed:()=>{},
 NS_sendEmailWithConfiguredIdentity_:()=>{deliveries++},
 ns_timestamp_:()=>new Date().toISOString(),
 ns_escapeHtml_:x=>x,
 NS_DEFAULT_FROM_NAME:'AMS',Date,JSON,Number,String,Math,Array,Object,Error
};
vm.createContext(context);vm.runInContext(sender.slice(sendBegin,sendEnd),context);
const sheet={getRange:(r,c)=>({getValue:()=>rows[r-1][c-1],setValue:v=>{rows[r-1][c-1]=v;}})};
const result=context.ns_sendDueReserved_(sheet,rows);
assert.equal(result.failedGroups,1);
assert.equal(result.failedRows,2,'Entire affected group must remain visibly FAILED');
assert.equal(result.sentRows,0);
assert.equal(deliveries,0,'Invalid ECAS digest must not deliver');
assert.ok(rows.slice(1).every(x=>x[1]==='FAILED'));
assert.equal(context.ns_sendDueReserved_(sheet,rows).processedGroups,0,'No automatic ambiguous retry');
console.log('notification-external-digest-integrity-20: PASS');
