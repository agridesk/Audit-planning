import assert from 'node:assert/strict';
import {createPlanningAtomicFirestoreStore} from './planning-atomic-firestore-store-20.js';
const store=new Map(),db='https://firestore.googleapis.com/v1/projects/audit-management-system-dev/databases/(default)/documents';
let clock=0,failCommit=false,conflict=false;
const copy=v=>structuredClone(v);
const encode=v=>{
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='number')return {integerValue:String(v)};
 if(typeof v==='boolean')return {booleanValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
};
const decode=v=>'nullValue'in v?null:'stringValue'in v?v.stringValue:'integerValue'in v?Number(v.integerValue):'booleanValue'in v?v.booleanValue:'arrayValue'in v?(v.arrayValue.values||[]).map(decode):Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
const response=(status,json)=>({ok:status>=200&&status<300,status,async json(){return copy(json)}});
const fetchImpl=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname),method=init.method||'GET';
 if(path.endsWith('/documents:beginTransaction'))return response(200,{transaction:'test-transaction'});
 if(path.endsWith('/documents:commit')){
  if(failCommit)throw Error('NETWORK_TIMEOUT');
  const input=JSON.parse(init.body);
  if(conflict){conflict=false;return response(409,{error:'ABORTED'});}
  const writes=input.writes;
  for(const w of writes){
   const name=w.update?.name||w.delete,key=name.slice(db.length+1),existing=store.get(key),p=w.currentDocument;
   if(p?.exists===false&&existing||p?.updateTime&&p.updateTime!==existing?.updateTime)return response(409,{error:'ABORTED'});
  }
  for(const w of writes){
   const name=w.update?.name||w.delete,key=name.slice(db.length+1);
   if(w.delete)store.delete(key);
   else store.set(key,{name,updateTime:'t'+(++clock),fields:copy(w.update.fields)});
  }
  return response(200,{commitTime:'2026-10-29T12:00:00Z',writeResults:writes.map(()=>({updateTime:'t'+clock}))});
 }
 if(method==='GET'){
  const key=path.split('/documents/')[1],existing=store.get(key);
  return existing?response(200,existing):response(404,{});
 }
 throw Error('MOCK_HTTP_METHOD');
};
const authority=createPlanningAtomicFirestoreStore({projectId:'audit-management-system-dev',getToken:async()=> 'token',fetchImpl});
const auditId='A1';
store.set('ams_planning_20_dev_audits/'+auditId,{name:db+'/ams_planning_20_dev_audits/'+auditId,updateTime:'t0',fields:{payload:encode({auditId,revision:0,snapshot:{auditId,status:'Pending Planning'},claimIds:[],pendingOperationId:null})}});
const body={auditId,operationId:'op-one',actorId:'manager',expectedRevision:0,nextSnapshot:{auditId,status:'Approved',scope:'GAP'},auditorId:'aud-1',blocks:[{date:'2027-03-02',start:'09:00',end:'10:00'}],action:'APPROVE'};
await assert.rejects(()=>authority.commit({...body,operationId:'op-unknown',expectedRevision:1}),/PLANNING_CANONICAL_REVISION_CONFLICT/);
const committed=await authority.commit(body);
assert.equal(committed.state,'PENDING');assert.equal(committed.revision,1);assert.equal(committed.claimCount,4);
assert.equal((await authority.readAudit(auditId)).pendingOperationId,'op-one');
assert.equal((await authority.readOutbox('op-one')).snapshot.status,'Approved');
assert.equal((await authority.commit(body)).replayed,true);
await assert.rejects(()=>authority.commit({...body,operationId:'op-two',expectedRevision:1}),/PLANNING_PREVIOUS_PROJECTION_UNRESOLVED/);
await authority.markUncertain({auditId,operationId:'op-one',reason:'TIMEOUT'});
assert.equal((await authority.readOutbox('op-one')).state,'UNCERTAIN');
await assert.rejects(()=>authority.markProjected({auditId,operationId:'op-one',proof:{verified:true,auditId,rowHash:'bad'}}),/PLANNING_PROJECTION_EVIDENCE_REQUIRED/);
const proof={verified:true,auditId,rowHash:'a'.repeat(64)};
assert.equal((await authority.markProjected({auditId,operationId:'op-one',proof})).state,'PROJECTED');
assert.equal((await authority.markProjected({auditId,operationId:'op-one',proof})).replayed,true);
await assert.rejects(()=>authority.markProjected({auditId,operationId:'op-one',proof:{...proof,rowHash:'b'.repeat(64)}}),/PLANNING_PROJECTION_PROOF_CONFLICT/);
const other='A2';store.set('ams_planning_20_dev_audits/'+other,{name:db+'/ams_planning_20_dev_audits/'+other,updateTime:'t0',fields:{payload:encode({auditId:other,revision:0,snapshot:{auditId:other},claimIds:[],pendingOperationId:null})}});
await assert.rejects(()=>authority.commit({...body,auditId:other,operationId:'op-other',nextSnapshot:{auditId:other},expectedRevision:0}),/PLANNING_SLOT_ALREADY_CLAIMED/);
conflict=true;
await assert.rejects(()=>authority.commit({...body,operationId:'op-two',expectedRevision:1,nextSnapshot:{auditId,status:'Accepted'}}),/PLANNING_TRANSACTION_CONFLICT/);
failCommit=true;
await assert.rejects(()=>authority.commit({...body,operationId:'op-two',expectedRevision:1,nextSnapshot:{auditId,status:'Accepted'}}),/PLANNING_FIRESTORE_COMMIT_OUTCOME_UNKNOWN/);
failCommit=false;
const second=await authority.commit({...body,operationId:'op-two',expectedRevision:1,nextSnapshot:{auditId,status:'Accepted'},blocks:[],auditorId:null,action:'CANCEL'});
assert.equal(second.claimCount,0);
assert.equal([...store.keys()].filter(x=>x.includes('_claims/')).length,0);
assert.equal((await authority.readAudit(auditId)).snapshot.status,'Accepted');
// One Firestore transaction archives parent, creates successor, and shifts claims.
const parent='PARENT',successor='SUCCESSOR';
store.set('ams_planning_20_dev_audits/'+parent,{name:db+'/ams_planning_20_dev_audits/'+parent,updateTime:'t0',fields:{payload:encode({auditId:parent,revision:0,snapshot:{auditId:parent,status:'Accepted'},auditorId:'aud-3',blocks:[{date:'2027-09-04',start:'09:00',end:'10:00'}],claimIds:[],pendingOperationId:null})}});
const entities=[
 {auditId:parent,expectedRevision:0,remove:true,nextSnapshot:{auditId:parent,status:'Completed',sourceRevision:'rev-parent'},auditorId:null,blocks:[]},
 {auditId:successor,expectedRevision:null,nextSnapshot:{auditId:successor,status:'Pending Planning',sourceRevision:'rev-child'},auditorId:'aud-3',blocks:[{date:'2027-09-04',start:'09:00',end:'10:00'}]}
];
const args={operationId:'multi-complete-1',actorId:'manager',action:'COMPLETE',entities,projectionPlan:{projectionWrites:[{range:'Audit planning!A2:B2',values:[['parent','completed']]}],projectionPreconditions:[{range:'Audit planning!A2:B2',before:['parent','accepted']}],appendIntents:[]}};
const multi=await authority.commitMulti(args);
assert.equal(multi.entities.length,2);assert.equal((await authority.readAudit(parent)).removed,true);
assert.equal((await authority.readAudit(successor)).revision,0);
assert.equal((await authority.commitMulti(args)).replayed,true);
await assert.rejects(()=>authority.commitMulti({...args,operationId:'multi-overlap',entities:[...entities,{...entities[1],auditId:'another-successor',nextSnapshot:{auditId:'another-successor'}}]}),/PLANNING_MULTI_INTERNAL_SLOT_CONFLICT/);
await authority.markUncertain({auditId:parent,operationId:'multi-complete-1',reason:'SHEETS_TIMEOUT'});
assert.equal((await authority.markProjected({auditId:parent,operationId:'multi-complete-1',proof:{verified:true,auditId:parent,rowHash:'c'.repeat(64)}})).state,'PROJECTED');
assert.equal((await authority.readAudit(successor)).pendingOperationId,null);
assert.equal((await authority.readAudit(parent)).pendingOperationId,null);
console.log('Multi-document Firestore transaction, replay, occupancy, crash ambiguity and settlement OK');
