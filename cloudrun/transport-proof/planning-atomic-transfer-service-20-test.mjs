import assert from 'node:assert/strict';
import {createPlanningAtomicTransferService} from './planning-atomic-transfer-service-20.js';
let fence=null,writes=0,projected=0,uncertain=0,fail=false,holder='old-auditor';
const previous={revision:7,snapshot:{sourceRevision:'old-revision'},pendingOperationId:null,auditorId:'aud-old'};
const outbox=new Map();
const store={
 async readAudit(){return previous;},
 async readOutbox(key){return outbox.get(key)||null;},
 async commitMulti(args){writes++;holder=args.entities[0].auditorId;outbox.set(args.operationId,{actorId:args.actorId,action:'TRANSFER',auditId:'A1',state:'PENDING'});return {replayed:false};},
 async markProjected(args){projected++;outbox.get(args.operationId).state='PROJECTED';},
 async markUncertain(args){uncertain++;outbox.get(args.operationId).state='UNCERTAIN';}
};
const gate={
 async acquire(x){if(fence)throw Error('BUSY');fence={token:'gate-token',operationId:x.operationId};return fence;},
 async release(){fence=null;},
 async uncertain(){uncertain++;fence.state='UNCERTAIN';}
};
const preview={success:true,authorityPreflight:true,action:'TRANSFER',auditId:'A1',fromEmail:'old@example.test',toEmail:'new@example.test',expectedSourceRevision:'old-revision',
 canonicalSnapshot:{auditId:'A1',status:'Pending Approval',assignedTo:'',sourceRevision:'new-revision'},
 projectionWrites:[{range:'Audit planning!A2:B2',values:[['A1','Pending Approval']]}],
 projectionPreconditions:[{range:'Audit planning!A2:B2',before:['A1','Accepted']}],
 appendIntents:[{range:'Diagnostics_Log!A:K',values:[['today','TRANSFER','A1']]}]};
const projector={async apply(){if(fail)throw Error('SHEETS_TIMEOUT');},async inspect(){return {state:'MATCH',detail:[]}}};
const appendProjector={async apply(){},async inspect(){return {state:'MATCH',count:1}}};
const service=createPlanningAtomicTransferService({store,gate,projector,appendProjector,preflight:async()=>preview});
const actor={role:'manager',auditorId:'manager-1'},body={auditId:'A1',fromEmail:'old@example.test',toEmail:'new@example.test'};
const result=await service.commit({actor,body});
assert.equal(result.success,true);assert.equal(result.status,'Pending Approval');assert.equal(holder,null);assert.equal(projected,1);
assert.equal((await service.commit({actor,body})).idempotent,true);assert.equal(writes,1);
previous.snapshot.sourceRevision='new-parent-revision';preview.expectedSourceRevision='new-parent-revision';fail=true;
await assert.rejects(()=>service.commit({actor,body:{...body,reason:'another transfer'}}),/SHEETS_TIMEOUT/);
assert.equal(fence.state,'UNCERTAIN');assert.ok(uncertain>=2);
await assert.rejects(()=>service.commit({actor:{role:'auditor',auditorId:'aud-old'},body}),/TRANSFER_ATOMIC_REQUEST_FORBIDDEN/);
console.log('Atomic transfer: revocation, confirmed project, replay, timeout fence and role restrictions OK');
