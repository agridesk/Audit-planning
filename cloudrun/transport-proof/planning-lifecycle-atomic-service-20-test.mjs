import assert from 'node:assert/strict';
import {createPlanningLifecycleAtomicService} from './planning-lifecycle-atomic-service-20.js';
let lock=null,uncertain=0,writes=0,appendCount=0,failed=false,auditReadStarted=false,appendInspectStarted=false;
const headers=['Audit ID','Status','Assigned to','Planning JSON','Manager comment (last)'];
const sourceRow=['a1','Approved','aud@example.test','{}','existing note'];
const audit={revision:4,pendingOperationId:null,snapshot:{sourceRevision:'oldrev',headers,row:sourceRow}},outbox=new Map();
const state={
 async readAudit(){auditReadStarted=true;return structuredClone(audit);},
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
const snapshot={auditId:'a1',headers,row:['a1','Accepted','aud@example.test',JSON.stringify({blocks:[{date:'2027-02-01',start:'09:00',end:'10:00'}]}),'existing note'],status:'Accepted',assignedTo:'aud@example.test',sourceRevision:'newrev'};
const preview={success:true,authorityPreflight:true,auditId:'a1',expectedSourceRevision:'oldrev',sourceRowBefore:sourceRow.slice(),canonicalSnapshot:snapshot,projectionWrites:[{range:'Audit planning!A2:E2',values:[snapshot.row]}],projectionPreconditions:[{range:'Audit planning!A2:E2',before:sourceRow.slice()}],appendIntents:[{range:'Notification Queue!A:M',values:[['timestamp','PENDING','APPROVED']]}]};
const project={async apply(){if(failed)throw Error('PROJECTOR_TIMEOUT')},async inspect(){await Promise.resolve();assert.equal(appendInspectStarted,true,'row and append readbacks start together');return {state:'MATCH',detail:[{range:'Audit planning!A2:D2',target:true}]}}};
const append={async apply(){appendCount++},async inspect(){appendInspectStarted=true;return {state:'MATCH',count:1}}};
const service=createPlanningLifecycleAtomicService({atomicStore:state,gate,projector:project,appendProjector:append,preflight:async()=>{await Promise.resolve();assert.equal(auditReadStarted,true,'preflight and audit read start together');return preview},roster:async()=>[{auditorId:'uid1',email:'aud@example.test',role:'auditor'}]});
const req={actor:{role:'manager',auditorId:'manager1'},body:{auditId:'a1',expectedRevision:'oldrev'},action:'ACCEPT'};
preview.sourceRowBefore[4]='changed outside Firestore';
await assert.rejects(()=>service.commit(req),/LIFECYCLE_ATOMIC_CANONICAL_ROW_PARITY_CONFLICT/);
assert.equal(writes,0);assert.equal(lock,null);
preview.sourceRowBefore=sourceRow.concat('');
preview.canonicalSnapshot={...snapshot,headers:['Audit ID','Status','Assigned to','Planning JSON','Different field']};
await assert.rejects(()=>service.commit(req),/LIFECYCLE_ATOMIC_CANONICAL_ROW_PARITY_CONFLICT/);
assert.equal(writes,0);assert.equal(lock,null);
preview.canonicalSnapshot=snapshot;
let committedReceipt;
const first=await service.commit({...req,onCommitted(receipt){
 committedReceipt={...receipt,state:outbox.get(receipt.operationId)?.state,appendCount,gateHeld:Boolean(lock)};
 throw Error('BROWSER_CONNECTION_LOST');
}});
assert.equal(committedReceipt.state,'PENDING');
assert.equal(committedReceipt.status,'ACCEPTED');
assert.equal(committedReceipt.appendCount,0);
assert.equal(committedReceipt.gateHeld,true);
assert.equal(first.sourceRevision,'newrev');
assert.equal(first.success,true);assert.equal(writes,1);assert.equal(appendCount,1);assert.equal(lock,null);
assert.equal((await service.commit(req)).idempotent,true);
assert.equal(writes,1);
audit.snapshot.sourceRevision='newrev';preview.expectedSourceRevision='newrev';snapshot.sourceRevision='newrev2';failed=true;
await assert.rejects(()=>service.commit({...req,action:'APPROVE'}),error=>
 error.message==='PROJECTOR_TIMEOUT'&&error.writeOutcome==='COMMITTED'&&/^[a-f0-9]{64}$/.test(error.operationId));
assert.equal(uncertain,2);assert.equal(lock.state,'UNCERTAIN');
// Separate canonical fixture for auditor ACCEPT; other actions must remain forbidden.
const auditorState={revision:0,pendingOperationId:null,auditorId:'uid1',snapshot:{sourceRevision:'oldrev',status:'Approved',headers,row:sourceRow}};
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
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid2'},body:{auditId:'a1'},action:'ACCEPT'}),{message:'LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED',writeOutcome:'NOT_COMMITTED'});
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1'},action:'CANCEL'}),/LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED/);
assert.equal((await auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1'},action:'ACCEPT'})).success,true);
assert.equal(auditorWrites,1);assert.equal(storedOperation.auditorId,'uid1');
auditorState.snapshot={...auditorState.snapshot,sourceRevision:'oldrev2',status:'Pending Approval'};
auditorPreview.expectedSourceRevision='oldrev2';
auditorPreview.canonicalSnapshot={...snapshot,status:'Pending Planning',assignedTo:'',sourceRevision:'nextrev'};
assert.equal((await auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',action:'CANCEL'},action:'CANCEL'})).success,true);
assert.equal(storedOperation.action,'CANCEL');assert.equal(storedOperation.auditorId,null);
auditorState.snapshot={...auditorState.snapshot,sourceRevision:'oldrev3',status:'Accepted'};
auditorPreview.expectedSourceRevision='oldrev3';
auditorPreview.canonicalSnapshot={...snapshot,status:'Completed',assignedTo:'',sourceRevision:'newrev3'};
await assert.rejects(()=>auditorService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',action:'COMPLETE'},action:'COMPLETE'}),/LIFECYCLE_ATOMIC_MULTI_ENTITY_DELETE_NOT_MIGRATED/);
await assert.rejects(()=>auditorService.commit({actor:{role:'manager',auditorId:'manager1'},body:{auditId:'a1'},action:'REJECT'}),/LIFECYCLE_ATOMIC_MULTI_ENTITY_DELETE_NOT_MIGRATED/);
assert.equal(auditorWrites,2);
console.log('Lifecycle atomic service: source parity, Firestore commit, projection, replay and uncertainty passed');

// Speed: APPROVE/ACCEPT overlap the roster read with the preflight; CANCEL stays lazy.
let rosterCalls=0,rosterStartedBeforePreflightDone=false,preflightDone=false;
const prefetchState={revision:0,pendingOperationId:null,auditorId:'uid1',snapshot:{sourceRevision:'pre',status:'Approved',headers,row:sourceRow}};
const prefetchPreview={...preview,expectedSourceRevision:'pre',canonicalSnapshot:{...snapshot,sourceRevision:'pre-next'}};
let prefetchPreflightFails=false;
const prefetchService=createPlanningLifecycleAtomicService({
 atomicStore:{async readOutbox(){return null;},async readAudit(){return structuredClone(prefetchState);},async commit(){return {revision:1,replayed:false};},async markProjected(){}},
 gate:{async acquire(){return {token:'t'};},async release(){},async uncertain(){}},
 projector:{async apply(){},async inspect(){return {state:'MATCH',detail:[]}}},
 appendProjector:{async apply(){},async inspect(){return {state:'MATCH',count:1}}},
 preflight:async()=>{await new Promise(r=>setTimeout(r,5));preflightDone=true;if(prefetchPreflightFails)throw Error('PREFLIGHT_DOWN');return prefetchPreview;},
 roster:async()=>{rosterCalls++;if(!preflightDone)rosterStartedBeforePreflightDone=true;if(prefetchPreflightFails)throw Error('ROSTER_DOWN');return [{auditorId:'uid1',email:'aud@example.test',role:'auditor'}];}
});
assert.equal((await prefetchService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1'},action:'ACCEPT'})).success,true);
assert.equal(rosterCalls,1,'roster read once');assert.equal(rosterStartedBeforePreflightDone,true,'roster overlaps preflight');
rosterCalls=0;preflightDone=false;prefetchState.snapshot={...prefetchState.snapshot,status:'Pending Approval'};
prefetchPreview.canonicalSnapshot={...snapshot,status:'Pending Planning',assignedTo:'',sourceRevision:'pre-cancel'};
assert.equal((await prefetchService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',action:'CANCEL'},action:'CANCEL'})).success,true);
assert.equal(rosterCalls,0,'CANCEL does not spend a roster read');
let unhandled=0;const onUnhandled=()=>{unhandled++;};process.on('unhandledRejection',onUnhandled);
prefetchPreflightFails=true;preflightDone=false;prefetchState.snapshot={...prefetchState.snapshot,status:'Approved'};
await assert.rejects(()=>prefetchService.commit({actor:{role:'auditor',auditorId:'uid1'},body:{auditId:'a1',n:2},action:'ACCEPT'}),/PREFLIGHT_DOWN/);
await new Promise(r=>setTimeout(r,10));process.off('unhandledRejection',onUnhandled);
assert.equal(unhandled,0,'failed prefetch is not an unhandled rejection');