import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const docker=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
for(const file of ['ecas-delivery-receipt-20.mjs','ecas-lifecycle-outbox-20.mjs','ecas-lifecycle-notification-intent-20.mjs'])assert.ok(docker.includes('COPY '+file+' ./'),file);
assert.ok(server.includes("import {findVerifiedEcasReceipt20}"));
assert.ok(server.includes("import {buildEcasLifecycleOutbox20}"));
assert.ok(server.includes("auditorName:assigned,auditorUid:val(row,col(h,['Auditor_UID','Auditor UID']))"));
assert.ok(server.includes("auditorName:representedAuditor,auditorUid:val(row,col(h,['Auditor_UID','Auditor UID']))"));
assert.ok(server.includes("process.env.AMS_RUNTIME_ENV==='DEV'&&process.env.AMS_DEV_ECAS_LIFECYCLE_QUEUE_ENABLED==='YES'"));
assert.ok(server.includes("reason:'ECAS_QUEUE_SOURCE_TRUNCATED'"));
assert.ok(server.includes('directEcasEventConfigReady20(event,configRows)'));
assert.ok(server.includes('Notification_Config!A1:AF200'));
const cancel=server.slice(server.indexOf('async function directManagerCancel('),server.indexOf('async function directManagerReject('));
const reject=server.slice(server.indexOf('async function directManagerReject('),server.indexOf('const DIRECT_PLAN_LOCKS'));
for(const [name,source,action,index] of [['Cancel',cancel,'CANCEL',3],['Reject',reject,'REJECT',9]]){
 assert.ok(source.includes("'Notification Queue!A1:M5000'"),name+' source');
 assert.ok(source.includes("'Notification_Config!A1:AF200'"),name+' config');
 assert.ok(source.includes("action:'"+action+"',reason,queueRows:vr["+index+"]?.values"),name+' provenance');
 assert.ok(source.includes('ecasLifecycleIntent:ecasLifecycle.eligible'),name+' durable trail');
 assert.ok(source.includes('directEcasLifecycleQueueRow20(ecasLifecycle'),name+' outbox row');
 assert.ok(source.includes('sideEffectQueue'),name+' side-effect result');
 assert.ok(source.indexOf("if(!reason)throw new Error('ACTION_REASON_REQUIRED')")<source.indexOf('await sheetsValuesBatchUpdate'),name+' reason guard before writes');
}
assert.ok(reject.includes("reason:archiveReason"));
assert.ok(cancel.includes("priorReason===reason&&priorTimestamp"));
assert.ok(cancel.includes('if(recoveryRow)await sheetsValuesAppend'));
assert.ok(reject.includes('if(recoveryRow)await sheetsValuesAppend'));
console.log('Cloud Run DEV Cancel/Reject ECAS source integration OK');
