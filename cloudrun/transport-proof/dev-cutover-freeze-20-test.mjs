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
 '/api/v1/planning/direct-commit','/api/v1/planning/visit-composition-atomic','/api/v1/planning/atomic-recover']){
 assert.deepEqual(freeze('POST',path,{atomicPlanningEnabled:true}),{allow:true,atomicOwned:true});
 for(const method of ['PUT','PATCH','DELETE'])assert.equal(freeze(method,path,{atomicPlanningEnabled:true}).allow,false);
}
for(const path of ['/api/v1/planning/atomic-backfill','/api/v1/manager/extension-direct',
 '/api/v1/manager/swap20/propose','/api/v1/manager/scopes/bootstrap-v1']){
 assert.equal(freeze('POST',path,{atomicPlanningEnabled:true,backfillWriteEnabled:true,legacyWritersFrozen:true}).allow,false);
}
assert.match(r15,/atomicPlanningEnabled:planningAtomicEnabled/);
console.log('DEV cutover write freeze: fail closed on all business methods and guard backfill PASS');
