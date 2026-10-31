import assert from 'node:assert/strict';
import {createPlanningFirestoreAuthority} from './planning-firestore-authority-20.js';
import {createPlanningSheetsProjector} from './planning-sheets-projector-20.js';
const docs=new Map();
const adapter={
 async read(id){return structuredClone(docs.get(id)??null);},
 async compareAndSwap(id,expected,next){if((docs.get(id)?.version??0)!==expected)return false;docs.set(id,structuredClone(next));return true;}
};
const authority=createPlanningFirestoreAuthority(adapter);
let actual='ABSENT',writes=0,fenced=0,unknown=false;
const projector=createPlanningSheetsProjector({
 authority,
 inspect:async()=>({state:actual}),
 apply:async({operationId})=>{writes++;if(unknown)throw Error('NETWORK_TIMEOUT');actual='MATCH';return {operationId,idempotent:true};},
 fence:async(_key,fn)=>{fenced++;return fn();}
});
const req={auditId:'audit-P0',auditorId:'auditor-P0',actorId:'manager',sourceRevision:'r1',requestId:'req-P0',blocks:[{date:'2027-01-05',start:'08:00',end:'11:00'}]};
const payload={auditId:req.auditId,blocks:req.blocks,sourceRevision:req.sourceRevision,auditorEmail:'audit@example.test'};
const first=(await authority.stage({...req,projectionPayload:payload})).commit;
assert.deepEqual(await projector.reconcile({auditId:req.auditId,commitId:first.id}),{state:'PROJECTED',recovered:false});
assert.equal(writes,1);
assert.deepEqual(await projector.reconcile({auditId:req.auditId,commitId:first.id}),{state:'PROJECTED',replayed:true});
assert.equal(writes,1);
const second=(await authority.stage({...req,sourceRevision:'r2',requestId:'req-P1',projectionPayload:{...payload,sourceRevision:'r2'}})).commit;
actual='MATCH';
assert.deepEqual(await projector.reconcile({auditId:req.auditId,commitId:second.id}),{state:'PROJECTED',recovered:true});
assert.equal(writes,1);
const third=(await authority.stage({...req,sourceRevision:'r3',requestId:'req-P2',projectionPayload:{...payload,sourceRevision:'r3'}})).commit;
actual='CONFLICT';
await assert.rejects(()=>projector.reconcile({auditId:req.auditId,commitId:third.id}),/PROJECTOR_CANONICAL_CONFLICT/);
actual='ABSENT';unknown=true;
await assert.rejects(()=>projector.reconcile({auditId:req.auditId,commitId:third.id}),/PROJECTOR_WRITE_UNKNOWN/);
assert.equal((await authority.pending(req.auditId))[0].state,'UNCERTAIN');
unknown=false;
await assert.rejects(()=>projector.reconcile({auditId:req.auditId,commitId:third.id}),/PROJECTOR_UNCERTAIN_REQUIRES_EVIDENCE/);
assert.equal(writes,2);
actual='MATCH';
assert.deepEqual(await projector.reconcile({auditId:req.auditId,commitId:third.id}),{state:'PROJECTED',recovered:true});
assert.equal(writes,2);
assert.ok(fenced>=5);
console.log('Planning Sheets projector: idempotency, recovery, conflict, timeout and fencing contracts passed');
