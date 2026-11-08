import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extReadOnlyPreview20 as active,extPreviewRequestAllowed20 as allowed} from './dev-ext-readonly-preview-20.mjs';
const base={AMS_RUNTIME_ENV:'DEV',K_SERVICE:'ams-fase12-dev',AMS_DEV_MAINTENANCE_MODE:'true',AMS_DEV_EXT_READONLY_PREVIEW:'true'};
assert.equal(active(base),true);
for(const [field,value] of [['AMS_RUNTIME_ENV','PROD'],['K_SERVICE','ams-transport-proof'],['AMS_DEV_MAINTENANCE_MODE','false'],['AMS_DEV_EXT_READONLY_PREVIEW','false']]){
 assert.equal(active({...base,[field]:value}),false,field+' must fail closed');
}
for(const path of ['/','/health','/manager-portal.js','/api/v1/session','/api/v1/manager/open','/api/v1/manager/company-management','/api/v1/manager/company-management/extension-obligations','/api/v1/manager/ext-model-c-source-preflight','/api/v1/manager/ext-model-c-stage-status','/api/v1/manager/ext-model-c-pilot-preflight','/api/v1/manager/ext-model-c-pilot-status']){
 assert.equal(allowed({method:'GET',path}),true,'expected read-only route '+path);
}
assert.equal(allowed({method:'POST',path:'/auth/dev-login'}),true,'DEV portal manager login must create a signed session without enabling business writers');
assert.equal(allowed({method:'POST',path:'/auth/legacy-handoff'}),true,'session exchange remains possible');
assert.equal(allowed({method:'POST',path:'/api/v1/session/exchange'}),true,'verified token exchange remains possible');
assert.equal(allowed({method:'POST',path:'/api/v1/manager/open-enrichment'}),true,'enrichment is read-only');
for(const path of ['/api/v1/manager/extension-direct','/api/v1/manager/extension-obligation-command','/api/v1/manager/extension-reconcile-projection','/api/v1/manager/self-planning-direct','/api/v1/manager/action','/api/v1/planning/direct-commit','/api/v1/manager/company-management/scopes/save']){
 assert.equal(allowed({method:'POST',path}),false,'writes must be denied '+path);
}
for(const path of ['/planning','/api/v1/internal/fast-otp-session','/api/v1/manager/auditor-identity/firestore-write-probe'])assert.equal(allowed({method:'GET',path}),false,'unverified GET must be denied');
assert.equal(allowed({method:'OPTIONS',path:'/'}),false);
const commandRoutes=['/api/v1/manager/extension-obligation-command','/api/v1/manager/extension-reconcile-projection'];
const verified={...base,AMS_DEV_EXT_COMMANDS_ENABLED:'true',AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE',AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED:'true',AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED:'true'};
for(const path of commandRoutes){
 assert.equal(allowed({method:'POST',path,env:verified}),true,'exact EXT canonical route may open only after independently verified cutover');
 for(const field of ['AMS_DEV_EXT_COMMANDS_ENABLED','AMS_SCOPE_EXTENSION_AUTHORITY','AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED','AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED','AMS_DEV_MAINTENANCE_MODE','K_SERVICE']){
  assert.equal(allowed({method:'POST',path,env:{...verified,[field]:'false'}}),false,'gate must fail closed on '+field);
 }
 assert.equal(allowed({method:'POST',path,env:base}),false,'current preview remains read-only');
}
assert.equal(allowed({method:'POST',path:'/api/v1/manager/extension-direct',env:verified}),false,'legacy extension direct writer is never opened');
const stagePath='/api/v1/manager/ext-model-c-stage';
assert.equal(allowed({method:'POST',path:stagePath,env:base}),false,'stage disabled by default');
assert.equal(allowed({method:'POST',path:stagePath,env:{...base,AMS_DEV_EXT_STAGE_ENABLED:'true'}}),true,'explicit isolated DEV stage gate is distinct from extension writer gate');
assert.equal(allowed({method:'POST',path:stagePath,env:{...base,AMS_DEV_EXT_STAGE_ENABLED:'true',AMS_DEV_EXT_COMMANDS_ENABLED:'true'}}),false,'never stage once EXT writers are active');
assert.equal(allowed({method:'POST',path:stagePath,env:{...base,AMS_DEV_EXT_STAGE_ENABLED:'true',AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE'}}),false,'never stage over active Firestore authority');
assert.equal(allowed({method:'POST',path:stagePath,env:{...base,AMS_DEV_EXT_STAGE_ENABLED:'true',K_SERVICE:'ams-transport-proof'}}),false,'never stage on canonical DEV service');

const pilot={...base,AMS_DEV_EXT_PILOT_PROMOTION_ENABLED:'true',AMS_DEV_EXT_COMMANDS_ENABLED:'true'};
assert.equal(allowed({method:'POST',path:'/api/v1/manager/ext-model-c-pilot-promote',env:pilot}),true,'pilot promotion opens only for isolated DEV with explicit pilot flags');
for(const path of commandRoutes)assert.equal(allowed({method:'POST',path,env:pilot}),true,'pilot Apply/Undo available only behind per-context Firestore fence');
for(const patch of [
 {AMS_DEV_EXT_PILOT_PROMOTION_ENABLED:'false'},
 {AMS_DEV_EXT_COMMANDS_ENABLED:'false'},
 {AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE'},
 {K_SERVICE:'ams-transport-proof'},
 {AMS_DEV_MAINTENANCE_MODE:'false'}
])assert.equal(allowed({method:'POST',path:'/api/v1/manager/ext-model-c-pilot-promote',env:{...pilot,...patch}}),false,'fail closed pilot promotion');
assert.equal(allowed({method:'POST',path:'/api/v1/manager/extension-direct',env:pilot}),false,'legacy direct EXT writer remains blocked in pilot');
const direct={...base,AMS_DEV_EXT_DIRECT_ENABLED:'true',AMS_DEV_EXT_PILOT_PROMOTION_ENABLED:'false',AMS_DEV_EXT_COMMANDS_ENABLED:'false'};
assert.equal(allowed({method:'POST',path:'/api/v1/manager/extension-obligation-command',env:direct}),true,'normal DEV direct scoped Model C EXT must be available without pilot');
assert.equal(allowed({method:'POST',path:'/api/v1/manager/self-planning-direct',env:direct}),true,'verified isolated DEV Manager self-planning toggle is narrowly enabled');
for(const patch of [{K_SERVICE:'ams-transport-proof'},{AMS_RUNTIME_ENV:'PROD'},{AMS_DEV_EXT_DIRECT_ENABLED:'false'},{AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE'},{AMS_DEV_MAINTENANCE_MODE:'false'},{AMS_DEV_EXT_READONLY_PREVIEW:'false'},{AMS_SCOPE_EXTENSION_MIGRATION_VERIFIED:'true'},{AMS_SCOPE_EXTENSION_WRITER_FENCE_VERIFIED:'true'}]){
 assert.equal(allowed({method:'POST',path:'/api/v1/manager/self-planning-direct',env:{...direct,...patch}}),false,'self planning must fail closed outside isolated DEV direct mode');
}
assert.equal(allowed({method:'POST',path:'/api/v1/manager/self-planning-direct',env:verified}),false,'Firestore cutover mode does not grant legacy self planning writer');

assert.equal(allowed({method:'POST',path:'/api/v1/manager/extension-reconcile-projection',env:direct}),false,'direct Model C mode has no Firestore projector');
for(const patch of [{K_SERVICE:'ams-transport-proof'},{AMS_RUNTIME_ENV:'PROD'},{AMS_DEV_EXT_DIRECT_ENABLED:'false'},{AMS_SCOPE_EXTENSION_AUTHORITY:'FIRESTORE'},{AMS_DEV_MAINTENANCE_MODE:'false'}]){
 assert.equal(allowed({method:'POST',path:'/api/v1/manager/extension-obligation-command',env:{...direct,...patch}}),false,'DEV direct EXT must fail closed outside isolated test copy');
}
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const sourceRoute=r4.slice(r4.indexOf("if(u.pathname==='/api/v1/manager/ext-model-c-source-preflight'"),r4.indexOf("if(u.pathname==='/api/v1/manager/company-management/extension-obligations'"));
assert(sourceRoute.includes("process.env.K_SERVICE!=='ams-fase12-dev'"),'only isolated DEV service may read aggregates');
assert(sourceRoute.includes("sessionFromRequestValidated(req)"),'session required');
assert(sourceRoute.includes("clean(actor.role).toLowerCase()!=='manager'"),'manager only');
assert(sourceRoute.includes("await sheetsBatchGet("),'read must reuse Cloud Run service identity');
assert(sourceRoute.includes("method==='GET'"),'diagnostic accepts only reads');
assert(sourceRoute.includes('canEnableWriters:false'),'diagnostic cannot claim cutover verified');
for(const prohibited of ['sheetsValuesBatchUpdate','sheetsValuesAppend','createScopeExtensionFirestoreStore20(',':commit','writeHead(201)'])assert(!sourceRoute.includes(prohibited),'source diagnostic must not mutate: '+prohibited);
assert.equal(allowed({method:'POST',path:'/api/v1/manager/ext-model-c-source-preflight',env:verified}),false,'diagnostic remains GET-only after cutover');
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert(server.includes('const extPreview=extReadOnlyPreview20(process.env)'),'preview gate missing from runtime');
assert(server.includes("process.env.K_SERVICE==='ams-fase12-dev'&&!extPreview"),'copied service must be fail-closed');
assert(server.includes("extPreview&&!extPreviewRequestAllowed20({method:req.method,path:u.pathname,env:process.env})"),'deny-by-default missing');
console.log('PASS isolated Fase 1.2 DEV preview: copy-only, maintenance-on, read-only route fence');
