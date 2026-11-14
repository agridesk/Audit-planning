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
console.log('DEV cutover write freeze: fail closed on all business methods and guard backfill PASS');
