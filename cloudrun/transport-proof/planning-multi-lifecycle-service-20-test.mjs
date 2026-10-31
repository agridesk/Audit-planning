import assert from 'node:assert/strict';
import {createPlanningMultiLifecycleService} from './planning-multi-lifecycle-service-20.js';
let held=null,commits=0,settled=0,rows=0,appends=0,uncertain=0,failProjection=false;
const pending=new Map(),parent={revision:5,pendingOperationId:null,snapshot:{sourceRevision:'rev-old',status:'Accepted'}};
const store={
 async readOutbox(id){return pending.get(id)||null;},
 async readAudit(id){return id==='parent'?structuredClone(parent):null;},
 async commitMulti(args){
  commits++;parent.pendingOperationId=args.operationId;
  pending.set(args.operationId,{auditId:'parent',actorId:'manager',action:args.action,state:'PENDING'});
  return {replayed:false,state:'PENDING',entities:args.entities.map(x=>({auditId:x.auditId,revision:x.expectedRevision===null?0:x.expectedRevision+1}))};
 },
 async markProjected({operationId}){settled++;parent.pendingOperationId=null;pending.get(operationId).state='PROJECTED';},
 async markUncertain({operationId}){uncertain++;pending.get(operationId).state='UNCERTAIN';}
};
const gate={
 async acquire({operationId}){if(held)throw Error('BUSY');held={token:'fence',operationId};return held;},
 async release(){held=null;},
 async uncertain(){uncertain++;held.state='UNCERTAIN';}
};
const row={auditId:'parent',status:'Completed',sourceRevision:'rev-new'};
const child={auditId:'successor',status:'Pending Planning',assignedTo:'',sourceRevision:'rev-child'};
const preview={success:true,authorityPreflight:true,auditId:'parent',expectedSourceRevision:'rev-old',removedSourceRows:[{sheetTitle:'Audit planning',rowNumber:2}],canonicalSnapshot:row,
 successorSnapshots:[child],projectionWrites:[{range:'Audit planning!A2:B2',values:[['parent','Completed']]}],
 projectionPreconditions:[{range:'Audit planning!A2:B2',before:['parent','Accepted']}],
 appendIntents:[{range:'Notification Queue!A:M',values:[['now','AUDIT_TRAIL','COMPLETE']]}]
};
const projector={async apply(){rows++;if(failProjection)throw Error('PROJECTION_TIMEOUT');},async inspect(){return {state:'MATCH',detail:[{target:true}]}}};
const appendProjector={async apply(){appends++;},async inspect(){return {state:'MATCH',count:1}}};
const svc=createPlanningMultiLifecycleService({atomicStore:store,gate,projector,appendProjector,preflight:async()=>preview});
const actor={role:'manager',auditorId:'manager'},body={auditId:'parent',reason:'test'};
const first=await svc.commit({actor,body,action:'COMPLETE'});
assert.equal(first.success,true);assert.deepEqual(first.successorAuditIds,['successor']);
assert.equal(commits,1);assert.equal(rows,1);assert.equal(appends,1);assert.equal(settled,1);assert.equal(held,null);
assert.equal((await svc.commit({actor,body,action:'COMPLETE'})).replayed,true);
assert.equal(commits,1);
parent.snapshot.sourceRevision='rev2';preview.expectedSourceRevision='rev2';
preview.canonicalSnapshot={auditId:'parent',status:'Rejected',sourceRevision:'rev3'};
preview.successorSnapshots=[];
const rejected=await svc.commit({actor,body:{...body,action:'reject'},action:'REJECT'});
assert.equal(rejected.action,'REJECT');assert.equal(rejected.successorAuditIds.length,0);
parent.snapshot.sourceRevision='rev4';preview.expectedSourceRevision='rev4';
preview.canonicalSnapshot={auditId:'parent',status:'Completed',sourceRevision:'rev5'};
preview.successorSnapshots=[child];failProjection=true;
await assert.rejects(()=>svc.commit({actor,body:{...body,action:'complete-2'},action:'COMPLETE'}),/PROJECTION_TIMEOUT/);
assert.equal(held.state,'UNCERTAIN');assert.ok(uncertain>=2);
await assert.rejects(()=>svc.commit({actor:{role:'auditor',auditorId:'wrong'},body,action:'REJECT'}),/PLANNING_MULTI_ACTION_FORBIDDEN/);
console.log('Multi lifecycle: completion successor, reject, replay and unknown Sheets outcome OK');
