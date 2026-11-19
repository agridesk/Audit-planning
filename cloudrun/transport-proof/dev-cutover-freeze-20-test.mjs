import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {devCutoverFreezeDecision20 as gate} from './dev-cutover-freeze-20.mjs';
const freeze=(method,path,overrides={})=>gate({isDev:true,freezeEnabled:true,method,path,backfillWriteEnabled:false,legacyWritersFrozen:false,...overrides});
for(const path of ['/api/v1/manager/scopes/policy','/api/v1/manager/approve-direct','/api/v1/manager/company-management/save',
 '/api/v1/manager/extension-obligation-command','/api/v1/auditor/action','/api/v1/planning/commit-handoff',
 '/api/v1/manager/swap20/propose','/api/v1/manager/scopes/create','/api/v1/planning/atomic-backfill']){
 for(const method of ['POST','PUT','PATCH','DELETE']){
  assert.deepEqual(freeze(method,path),{allow:false,status:423,error:'DEV_CUTOVER_WRITES_FROZEN'});
 }
}
for(const method of ['GET','HEAD','OPTIONS'])assert.deepEqual(freeze(method,'/anything'),{allow:true});
for(const path of ['/auth/otp/request','/auth/otp/verify','/auth/dev-login','/auth/logout'])
 assert.deepEqual(freeze('POST',path),{allow:true});
assert.deepEqual(freeze('POST','/api/v1/planning/atomic-backfill',{backfillWriteEnabled:true,legacyWritersFrozen:true}),{allow:true,backfillOnly:true});
assert.equal(freeze('POST','/api/v1/planning/atomic-backfill',{backfillWriteEnabled:true}).allow,false);
assert.equal(freeze('POST','/api/v1/planning/atomic-backfill',{legacyWritersFrozen:true}).allow,false);
assert.equal(gate({isDev:false,freezeEnabled:true,method:'POST',path:'/api/v1/auditor/action'}).allow,true);
assert.equal(gate({isDev:true,freezeEnabled:false,method:'POST',path:'/api/v1/auditor/action'}).allow,true);
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const gatePos=r15.indexOf('const cutoverFreeze=devCutoverFreezeDecision20(');
assert.ok(gatePos>0);
assert.ok(gatePos<r15.indexOf('if(planningAtomicEnabled&&'));
assert.ok(r15.indexOf("if(!cutoverFreeze.allow){",gatePos)>gatePos);
assert.match(r15,/if\(!dryRun&&\(planningAtomicEnabled\|\|!planningAtomicPrepEnabled\|\|process\.env\.AMS_DEV_CUTOVER_HTTP_WRITE_FREEZE_ENABLED/);
// Post-cutover: retain freeze for every legacy POST, and permit explicitly
// atomic-owned writes only. The backfill route must retire automatically.
for(const path of ['/api/v1/planning/commit-handoff','/api/v1/manager/approve-direct',
 '/api/v1/auditor/action','/api/v1/manager/company-management/save',
 '/api/v1/planning/direct-commit','/api/v1/planning/visit-composition-atomic','/api/v1/planning/atomic-recover','/api/v1/planning/atomic-forward-recover','/api/v1/planning/atomic-partial-repair','/api/v1/planning/atomic-self-planning-rescue','/api/v1/planning/atomic-composition-forward-recover']){
 assert.deepEqual(freeze('POST',path,{atomicPlanningEnabled:true}),{allow:true,atomicOwned:true});
 for(const method of ['PUT','PATCH','DELETE'])assert.equal(freeze(method,path,{atomicPlanningEnabled:true}).allow,false);
}
for(const path of ['/api/v1/planning/atomic-backfill','/api/v1/manager/extension-direct',
 '/api/v1/manager/swap20/propose','/api/v1/manager/scopes/bootstrap-v1']){
 assert.equal(freeze('POST',path,{atomicPlanningEnabled:true,backfillWriteEnabled:true,legacyWritersFrozen:true}).allow,false);
}
assert.match(r15,/atomicPlanningEnabled:planningAtomicEnabled/);
assert.equal(freeze('POST','/api/v1/planning/atomic-composition-forward-recover').allow,false);
assert.deepEqual(freeze('POST','/api/v1/planning/atomic-composition-forward-recover',{atomicPlanningEnabled:true}),{allow:true,atomicOwned:true});
assert.match(r15,/u\.pathname==='\/api\/v1\/planning\/atomic-self-planning-rescue'/);
assert.equal(freeze('POST','/api/v1/planning/atomic-self-planning-rescue').allow,false);
assert.deepEqual(freeze('POST','/api/v1/manager/open-enrichment',{atomicPlanningEnabled:true}),{allow:true});
assert.equal(freeze('POST','/api/v1/manager/open-enrichment').allow,false);
assert.equal(freeze('POST','/api/v1/internal/dev-manager-enrichment-source',{atomicPlanningEnabled:true}).allow,false);
for(const method of ['PUT','PATCH','DELETE'])assert.equal(freeze(method,'/api/v1/manager/open-enrichment',{atomicPlanningEnabled:true}).allow,false);
console.log('DEV cutover write freeze: fail closed on all business methods and guard backfill PASS');

const directSwap={atomicPlanningEnabled:true,swapDirectRouteEnabled:true};
for(const path of [
 ...['preview','eligible','diagnose','status'].map(route=>'/api/v1/manager/swap20/'+route)
]){
 assert.deepEqual(freeze('POST',path,directSwap),{allow:true});
 assert.equal(freeze('POST',path,{atomicPlanningEnabled:true}).allow,false);
 assert.equal(freeze('POST',path,{swapDirectRouteEnabled:true}).allow,false);
 for(const method of ['PUT','PATCH','DELETE'])assert.equal(freeze(method,path,directSwap).allow,false);
}
for(const path of ['/api/v1/manager/swap20/propose','/api/v1/manager/swap20/withdraw',
 '/api/v1/manager/swap20/commit','/api/v1/auditor/swap20/respond','/api/v1/manager/swap20/preview/'])
 assert.equal(freeze('POST',path,directSwap).allow,false);
const directSwapWrites={...directSwap,swapDirectWriteRoutesEnabled:true};
for(const path of ['/api/v1/manager/swap20/withdraw','/api/v1/manager/swap20/commit','/api/v1/auditor/swap20/respond']){
 assert.deepEqual(freeze('POST',path,directSwapWrites),{allow:true});
 assert.equal(freeze('POST',path,{swapDirectRouteEnabled:true,swapDirectWriteRoutesEnabled:true}).allow,false);
 assert.equal(freeze('PUT',path,directSwapWrites).allow,false);
}
assert.equal(freeze('POST','/api/v1/manager/swap20/preview/',directSwapWrites).allow,false);
assert.match(r15.slice(gatePos),/swapDirectWriteRoutesEnabled:process\.env\.AMS_SWAP20_DIRECT_WRITE_ROUTES_ENABLED==='true'/);
assert.match(r15.slice(gatePos),/swapDirectRouteEnabled:swap20DirectRouteEnabled/);

for(const path of ["/api/v1/manager/swap20/canonical-grid-dates","/api/v1/auditor/swap20/canonical-grid-dates","/api/v1/manager/swap20/list","/api/v1/auditor/swap20/list"]){
 assert.equal(freeze('POST',path,{atomicPlanningEnabled:true}).allow,true);
 assert.equal(freeze('POST',path).allow,false);
 assert.equal(freeze('PUT',path,directSwap).allow,false);
}
