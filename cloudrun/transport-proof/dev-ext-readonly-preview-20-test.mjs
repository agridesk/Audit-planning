import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {extReadOnlyPreview20 as active,extPreviewRequestAllowed20 as allowed} from './dev-ext-readonly-preview-20.mjs';
const base={AMS_RUNTIME_ENV:'DEV',K_SERVICE:'ams-fase12-dev',AMS_DEV_MAINTENANCE_MODE:'true',AMS_DEV_EXT_READONLY_PREVIEW:'true'};
assert.equal(active(base),true);
for(const [field,value] of [['AMS_RUNTIME_ENV','PROD'],['K_SERVICE','ams-transport-proof'],['AMS_DEV_MAINTENANCE_MODE','false'],['AMS_DEV_EXT_READONLY_PREVIEW','false']]){
 assert.equal(active({...base,[field]:value}),false,field+' must fail closed');
}
for(const path of ['/','/health','/manager-portal.js','/api/v1/session','/api/v1/manager/open','/api/v1/manager/company-management','/api/v1/manager/company-management/extension-obligations']){
 assert.equal(allowed({method:'GET',path}),true,'expected read-only route '+path);
}
assert.equal(allowed({method:'POST',path:'/auth/legacy-handoff'}),true,'session exchange remains possible');
assert.equal(allowed({method:'POST',path:'/api/v1/session/exchange'}),true,'verified token exchange remains possible');
assert.equal(allowed({method:'POST',path:'/api/v1/manager/open-enrichment'}),true,'enrichment is read-only');
for(const path of ['/api/v1/manager/extension-direct','/api/v1/manager/extension-obligation-command','/api/v1/manager/extension-reconcile-projection','/api/v1/manager/self-planning-direct','/api/v1/manager/action','/api/v1/planning/direct-commit','/api/v1/manager/company-management/scopes/save']){
 assert.equal(allowed({method:'POST',path}),false,'writes must be denied '+path);
}
for(const path of ['/planning','/api/v1/internal/fast-otp-session','/api/v1/manager/auditor-identity/firestore-write-probe'])assert.equal(allowed({method:'GET',path}),false,'unverified GET must be denied');
assert.equal(allowed({method:'OPTIONS',path:'/'}),false);
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert(server.includes('const extPreview=extReadOnlyPreview20(process.env)'),'preview gate missing from runtime');
assert(server.includes("process.env.K_SERVICE==='ams-fase12-dev'&&!extPreview"),'copied service must be fail-closed');
assert(server.includes("extPreview&&!extPreviewRequestAllowed20({method:req.method,path:u.pathname})"),'deny-by-default missing');
console.log('PASS isolated Fase 1.2 DEV preview: copy-only, maintenance-on, read-only route fence');
