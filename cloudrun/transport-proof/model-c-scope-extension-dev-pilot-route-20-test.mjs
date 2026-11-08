import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const gate=readFileSync(new URL('./dev-ext-readonly-preview-20.mjs',import.meta.url),'utf8');
const start=src.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-pilot-preflight'&&req.method==='GET')");
const end=src.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-stage-status'&&req.method==='GET')",start);
assert(start>0&&end>start,'pilot preflight must exist before stage status');
const route=src.slice(start,end);
for(const word of ["process.env.K_SERVICE!=='ams-fase12-dev'","process.env.AMS_RUNTIME_ENV!=='DEV'",
"sessionFromRequestValidated(req)","clean(actor.role).toLowerCase()!=='manager'",
"SID!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'",
"verifiedAuditorLockDevProject()","cfg.get('ALLOW_DEV_WRITES')!=='FALSE'","cfg.get('DEV_WRITE_MODE')!=='BLOCK'",
"store.verify(manifest)","parity.counts.obligation!==199","parity.counts.auditcontext!==105","parity.counts.event!==0",
"selectScopeExtensionDevPilot20({manifest,expectedSha256:manifest.sourceManifest})",
"cutoverAuthorized:false","writerEnabled:false"])assert(route.includes(word),'pilot preflight safety missing '+word);
assert(!route.includes('store.stage(')&&!route.includes('promoteAudit('),'pilot preflight must perform no writes');
assert(gate.includes("'/api/v1/manager/ext-model-c-pilot-preflight'"),'read-only pilot must be allowlisted');
console.log('PASS isolated Manager-only DEV pilot preflight: full parity, live frozen source, no writer authorization');
