import assert from 'node:assert/strict';
import {createPlanningAtomicRecovery} from './planning-atomic-recovery-20.js';
const e={auditId:'a1',operationId:'op1',revision:1,state:'UNCERTAIN',auditorId:'uid1',snapshot:{projectionWrites:[{range:'Audit planning!A2:C2',values:[['a','b','c']]}],projectionPreconditions:[{range:'Audit planning!A2:C2',before:['a','b','d']}],appendIntents:[{range:'Notification Queue!A:M',values:[['2026','PENDING']]}]}};
let matched=true,gateState='UNCERTAIN',settled=0,released=0,leaseReleased=0;
const store={async listOutbox(){return {entries:[e],nextPageToken:null}},async readAudit(){return {revision:1,pendingOperationId:'op1'}},async markProjected(){settled++;}};
const projector={async inspect(){return {state:matched?'MATCH':'READY',detail:[{target:matched}]}}},appendProjector={async inspect(){return {state:'MATCH',count:1}}};
const gate={async read(){return {holder:gateState?{token:'t1',operationId:'op1',state:gateState,acquiredAt:new Date(Date.now()-(gateState==='ACTIVE'?5:31)*60*1000).toISOString(),uncertainAt:new Date(Date.now()-31*60*1000).toISOString()}:null}},async release(){released++;gateState=null;}};
const availabilityService={async read(){return {planningLease:{token:'lease1',state:'UNCERTAIN',auditId:'a1',uncertainAt:new Date(Date.now()-31*60*1000).toISOString()}}},async reconcilePlanningLease(){leaseReleased++}};
const recovery=createPlanningAtomicRecovery({store,projector,appendProjector,gate,availabilityService});
matched=false;
assert.equal((await recovery.scan()).unresolved,1);assert.equal(settled,0);
matched=true;gateState='ACTIVE';
assert.equal((await recovery.scan()).errors,1);assert.equal(settled,0);
// An orphaned ACTIVE writer cannot be proven dead by wall-clock age alone.
const veryOldActive=createPlanningAtomicRecovery({
 store,projector,appendProjector,
 gate:{async read(){return {holder:{token:'old',operationId:'op1',state:'ACTIVE',acquiredAt:new Date(Date.now()-48*3600000).toISOString()}};}}
});
assert.equal((await veryOldActive.scan()).errors,1);
assert.equal(settled,0);
gateState='UNCERTAIN';
const gateFresh={state:'UNCERTAIN',uncertainAt:new Date().toISOString()};
const freshRecovery=createPlanningAtomicRecovery({
 store,projector,appendProjector,
 gate:{async read(){return {holder:{token:'fresh',operationId:'op1',acquiredAt:new Date(Date.now()-3600000).toISOString(),...gateFresh}};}}
});
assert.equal((await freshRecovery.scan()).errors,1);
assert.equal(settled,0);
assert.equal((await recovery.scan()).recovered,1);
assert.equal(settled,1);assert.equal(released,1);assert.equal(leaseReleased,1);
assert.equal(gateState,null);
await assert.rejects(()=>recovery.scan({limit:0}),/ATOMIC_RECOVERY_LIMIT_INVALID/);
// Crash after Firestore PROJECTED but before gate.release must not freeze all
// later writes, nor should it mutate an already settled receipt again.
let postAckRelease=0,postAckSettle=0;
const projected={...e,state:'PROJECTED'};
let projectedGate={token:'settled-gate',operationId:'op1',state:'UNCERTAIN',uncertainAt:new Date(Date.now()-3600000).toISOString(),acquiredAt:new Date(Date.now()-3600000).toISOString()};
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
// Uncertain gate without its transition timestamp is not safe to release:
let legacyReleased=0;
const unknownAge=createPlanningAtomicRecovery({
 store,projector,appendProjector,
 gate:{async read(){return {holder:{token:'legacy',operationId:'op1',state:'UNCERTAIN',acquiredAt:new Date(Date.now()-86400000).toISOString()}};},
 async release(){legacyReleased++;}}
});
assert.equal((await unknownAge.scan()).errors,1);
assert.equal(legacyReleased,0);
// Fairness: 100 already settled receipts in the first page must not starve
// an uncertain operation on the following page across periodic scans.
const seenTokens=[],scannedBatches=[];
const fairness=createPlanningAtomicRecovery({
 store:{
  async listOutbox({pageToken}){seenTokens.push(pageToken);return pageToken?{entries:[e],nextPageToken:null}:{entries:[{...e,operationId:'already',state:'PROJECTED'}],nextPageToken:'page-2'};},
  async readAudit(){return {revision:1,pendingOperationId:'op1'};},
  async markProjected(){scannedBatches.push('SETTLED');}
 },
 projector,appendProjector,
 gate:{async read(){return {holder:null}}}
});
assert.equal((await fairness.scan({limit:1})).truncated,true);
assert.equal((await fairness.scan({limit:1})).truncated,false);
assert.deepEqual(seenTokens,['','page-2']);
assert.equal(scannedBatches.length,0); // missing fence forbids settling PENDING
assert.equal((await fairness.scan({limit:1})).truncated,true);
// After Firestore settlement and global-fence release, a failed auditor lease
// cleanup must still be discoverable and retried without re-projecting writes.
let orphanReconciled=0;
const orphanRecovery=createPlanningAtomicRecovery({
 store:{
  async listOutbox(){return {entries:[projected],nextPageToken:null};},
  async readAudit(){return {revision:1,lastProjectedOperationId:'op1',pendingOperationId:null};},
  async markProjected(){throw Error('NO_SECOND_SETTLEMENT');}
 },
 projector,appendProjector,
 gate:{async read(){return {holder:null};}},
 availabilityService:{
  async read(){return {planningLease:{token:'orphan',auditId:'a1',state:'UNCERTAIN',uncertainAt:new Date(Date.now()-31*60*1000).toISOString()}};},
  async reconcilePlanningLease({verifiedProjectionProof}){assert.match(verifiedProjectionProof,/^[0-9a-f]{64}$/);orphanReconciled++;}
 }
});
assert.equal((await orphanRecovery.scan()).recovered,1);
assert.equal(orphanReconciled,1);
console.log('Atomic recovery: no blind retries, verified projection and uncertain fence release passed');
