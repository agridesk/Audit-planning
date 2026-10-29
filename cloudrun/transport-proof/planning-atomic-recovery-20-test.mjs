import assert from 'node:assert/strict';
import {createPlanningAtomicRecovery} from './planning-atomic-recovery-20.js';
const e={auditId:'a1',operationId:'op1',revision:1,state:'UNCERTAIN',auditorId:'uid1',snapshot:{projectionWrites:[{range:'Audit planning!A2:C2',values:[['a','b','c']]}],projectionPreconditions:[{range:'Audit planning!A2:C2',before:['a','b','d']}],appendIntents:[{range:'Notification Queue!A:M',values:[['2026','PENDING']]}]}};
let matched=true,gateState='UNCERTAIN',settled=0,released=0,leaseReleased=0;
const store={async listOutbox(){return {entries:[e],nextPageToken:null}},async readAudit(){return {revision:1,pendingOperationId:'op1'}},async markProjected(){settled++;}};
const projector={async inspect(){return {state:matched?'MATCH':'READY',detail:[{target:matched}]}}},appendProjector={async inspect(){return {state:'MATCH',count:1}}};
const gate={async read(){return {holder:gateState?{token:'t1',operationId:'op1',state:gateState,acquiredAt:new Date(Date.now()-(gateState==='ACTIVE'?5:31)*60*1000).toISOString()}:null}},async release(){released++;gateState=null;}};
const availabilityService={async read(){return {planningLease:{token:'lease1',state:'UNCERTAIN',auditId:'a1'}}},async reconcilePlanningLease(){leaseReleased++}};
const recovery=createPlanningAtomicRecovery({store,projector,appendProjector,gate,availabilityService});
matched=false;
assert.equal((await recovery.scan()).unresolved,1);assert.equal(settled,0);
matched=true;gateState='ACTIVE';
assert.equal((await recovery.scan()).errors,1);assert.equal(settled,0);
gateState='UNCERTAIN';
assert.equal((await recovery.scan()).recovered,1);
assert.equal(settled,1);assert.equal(released,1);assert.equal(leaseReleased,1);
assert.equal(gateState,null);
await assert.rejects(()=>recovery.scan({limit:0}),/ATOMIC_RECOVERY_LIMIT_INVALID/);
// Crash after Firestore PROJECTED but before gate.release must not freeze all
// later writes, nor should it mutate an already settled receipt again.
let postAckRelease=0,postAckSettle=0;
const projected={...e,state:'PROJECTED'};
let projectedGate={token:'settled-gate',operationId:'op1',state:'UNCERTAIN',acquiredAt:new Date(Date.now()-3600000).toISOString()};
const settledRecovery=createPlanningAtomicRecovery({
 store:{
  async listOutbox(){return {entries:[projected],nextPageToken:null};},
  async readAudit(){return {revision:1,pendingOperationId:null,lastProjectedOperationId:'op1'};},
  async markProjected(){postAckSettle++;throw Error('NO_DOUBLE_SETTLEMENT');}
 },
 projector,appendProjector,
 gate:{
  async read(){return {holder:projectedGate};},
  async release({verified}){assert.equal(verified,true);postAckRelease++;projectedGate=null;}
 }
});
assert.equal((await settledRecovery.scan()).recovered,1);
assert.equal(postAckRelease,1);assert.equal(postAckSettle,0);
assert.equal((await settledRecovery.scan()).recovered,0);
console.log('Atomic recovery: no blind retries, verified projection and uncertain fence release passed');
