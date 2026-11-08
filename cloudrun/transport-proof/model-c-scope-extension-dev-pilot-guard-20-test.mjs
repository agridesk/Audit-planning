import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL('./'+n,import.meta.url),'utf8');
const server=read('server-r4.js'),store=read('model-c-scope-extension-firestore-store-20.mjs');
const helper=server.slice(server.indexOf('function isolatedExtPilot20(){'),server.indexOf('async function verifiedAuditorLockDevProject()'));
for(const phrase of [
 "process.env.AMS_RUNTIME_ENV==='DEV'","process.env.K_SERVICE==='ams-fase12-dev'",
 "process.env.AMS_DEV_EXT_PILOT_PROMOTION_ENABLED==='true'",
 "process.env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'",
 "cfg.get('ENV')!=='DEV'","cfg.get('ALLOW_DEV_WRITES')!=='FALSE'","cfg.get('DEV_WRITE_MODE')!=='BLOCK'",
 "EXT_PILOT_GAS_WRITER_FREEZE_LOST",
 "EXT_WRITER_PROMOTION_","ctx.writerFenceVerified?.booleanValue!==true",
 "ctx.migrationState?.stringValue!=='WRITER_VERIFIED'",
 "ctx.writerFreezeEvidenceRef?.stringValue?.endsWith('__PILOT_ONLY')",
 "event.kind?.stringValue!=='MODEL_C_WRITER_PROMOTION'"
])assert(helper.includes(phrase),'missing pilot runtime evidence: '+phrase);
const apply=server.slice(server.indexOf("if(u.pathname==='/api/v1/manager/extension-obligation-command'"),server.indexOf("if(u.pathname==='/api/v1/manager/extension-reconcile-projection'"));
const projection=server.slice(server.indexOf("if(u.pathname==='/api/v1/manager/extension-reconcile-projection'"),server.indexOf("if(u.pathname==='/api/v1/manager/extension-direct'"));
for(const route of [apply,projection]){
 assert(route.includes('await assertDevExtPilotSourceFrozen20()'),'each pilot mutation must freshly recheck GAS freeze');
 assert(route.includes('await assertDevExtPilotAuditEvidence20('),'each pilot mutation must prove a promoted context and event');
}
assert(server.includes("return isolatedExtPilot20()&&!ctx.pilotOnly?null:ctx"),'dossier must not surface unpromoted contexts as mutable');
assert(store.includes("pilotOnly:context.writerFreezeEvidenceRef?.endsWith('__PILOT_ONLY')===true"),'context must expose stored pilot provenance for dossier');
console.log('PASS DEV pilot writer fence: live System_Config, immutable per-audit promotion event, no global cutover');
