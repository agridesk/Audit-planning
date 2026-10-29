import assert from 'node:assert/strict';
import {createPlanningMultiLifecycleService} from './planning-multi-lifecycle-service-20.js';
import {createPlanningAtomicTransferService} from './planning-atomic-transfer-service-20.js';
import {createPlanningAtomicRecovery} from './planning-atomic-recovery-20.js';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';

// The same real service modules used by Cloud Run, with network-bound Firestore
// and Sheets adapters replaced by deterministic transport-only stand-ins.
const old=['A1','Accepted','aud-old','old-json'];
const complete=['A1','Completed','','old-json'];
const successor=['A2','Pending Planning','',''];
const tabRows=new Map([['Audit planning',new Map([[2,old]])],['Notification Queue',new Map([[1,['Time','Event']]])]]);
let rowWrites=0,appendWrites=0,expanded=0;
const result=data=>({ok:true,status:200,async json(){return structuredClone(data)}});
const sheetsFetch=async(url,opts={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname),method=opts.method||'GET';
 if(method==='GET'&&path.endsWith('/values:batchGet')){
  const data=u.searchParams.getAll('ranges').map(range=>{
   const match=/^([^!]+)![A-Z]+(\d+):[A-Z]+\d+$/.exec(range);
   const row=tabRows.get(match[1])?.get(Number(match[2]))||[];
   return {range,values:row.length?[row]:[]};
  });return result({valueRanges:data});
 }
 if(method==='GET'&&path.endsWith('/spreadsheets/simulator')){
  return result({sheets:[{properties:{title:'Audit planning',sheetId:1,gridProperties:{rowCount:5}}},{properties:{title:'Notification Queue',sheetId:2,gridProperties:{rowCount:100}}}]});
 }
 if(method==='POST'&&path.endsWith('/spreadsheets/simulator:batchUpdate')){expanded++;return result({});}
 if(method==='POST'&&path.endsWith('/values:batchUpdate')){
  for(const write of JSON.parse(opts.body).data){
   const match=/^([^!]+)![A-Z]+(\d+):/.exec(write.range);
   tabRows.get(match[1]).set(Number(match[2]),write.values[0]);rowWrites++;
  }
  return result({totalUpdatedRows:2});
 }
 if(method==='GET'&&path.includes('/values/')){
  const range=path.split('/values/')[1],sheet=range.split('!')[0];
  const rows=[...(tabRows.get(sheet)?.entries()||[])].sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  return result({values:rows});
 }
 if(method==='POST'&&path.endsWith(':append')){
  const sheet=path.split('/values/')[1].split('!')[0],map=tabRows.get(sheet)||new Map();
  for(const row of JSON.parse(opts.body).values){map.set(Math.max(0,...map.keys())+1,row);appendWrites++;}
  tabRows.set(sheet,map);return result({updates:{updatedRows:1}});
 }
 throw Error('SIMULATOR_UNEXPECTED_HTTP_'+method+'_'+path);
};
let holder=null;
const gate={
 async acquire({operationId}){if(holder)throw Error('GLOBAL_GATE_BUSY');holder={token:'gate-unique',operationId,state:'ACTIVE',acquiredAt:new Date().toISOString()};return structuredClone(holder);},
 async read(){return {holder:structuredClone(holder)};},
 async release({token,verified}){assert.equal(token,holder?.token);assert.equal(verified,true);holder=null;},
 async uncertain({token}){assert.equal(token,holder?.token);holder.state='UNCERTAIN';}
};
const verifyFence=async({operationId,gateToken})=>{
 if(holder?.token!==gateToken||holder?.operationId!==operationId||holder.state!=='ACTIVE')throw Error('FENCE_LOST');
};
const projector=createPlanningSheetsWritesetProjector({spreadsheetId:'simulator',getToken:async()=> 'token',fetchImpl:sheetsFetch,verifyFence});
const appendProjector=createPlanningSheetsAppendProjector({spreadsheetId:'simulator',getToken:async()=> 'token',fetchImpl:sheetsFetch,verifyFence});
const audits=new Map([['A1',{auditId:'A1',revision:2,snapshot:{auditId:'A1',status:'Accepted',sourceRevision:'rev-old'},auditorId:'uid-old',claimIds:[],pendingOperationId:null}]]);
const outboxes=new Map();let failAck=false;
const store={
 async readAudit(id){return structuredClone(audits.get(id)||null);},
 async readOutbox(id){return structuredClone(outboxes.get(id)||null);},
 async listOutbox(){return {entries:[...outboxes.values()].map(x=>structuredClone(x)),nextPageToken:null};},
 async commitMulti({operationId,actorId,action,entities,projectionPlan}){
  if(outboxes.has(operationId))throw Error('REPLAY_SHOULD_BE_HANDLED_BEFORE_COMMIT');
  const receipts=entities.map(e=>{
   const previous=audits.get(e.auditId);if(e.expectedRevision===null){if(previous)throw Error('SUCCESSOR_ALREADY_EXISTS');}
   else if(!previous||previous.revision!==e.expectedRevision||previous.pendingOperationId)throw Error('REVISION_CONFLICT');
   return {auditId:e.auditId,revision:(previous?.revision??-1)+1,removed:e.remove===true};
  });
  for(const entity of entities){
   const receipt=receipts.find(x=>x.auditId===entity.auditId);
   audits.set(entity.auditId,{auditId:entity.auditId,revision:receipt.revision,snapshot:entity.nextSnapshot,
    auditorId:entity.auditorId||null,claimIds:[],pendingOperationId:operationId,removed:!!entity.remove});
  }
  outboxes.set(operationId,{operationId,auditId:entities[0].auditId,actorId,action,state:'PENDING',multi:true,entities:receipts,snapshot:projectionPlan});
  return {operationId,replayed:false,entities:receipts};
 },
 async markUncertain({operationId}){const out=outboxes.get(operationId);out.state='UNCERTAIN';},
 async markProjected({auditId,operationId,proof}){
  if(failAck){failAck=false;throw Error('SIMULATED_ACK_LOSS');}
  assert.equal(proof.verified,true);assert.equal(outboxes.get(operationId).auditId,auditId);
  const out=outboxes.get(operationId);out.state='PROJECTED';
  for(const e of out.entities)audits.get(e.auditId).pendingOperationId=null;
 }
};
const plan={auditId:'A1',sourceRevision:'rev-done',status:'Completed',assignedTo:'',
 projectionWrites:[{range:'Audit planning!A2:D2',values:[complete]},{range:'Audit planning!A10:D10',values:[successor]}],
 projectionPreconditions:[{range:'Audit planning!A2:D2',before:old},{range:'Audit planning!A10:D10',before:[]}],
 appendIntents:[{range:'Notification Queue!A:M',values:[['now','COMPLETE','A1']]}]
};
const preview={success:true,authorityPreflight:true,auditId:'A1',expectedSourceRevision:'rev-old',
 removedSourceRows:[{sheetTitle:'Audit planning',rowNumber:2}],canonicalSnapshot:plan,
 successorSnapshots:[{auditId:'A2',status:'Pending Planning',assignedTo:'',sourceRevision:'rev-child'}],
 ...plan};
