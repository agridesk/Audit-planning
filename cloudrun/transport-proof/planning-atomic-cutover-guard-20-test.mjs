import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enforcePlanningAtomicCutover20,validatePlanningAtomicRuntime20,planningAtomicOwnedHttpRoutes20,planningAtomicRetiredHttpRoutes20,classifiedPlanningCutoverPaths20,planningAtomicDeferredManagementRoutes20,planningAtomicRetiredManagementRoutes20} from './planning-atomic-cutover-guard-20.js';
import {compositionLiveWriterSurfaces20} from './planning-cutover-compatibility-20.mjs';
import {atomicConfigurationRoutes20} from './planning-atomic-config-bridge-20.js';
import {atomicScopeAdminRoutes20} from './planning-atomic-scope-admin-20.js';
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
for(const path of [...new Set([...blocked,...compositionLiveWriterSurfaces20])].filter(path=>!planningAtomicOwnedHttpRoutes20.includes(path))){
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
for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of compositionLiveWriterSurfaces20.filter(path=>!planningAtomicOwnedHttpRoutes20.includes(path)))
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method,path}),
  /PLANNING_ATOMIC_WRITER_NOT_MIGRATED/,'Fail-closed canonical cutover fence: '+method+' '+path);
for(const path of planningAtomicOwnedHttpRoutes20){
 assert.doesNotThrow(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}),
  'R15-owned atomic route must accept POST: '+path);
 for(const method of ['PUT','PATCH','DELETE'])
  assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method,path}),
   /PLANNING_ATOMIC_WRITER_NOT_MIGRATED/,
   'R15-owned atomic route must reject unhandled mutation verb: '+method+' '+path);
}
const entrySource=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
for(const path of planningAtomicOwnedHttpRoutes20.filter(path=>!atomicConfigurationRoutes20.includes(path)&&!atomicScopeAdminRoutes20.includes(path)))
 assert.ok(entrySource.includes("'"+path+"'"),'Atomic route not recognized by R15: '+path);
assert.ok(entrySource.includes('planningAtomicConfigBridge&&atomicConfigurationRoutes20.includes(u.pathname)'),
 'R15 must dispatch the six verified metadata routes to their shared-gate bridge');
for(const path of atomicConfigurationRoutes20)
 assert.ok(planningAtomicOwnedHttpRoutes20.includes(path),'Metadata route not in public atomic owner inventory');
for(const path of atomicScopeAdminRoutes20)
 assert.ok(planningAtomicOwnedHttpRoutes20.includes(path),'Scope route not in public atomic owner inventory');
assert.ok(entrySource.includes('planningAtomicScopeAdmin&&atomicScopeAdminRoutes20.includes(u.pathname)'),
 'R15 must dispatch Scope Management through the fenced service');
const handoff=entrySource.indexOf("u.pathname==='/api/v1/planning/commit-handoff'&&planningAtomicCommands");
const direct=entrySource.indexOf("u.pathname==='/api/v1/planning/direct-commit'&&planningAtomicCommands");
assert.ok(handoff>0&&direct>handoff,'R5 Planner must be intercepted by the atomic owner before direct-commit');
const handoffSource=entrySource.slice(handoff,direct);
for(const contract of [
 "planningAtomicCommands.commit({actor:{...actor,cookie:String(req.headers.cookie||'')},body})",
 "PLANNING_MULTI_AUDIT_HANDOFF_ATOMIC_NOT_MIGRATED",
 "ok:true,result,writeOwner:'CLOUD_RUN_DEV_FIRESTORE_ATOMIC_PLANNING'",
 "newStatus:actor.role==='manager'?'Approved':'Pending Approval'",
 "planningCache.invalidate()"
])assert.ok(handoffSource.includes(contract),'Atomic handoff compatibility missing '+contract);

assert.ok(compositionLiveWriterSurfaces20.includes('/api/v1/manager/extension'),
 'R10 legacy Manager extension alias must be included in the atomic migration fence');
assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',
 path:'/api/v1/manager/extension'}),/PLANNING_ATOMIC_WRITER_NOT_MIGRATED/);
const retired=entrySource.indexOf("LEGACY_EXT_ROUTE_RETIRED_USE_MODEL_C_COMMAND");
const mainFence=entrySource.indexOf("enforcePlanningAtomicCutover20({enabled:planningAtomicEnabled,method:req.method,path:u.pathname});");
assert.ok(retired>0&&retired<mainFence,
 'Legacy EXT and reconcile endpoints must return 410 before proxy fallback');
