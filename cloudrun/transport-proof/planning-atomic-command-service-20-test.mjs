import assert from 'node:assert/strict';
import {createPlanningAtomicCommandService} from './planning-atomic-command-service-20.js';
let activeLease=null,activeGate=null,writeCount=0,uncertain=0,preflightCalls=0,failAt='';
const outbox=new Map(),audit={revision:0,snapshot:{sourceRevision:'r1'},pendingOperationId:null},blocks=[{date:'2027-03-01',start:'09:00',end:'10:00'}];
const store={
 async readOutbox(id){return structuredClone(outbox.get(id)||null);},
 async readAudit(){return structuredClone(audit);},
 async commit(x){writeCount++;if(failAt==='commit')throw Error('TIMEOUT');audit.revision=1;audit.pendingOperationId=x.operationId;outbox.set(x.operationId,{auditId:x.auditId,actorId:x.actorId,state:'PENDING'});return {revision:1,replayed:false};},
 async markProjected(x){if(failAt==='markProjected')throw Error('TIMEOUT');outbox.get(x.operationId).state='PROJECTED';audit.pendingOperationId=null;return {state:'PROJECTED'};},
 async markUncertain(x){uncertain++;outbox.get(x.operationId).state='UNCERTAIN';}
};
const availability={
 async acquirePlanningLease(){if(activeLease)throw Error('LEASE_BUSY');activeLease={token:'lease-1',document:{}};return activeLease;},
 async releasePlanningLease(){activeLease=null;},
 async markPlanningLeaseUncertain(){uncertain++;activeLease.state='UNCERTAIN';}
};
const gate={
 async acquire(x){if(activeGate)throw Error('GATE_BUSY');activeGate={token:'gate-1',operationId:x.operationId};return activeGate;},
 async release(){activeGate=null;},
 async uncertain(){uncertain++;activeGate.state='UNCERTAIN';}
};
const preview={success:true,authorityPreflight:true,auditId:'audit-1',expectedSourceRevision:'r1',canonicalSnapshot:{auditId:'audit-1',sourceRevision:'r2'},projectionWrites:[{range:'Audit planning!A2:B2',values:[['a','b']]}],projectionPreconditions:[{range:'Audit planning!A2:B2',before:['a','a']}],notificationIntents:[['2026-10-29','PENDING','PLANNED','','audit-1']]};
const projector={async apply(){if(failAt==='projection')throw Error('TIMEOUT');return {projected:true};},async inspect(){return {state:'MATCH',detail:[{range:'Audit planning!A2:B2',target:true}]};}};
const appendProjector={async apply(){if(failAt==='append')throw Error('APPEND_TIMEOUT');return {confirmed:true};},async inspect(){return {state:'MATCH',count:1};}};
const service=createPlanningAtomicCommandService({atomicStore:store,gate,availabilityService:availability,hardGate:()=>{},preflight:async()=>{preflightCalls++;return preview;},projector,appendProjector,roster:async()=>[{role:'auditor',email:'auditor@example.test',auditorId:'uid-1'}]});
const actor={role:'manager',auditorId:'manager-1'},body={auditId:'audit-1',auditorEmail:'auditor@example.test',sourceRevision:'r1',blocks};
const receipt=await service.commit({actor,body});
assert.equal(receipt.success,true);assert.equal(receipt.projection,'PROJECTED');
assert.equal(writeCount,1);assert.equal(activeGate,null);assert.equal(activeLease,null);
assert.equal((await service.commit({actor,body})).idempotent,true);
assert.equal(writeCount,1);assert.equal(preflightCalls,1);
audit.revision=1;audit.snapshot.sourceRevision='r2';preview.expectedSourceRevision='r2';preview.canonicalSnapshot.sourceRevision='r3';
failAt='projection';
await assert.rejects(()=>service.commit({actor,body:{...body,sourceRevision:'r2'}}),/TIMEOUT/);
assert.equal(uncertain,3);assert.equal(activeLease.state,'UNCERTAIN');assert.equal(activeGate.state,'UNCERTAIN');
assert.equal(writeCount,2);
console.log('Atomic command: Firestore commit before projection, replay and conservative timeout fencing passed');
