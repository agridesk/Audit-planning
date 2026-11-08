import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('./'+p,import.meta.url),'utf8');
const server=read('server-r4.js'),ui=read('manager-portal.js'),preview=read('dev-ext-readonly-preview-20.mjs');
const fn=server.slice(server.indexOf('function isolatedExtDirect20(){'),server.indexOf('function isolatedExtPilot20(){'));
for(const x of ["process.env.AMS_RUNTIME_ENV==='DEV'","process.env.K_SERVICE==='ams-fase12-dev'","process.env.AMS_DEV_EXT_DIRECT_ENABLED==='true'","process.env.AMS_SCOPE_EXTENSION_AUTHORITY!=='FIRESTORE'","cfg.get('ALLOW_DEV_WRITES')!=='FALSE'","cfg.get('DEV_WRITE_MODE')!=='BLOCK'","verifiedAuditorLockDevProject()"]){assert(fn.includes(x),'direct DEV boundary missing '+x)}
const isolatedOrigins="['https://ams-fase12-dev-510075419067.europe-west1.run.app','https://ams-fase12-dev-zwtcar7xpa-ew.a.run.app'].includes(parsedOrigin.origin)";
assert.equal(server.split(isolatedOrigins).length-1,3,'isolated EXT command, reconciliation, and staging must allow only the two verified Cloud Run origins');
const post=server.slice(server.indexOf("if(u.pathname==='/api/v1/manager/extension-obligation-command'"),server.indexOf("if(u.pathname==='/api/v1/manager/extension-reconcile-projection'"));
for(const x of ['if(isolatedExtDirect20())','withDirectManagerActionLock(auditId','readIsolatedDevModelCExt20()','inspectDevScopeExtension20','planDevScopeExtension20','sheetsValuesBatchUpdateRaw(plan.updates)','EXT_DEV_DIRECT_READBACK_UNVERIFIED'])assert(post.includes(x),'direct POST guard missing '+x);
const get=server.slice(server.indexOf("if(u.pathname==='/api/v1/manager/company-management/extension-obligations'"),server.indexOf("if(u.pathname==='/api/v1/manager/company-management'&&"));
assert(get.includes("mode:'DEV_MODEL_C_DIRECT'"),'dossier needs direct metadata');
assert(get.includes('inspectDevScopeExtension20'),'dossier must derive eligibility from canonical obligation source');
assert(preview.includes("env.AMS_DEV_EXT_DIRECT_ENABLED==='true'"),'preview needs isolated writer gate');
assert(ui.includes("['FIRESTORE_VERIFIED','DEV_MODEL_C_DIRECT'].includes(data.mode)"),'single scope must accept direct authority');
assert(ui.includes("var allowed=['FIRESTORE_VERIFIED','DEV_MODEL_C_DIRECT'].includes(data.mode)"),'multi-scope must accept direct authority');
assert(ui.includes("receipt.direct===true&&receipt.projection==='PROJECTED'"),'UI must acknowledge verified direct write without Firestore projection');
assert(!ui.includes('initExtPilotWorkspace20();'),'pilot prompts must be removed from normal Manager UI');
console.log('PASS isolated DEV direct Model C EXT normal Manager Grid, per scope, atomic UI acknowledgement, no per-audit promotion');