assert.equal(planningAtomicRetiredManagementRoutes20.length,4);
for(const path of planningAtomicRetiredManagementRoutes20){
 assert.ok(!planningAtomicDeferredManagementRoutes20.includes(path),'Retired bootstrap route remains deferred');
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path}),
  /PLANNING_ATOMIC_WRITER_NOT_MIGRATED/);
}
assert.ok(entrySource.includes('planningAtomicRetiredManagementRoutes20.includes(u.pathname)'),
 'R15 must retire migration-only endpoints before the cutover fence');
assert.ok(entrySource.includes('planningAtomicRetiredHttpRoutes20.includes(u.pathname)'),
 'Retired routes must be rejected by R15 through the classified route inventory');
assert.deepEqual(planningAtomicRetiredHttpRoutes20,[
 '/api/v1/manager/extension',
 '/api/v1/manager/extension-direct',
 '/api/v1/manager/extension-reconcile-projection'
]);
assert.deepEqual(classifiedPlanningCutoverPaths20(),[...compositionLiveWriterSurfaces20]);
for(const route of ['/api/v1/manager/company-management/save',
 '/api/v1/auditor/company-management/save',
 '/api/v1/manager/auditor-management/profile/save','/api/v1/manager/scopes/cosmetic']){
 assert.ok(planningAtomicOwnedHttpRoutes20.includes(route),'Verified metadata route owner missing');
 assert.ok(!planningAtomicDeferredManagementRoutes20.includes(route),'Migrated metadata route still deferred');
}

assert.equal(planningAtomicDeferredManagementRoutes20.length,8,
 'Eight still-unmigrated administrative writers must remain a release blocker');
for(const route of planningAtomicDeferredManagementRoutes20)
 assert.throws(()=>enforcePlanningAtomicCutover20({enabled:true,method:'POST',path:route}),
  /PLANNING_ATOMIC_WRITER_NOT_MIGRATED/,'Deferred route not actually fenced: '+route);
assert.ok(entrySource.includes('deferredManagementRoutes:planningAtomicDeferredManagementRoutes20'),
 'Runtime DEV readiness must report all deferred management writers');

const internalHandler=entrySource.indexOf("u.pathname==='/api/v1/internal/auditor/complete-direct'&&planningAtomicInternalComplete");
assert.ok(internalHandler>0,'Internal auditor COMPLETE must dispatch to atomic multi lifecycle');
const internalSource=entrySource.slice(internalHandler,internalHandler+2300);
for(const evidence of ["timingSafeEqual(expected,supplied)","planningAtomicInternalComplete.commit({",
 "getRoster()","matches[0].auditorId"])
 assert.ok(internalSource.includes(evidence),'Atomic internal auditor COMPLETION missing '+evidence);
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.ok(r4.includes("lifecycleAuthorityPreflight20(identity,b,'COMPLETE',()=>directAuditorComplete(identity,b))"),
 'Authenticated bridge must expose a read-only canonical completion preflight');
assert.equal(validatePlanningAtomicRuntime20({enabled:false}),true);
const validated={enabled:true,legacyWriterRetired:true,managerOwnerShared:true,backfillParityVerified:true,liveWriterRouteParityVerified:true,otherAuthorityEnabled:false};
assert.equal(validatePlanningAtomicRuntime20(validated),true);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,
 deferredManagementRoutes:planningAtomicDeferredManagementRoutes20}),
 /PLANNING_ATOMIC_MANAGEMENT_WRITERS_NOT_MIGRATED/);
assert.ok(entrySource.includes('deferredManagementRoutes:planningAtomicDeferredManagementRoutes20'),
 'Unsafe atomic runtime startup must be refused until admin writers are migrated');

assert.throws(()=>validatePlanningAtomicRuntime20({...validated,legacyWriterRetired:false}),/PLANNING_ATOMIC_LEGACY_WRITER_NOT_RETIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,backfillParityVerified:false}),/PLANNING_ATOMIC_BACKFILL_PARITY_REQUIRED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,otherAuthorityEnabled:true}),/PLANNING_ATOMIC_DUAL_AUTHORITY_ENABLED/);
assert.throws(()=>validatePlanningAtomicRuntime20({...validated,liveWriterRouteParityVerified:false}),/PLANNING_ATOMIC_LIVE_WRITER_ROUTE_PARITY_REQUIRED/);

const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const serverEntry=r15.indexOf("http.createServer(async(req,res)=>{");
const canonicalEntry=r15.indexOf("enforcePlanningAtomicCutover20({enabled:planningAtomicEnabled,method:req.method,path:u.pathname});",serverEntry);
const proxyEntry=r15.indexOf("async function proxy(req,res)");
assert.ok(serverEntry>=0&&canonicalEntry>serverEntry&&proxyEntry<serverEntry,
 'Public HTTP entrypoint must fail closed before directly handled or proxied endpoints');
console.log('Atomic cutover write surface: migration fence and unaffected PROD paths OK');
