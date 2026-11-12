import assert from 'node:assert/strict';
import {enforcePlanningAtomicCutover20,validatePlanningAtomicRuntime20} from './planning-atomic-cutover-guard-20.js';
import {compositionLiveWriterSurfaces20} from './planning-cutover-compatibility-20.mjs';
const blocked=[
 '/api/v1/manager/extension-direct',
 '/api/v1/manager/self-planning-direct',
 '/api/v1/manager/extension-obligation-command',
 '/api/v1/manager/extension-reconcile-projection',
 '/api/v1/manager/scopes/scheme-version',
 '/api/v1/manager/auditor-identity/firestore-write-probe',
 '/api/v1/internal/auditor/complete-direct',
 '/api/v1/manager/company-management/scopes/hours',
 '/api/v1/manager/company-management/scopes/assign',
 '/api/v1/manager/company-management/scopes/save',
 '/api/v1/manager/company-management/save',
 '/api/v1/auditor/company-management/save',
 '/api/v1/manager/company-scope-hours/backfill',
 '/api/v1/manager/auditor-management/qualification/save',
 '/api/v1/manager/auditor-management/active/save',
 '/api/v1/manager/scopes/create',
 '/api/v1/manager/scopes/policy',
 '/api/v1/internal/dev-auditor-uid'
];
for(const path of [...new Set([...blocked,...compositionLiveWriterSurfaces20])]){
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}),/PLANNING_ATOMIC_WRITER_NOT_MIGRATED/);
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:false,method:'POST',path}));
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:true,method:'GET',path}));
}
for(const method of ['PUT','PATCH','DELETE']){
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method,path:'/api/v1/manager/company-management/save'}),/PLANNING_ATOMIC_WRITER_NOT_MIGRATED/);
}
for(const path of ['/api/v1/planning/direct-commit','/api/v1/manager/auditor-management/audit/transfer','/api/v1/planning/atomic-recover']){
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}));
}
for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of compositionLiveWriterSurfaces20)
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method,path}),
  /PLANNING_ATOMIC_WRITER_NOT_MIGRATED/,'Fail-closed canonical cutover fence: '+method+' '+path);
assert.equal(validatePlanningAtomicRuntime20({enabled:false}),true);
const validated={enabled:true,legacyWriterRetired:true,managerOwnerShared:true,backfillParityVerified:true,liveWriterRouteParityVerified:true,otherAuthorityEnabled:false};
assert.equal(validatePlanningAtomicRuntime20(validated),true);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,legacyWriterRetired:false}),/PLANNING_ATOMIC_LEGACY_WRITER_NOT_RETIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,backfillParityVerified:false}),/PLANNING_ATOMIC_BACKFILL_PARITY_REQUIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,otherAuthorityEnabled:true}),/PLANNING_ATOMIC_DUAL_AUTHORITY_ENABLED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,liveWriterRouteParityVerified:false}),/PLANNING_ATOMIC_LIVE_WRITER_ROUTE_PARITY_REQUIRED/);
const {readFileSync}=await import('node:fs');
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const serverEntry=r15.indexOf("http.createServer(async(req,res)=>{");
const canonicalEntry=r15.indexOf("enforcePlanningAtomicCutover20({enabled:planningAtomicEnabled,method:req.method,path:u.pathname});",serverEntry);
const proxyEntry=r15.indexOf("async function proxy(req,res)");
assert.ok(serverEntry>=0&&canonicalEntry>serverEntry&&proxyEntry<serverEntry,
 'Public HTTP entrypoint must fail closed before directly handled or proxied endpoints');
console.log('Atomic cutover write surface: migration fence and unaffected PROD paths OK');
