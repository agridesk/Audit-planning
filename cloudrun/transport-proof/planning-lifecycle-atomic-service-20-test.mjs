import assert from 'node:assert/strict';
import {createPlanningLifecycleAtomicService} from './planning-lifecycle-atomic-service-20.js';
let lock=null,uncertain=0,writes=0,appendCount=0,failed=false;
const audit={revision:4,pendingOperationId:null,snapshot:{sourceRevision:'oldrev'}},outbox=new Map();
const state={
 async readAudit(){return structuredClone(audit);},
 async readOutbox(id){return outbox.get(id)||null;},
 async commit(input){writes++;audit.revision++;audit.pendingOperationId=input.operationId;outbox.set(input.operationId,{auditId:input.auditId,actorId:input.actorId,action:input.action,state:'PENDING'});return {revision:audit.revision,replayed:false};},
 async markProjected({operationId}){if(failed)throw Error('PROJECTOR_TIMEOUT');outbox.get(operationId).state='PROJECTED';audit.pendingOperationId=null;},
 async markUncertain({operationId}){uncertain++;outbox.get(operationId).state='UNCERTAIN';}
};
const gate={
 async acquire(x){if(lock)throw Error('GATE_BUSY');lock={token:'fence',operationId:x.operationId};return lock;},
 async release(){lock=null;},
 async uncertain(){uncertain++;lock.state='UNCERTAIN';}
};
const snapshot={auditId:'a1',headers:['Audit ID','Status','Assigned to','Planning JSON'],row:['a1','Accepted','aud@example.test',JSON.stringify({blocks:[{date:'2027-02-01',start:'09:00',end:'10:00'}]})],status:'Accepted',assignedTo:'aud@example.test',sourceRevision:'newrev'};
const preview={success:true,authorityPreflight:true,auditId:'a1',expectedSourceRevision:'oldrev',canonicalSnapshot:snapshot,projectionWrites:[{range:'Audit planning!A2:D2',values:[snapshot.row]}],projectionPreconditions:[{range:'Audit planning!A2:D2',before:['a1','Approved','aud@example.test','{}']}],appendIntents:[{range:'Notification Queue!A:M',values:[['timestamp','PENDING','APPROVED']]}]};
const project={async apply(){if(failed)throw Error('PROJECTOR_TIMEOUT')},async inspect(){return {state:'MATCH',detail:[{range:'Audit planning!A2:D2',target:true}]}}};
const append={async apply(){appendCount++},async inspect(){return {state:'MATCH',count:1}}};
const service=createPlanningLifecycleAtomicService({atomicStore:state,gate,projector:project,appendProjector:append,preflight:async()=>preview,roster:async()=>[{auditorId:'uid1',email:'aud@example.test',role:'auditor'}]});
const req={actor:{role:'manager',auditorId:'manager1'},body:{auditId:'a1',expectedRevision:'oldrev'},action:'ACCEPT'};
const first=await service.commit(req);
assert.equal(first.success,true);assert.equal(writes,1);assert.equal(appendCount,1);assert.equal(lock,null);
assert.equal((await service.commit(req)).idempotent,true);
assert.equal(writes,1);
audit.snapshot.sourceRevision='newrev';preview.expectedSourceRevision='newrev';snapshot.sourceRevision='newrev2';failed=true;
await assert.rejects(()=>service.commit({...req,action:'APPROVE'}),/PROJECTOR_TIMEOUT/);
assert.equal(uncertain,2);assert.equal(lock.state,'UNCERTAIN');
// Separate canonical fixture for auditor ACCEPT; other actions must remain forbidden.
const auditorState={revision:0,pendingOperationId:null,auditorId:'uid1',snapshot:{sourceRevision:'oldrev',status:'Approved'}};
let auditorWrites=0,storedOperation=null;
const auditorStore={
 async readOutbox(){return null;},
 async readAudit(){return structuredClone(auditorState);},
 async commit(input){auditorWrites++;storedOperation=input;auditorState.revision++;return {revision:auditorState.revision,replayed:false};},
 async markProjected(){return {state:'PROJECTED'};}
};
const auditorGate={async acquire(){return {token:'accept-fence'};},async release(){},async uncertain(){}};
const auditorPreview={...preview,expectedSourceRevision:'oldrev',canonicalSnapshot:{...snapshot,sourceRevision:'auditor-accepted'}};
const auditorService=createPlanningLifecycleAtomicService({
 atomicStore:auditorStore,gate:auditorGate,projector:{async apply(){},async inspect(){return {state:'MATCH',detail:[]}}},
 appendProjector:{async apply(){},async inspect(){return {state:'MATCH',count:1}}},
 preflight:async()=>auditorPreview,roster:async()=>[{auditorId:'uid1',email:'aud@example.test',role:'auditor'}]
});
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid2'},body:{auditId:'a1'},action:'ACCEPT'}),/LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED/);
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1'},action:'CANCEL'}),/LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED/);
assert.equal((await auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1'},action:'ACCEPT'})).success,true);
assert.equal(auditorWrites,1);assert.equal(storedOperation.auditorId,'uid1');
auditorState.snapshot={sourceRevision:'oldrev2',status:'Pending Approval'};
auditorPreview.expectedSourceRevision='oldrev2';
auditorPreview.canonicalSnapshot={...snapshot,status:'Pending Planning',assignedTo:'',sourceRevision:'nextrev'};
assert.equal((await auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',action:'CANCEL'},action:'CANCEL'})).success,true);
assert.equal(storedOperation.action,'CANCEL');assert.equal(storedOperation.auditorId,null);
auditorState.snapshot={sourceRevision:'oldrev3',status:'Accepted'};
auditorPreview.expectedSourceRevision='oldrev3';
auditorPreview.canonicalSnapshot={...snapshot,status:'Completed',assignedTo:'',sourceRevision:'newrev3'};
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',action:'COMPLETE'},action:'COMPLETE'}),/LIFECYCLE_ATOMIC_MULTI_ENTITY_DELETE_NOT_MIGRATED/);
await assert.rejects(()=>auditorService.commit({actor:{role:'manager',auditorId:'manager1'},body:{auditId:'a1'},action:'REJECT'}),/LIFECYCLE_ATOMIC_MULTI_ENTITY_DELETE_NOT_MIGRATED/);
assert.equal(auditorWrites,2);
console.log('Lifecycle atomic service: source parity, Firestore commit, projection, replay and uncertainty passed');
