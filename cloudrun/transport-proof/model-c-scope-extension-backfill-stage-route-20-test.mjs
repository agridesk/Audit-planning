import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>readFileSync(new URL(n,import.meta.url),'utf8');
const server=read('./server-r4.js');
const gate=read('./dev-ext-readonly-preview-20.mjs');
const docker=read('./Dockerfile');
const start=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-stage'");
const end=server.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-source-preflight'",start);
assert(start>0&&end>start,'stage route must precede read-only aggregate preflight');
const route=server.slice(start,end);
for(const item of [
 "req.method==='POST'",
 "process.env.K_SERVICE!=='ams-fase12-dev'",
 "process.env.AMS_RUNTIME_ENV!=='DEV'",
 "process.env.AMS_DEV_EXT_STAGE_ENABLED!=='true'",
 "verifiedAuditorLockDevProject()",
 "sessionFromRequestValidated(req)",
 "clean(actor.role).toLowerCase()!=='manager'",
 "requestOrigin=clean(req.headers.origin)",
 "parsedOrigin.origin!=='https://ams-fase12-dev-510075419067.europe-west1.run.app'",
 "body?.approval!=='I_APPROVE_DEV_EXT_STAGE_199_105'",
 "expectedSourceManifestSha256",
 "cfg.get('ALLOW_DEV_WRITES')!=='FALSE'",
 "cfg.get('DEV_WRITE_MODE')!=='BLOCK'",
 "const manifest=await source()",
 "manifest.sourceManifest!==body.expectedSourceManifestSha256",
 "const reread=await source()",
 "EXT_STAGE_SOURCE_DRIFT",
 "createScopeExtensionFirestoreStager20",
 "approved:true,cutoverVerified:false",
 "const after=await source()",
 "EXT_STAGE_SOURCE_DRIFT_AFTER_COMMIT",
 "writerEnabled:false"
])assert(route.includes(item),'missing safety condition: '+item);
for(const item of ['AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED','AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED','AMS_DEV_EXT_COMMANDS_ENABLED'])assert(route.includes(item),'writer cutover must be forbidden: '+item);
assert(!route.includes("parsedOrigin.host!==clean(req.headers.host)"),'stage Origin may not compare against internal proxy Host');
const proxy=read('./server-r15.js');
assert(proxy.includes('delete headers.host'),'R15 proxy explicitly drops Host; public DEV origin must be compared to a fixed allowlist');
assert(gate.includes("path==='/api/v1/manager/ext-model-c-stage'"),'preview must gate POST stage separately');
assert(gate.includes("env.AMS_DEV_EXT_STAGE_ENABLED==='true'"),'default disabled');
assert(docker.includes('COPY model-c-scope-extension-*.mjs ./'),'stage module must be included in runtime Dockerfile');
assert(!route.includes("process.env.AMS_DEV_EXT_COMMANDS_ENABLED='true'"),'stage may never enable EXT writers');
console.log('PASS manager-only DEV stage route, frozen Sheets, explicit approved SHA, create-only Firestore and no writer cutover');
