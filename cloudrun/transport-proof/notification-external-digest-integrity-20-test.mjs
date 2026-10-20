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
