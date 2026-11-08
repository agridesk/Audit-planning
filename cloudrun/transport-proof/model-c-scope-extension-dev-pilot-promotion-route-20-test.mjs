import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('./'+f,import.meta.url),'utf8');
const server=read('server-r4.js'),gate=read('dev-ext-readonly-preview-20.mjs'),ui=read('manager-portal.js');
const a=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-pilot-promote'&&req.method==='POST')");
const b=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-pilot-preflight'&&req.method==='GET')",a);
assert(a>0&&b>a,'single-audit pilot promotion route missing');
const route=server.slice(a,b);
for(const clause of [
 "isolatedExtPilot20()",
 "origin!=='https://ams-fase12-dev-510075419067.europe-west1.run.app'",
 "sessionFromRequestValidated(req)",
 "clean(actor.role).toLowerCase()!=='manager'",
 "operatorWriterFreezeAttested!==true",
 "typedApproval!=='PROMOTE '+auditId+' DEV EXT'",
 "SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'",
 "verifiedAuditorLockDevProject()",
 "cfg.get('ALLOW_DEV_WRITES')!=='FALSE'",
 "cfg.get('DEV_WRITE_MODE')!=='BLOCK'",
 "manifest.sourceManifest!==expectedHash",
 "stager.verify(manifest)",
 "prepareScopeExtensionDevPilotPromotion20",
 "latest.sourceManifest!==expectedHash",
 "promoter.promoteAudit(auditId)",
 "after.sourceManifest!==expectedHash",
 "otherAuditContextsRemainUnverified:true"
])assert(route.includes(clause),'missing guarded DEV pilot contract: '+clause);
const pilotGate=server.slice(server.indexOf('function isolatedExtPilot20(){'),server.indexOf('async function verifiedAuditorLockDevProject()',server.indexOf('function isolatedExtPilot20(){')));
for(const clause of ["process.env.K_SERVICE==='ams-fase12-dev'","process.env.AMS_RUNTIME_ENV==='DEV'","process.env.AMS_DEV_EXT_PILOT_PROMOTION_ENABLED==='true'","process.env.AMS_DEV_EXT_COMMANDS_ENABLED==='true'","process.env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'","process.env.AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED!=='true'","process.env.AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED!=='true'"]){
 assert(pilotGate.includes(clause),'isolated pilot runtime guard missing '+clause);
}
assert(!route.includes('store.stage(')&&!route.includes('process.env.AMS_SCOPE_EXTENSION_AUTHORITY='),'pilot must neither restage nor modify runtime cutover flags');
assert(gate.includes("path==='/api/v1/manager/ext-model-c-pilot-promote'"),'pilot action must be preview gated');
assert(gate.includes("env.AMS_DEV_EXT_PILOT_PROMOTION_ENABLED==='true'"),'pilot action requires explicit env flag');
assert(ui.includes("get('ext-pilot')!=='1'"),'pilot UI must remain hidden by default');
assert(ui.includes("typed=window.prompt('DEV only."),'UI must demand typed consent');
assert(ui.includes("operatorWriterFreezeAttested:true"),'pilot must record explicit operator attestation');
assert(!ui.includes("initExtPilotWorkspace20();"),'normal Manager Grid must no longer activate a pilot promotion workspace');
console.log('PASS guarded isolated DEV pilot promotion route and typed one-audit Manager UI');