const service=createPlanningMultiLifecycleService({atomicStore:store,gate,projector,appendProjector,preflight:async()=>preview});
const request={actor:{role:'manager',auditorId:'manager'},body:{auditId:'A1',auditHours:4},action:'COMPLETE'};
failAck=true;
await assert.rejects(()=>service.commit(request),/SIMULATED_ACK_LOSS/);
assert.equal(holder.state,'UNCERTAIN');
assert.equal((await store.readAudit('A1')).pendingOperationId!==null,true);
assert.equal((await store.readAudit('A2')).pendingOperationId!==null,true);
assert.equal((await projector.inspect(plan)).state,'MATCH');
assert.equal((await appendProjector.inspect(plan.appendIntents)).state,'MATCH');
const writesBeforeRecovery=rowWrites,appendsBeforeRecovery=appendWrites;
const recovery=createPlanningAtomicRecovery({store,projector,appendProjector,gate});
const scanned=await recovery.scan();
assert.equal(scanned.recovered,1);
assert.equal(holder,null);
assert.equal((await store.readAudit('A1')).pendingOperationId,null);
assert.equal((await store.readAudit('A2')).pendingOperationId,null);
assert.equal((await service.commit(request)).replayed,true);
assert.equal(rowWrites,writesBeforeRecovery);
assert.equal(appendWrites,appendsBeforeRecovery);
assert.equal(expanded,1);
console.log('E2E: atomic Complete + successor, verified Sheets + notification, lost ACK, crash recovery and zero duplicate replay passed');
