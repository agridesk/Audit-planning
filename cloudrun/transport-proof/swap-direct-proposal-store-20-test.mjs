import assert from 'node:assert/strict';
import {createSwapDirectProposalStore} from './swap-direct-proposal-store-20.mjs';
import {createSwapFirestoreDevTransport} from './swap-firestore-dev-transport-20.mjs';
let record=null,version=0,writes=0;
const fetchImpl=async(url,init)=>{
 const method=init.method||'GET',params=new URL(url).searchParams;
 if(method==='GET')return record?{ok:true,json:async()=>record}:{status:404,ok:false};
 if(method!=='PATCH')throw Error('unexpected method');
 if(params.get('currentDocument.exists')==='false'&&record)return {status:412,ok:false};
 const expected=params.get('currentDocument.updateTime');
 if(expected&&expected!==record?.updateTime)return {status:412,ok:false};
 const body=JSON.parse(init.body);record={...body,updateTime:'revision-'+(++version)};
 writes++;
 return {ok:true,json:async()=>record};
};
const store=createSwapDirectProposalStore({project:'ams-test-dev',getToken:async()=>'token',fetchImpl});
const proposal={operationId:'swap_12345678',auditA:'A',auditB:'B',status:'AWAITING_ACKNOWLEDGEMENT',requiredAuditorUids:['u1'],acknowledgedAuditorUids:[]};
assert.equal((await store.create(proposal)).ok,true);
assert.equal((await store.create(proposal)).conflict,true);
assert.equal(writes,1);
const prior=await store.read(proposal.operationId);
assert.deepEqual(prior.proposal,proposal);
const confirmed={...proposal,status:'CONFIRMED',acknowledgedAuditorUids:['u1']};
assert.equal((await store.compareAndSet(proposal.operationId,prior.updateTime,confirmed,()=>true)).ok,true);
assert.equal((await store.compareAndSet(proposal.operationId,prior.updateTime,confirmed,()=>true)).conflict,true);
assert.equal(writes,2);
await assert.rejects(store.compareAndSet(proposal.operationId,'revision-2',{...confirmed,status:'APPLIED'},()=>false),/SWAP_DIRECT_TRANSITION_REJECTED/);
assert.equal(writes,2);
await assert.rejects(store.compareAndSet(proposal.operationId,'revision-2',{...confirmed,auditB:'C'},()=>true),/SWAP_DIRECT_TRANSITION_REJECTED/);
await assert.rejects(store.compareAndSet(proposal.operationId,'revision-2',{...confirmed,status:'APPLIED'},()=>true),/SWAP_DIRECT_TRANSITION_REJECTED/);
assert.equal(writes,2);
console.log('SWAP direct Firestore proposal write concurrency checks passed');

assert.throws(()=>createSwapDirectProposalStore({project:'ams-test-prod',getToken:async()=>'token'}),/SWAP_DIRECT_PROJECT_INVALID/);

const changedSchedule={...confirmed,blocksA:[{date:'2026-10-29'}]};
await assert.rejects(store.compareAndSet(proposal.operationId,'revision-2',changedSchedule,()=>true),/SWAP_DIRECT_TRANSITION_REJECTED/);

await assert.rejects(store.create({...proposal,operationId:'swap_87654321',status:'CONFIRMED'}),/SWAP_DIRECT_PROPOSAL_INVALID/);


record=null; // Independent isolated Firestore document fixture.
const second={...proposal,operationId:'swap_99999999',requiredAuditorUids:['u1','u2']};
assert.equal((await store.create(second)).ok,true);
const auditor={role:'auditor',email:'auditor@example.com'};
const authorized=async actor=>actor===auditor?'u1':null;
await assert.rejects(store.respond({operationId:second.operationId,decision:'ACKNOWLEDGE',actor:{},authorizeAuditor:authorized}),/SWAP_DIRECT_RESPONSE_INVALID/);
assert.equal((await store.respond({operationId:second.operationId,decision:'ACKNOWLEDGE',actor:auditor,authorizeAuditor:authorized})).status,'AWAITING_ACKNOWLEDGEMENT');
const partly=await store.read(second.operationId);
assert.deepEqual(partly.proposal.acknowledgedAuditorUids,['u1']);
assert.equal((await store.respond({operationId:second.operationId,decision:'ACKNOWLEDGE',actor:auditor,authorizeAuditor:authorized})).status,'AWAITING_ACKNOWLEDGEMENT');
assert.deepEqual((await store.read(second.operationId)).proposal.acknowledgedAuditorUids,['u1']);
assert.equal((await store.respond({operationId:second.operationId,decision:'ACKNOWLEDGE',actor:auditor,authorizeAuditor:async()=> 'u2'})).status,'CONFIRMED');
const repeated=await store.respond({operationId:second.operationId,decision:'ACKNOWLEDGE',actor:auditor,authorizeAuditor:async()=> 'u2'});
assert.equal(repeated.idempotent,true);
await assert.rejects(store.respond({operationId:second.operationId,decision:'DECLINE',actor:auditor,authorizeAuditor:authorized}),/SWAP_DIRECT_RESPONSE_STATUS_INVALID/);

const latest=await store.read(second.operationId);
await assert.rejects(store.compareAndSet(second.operationId,latest.updateTime,{
 ...latest.proposal,status:'CONFIRMED',acknowledgedAuditorUids:['u2']
},()=>true),/SWAP_DIRECT_TRANSITION_REJECTED/);

const disabledTransport=createSwapFirestoreDevTransport({project:'ams-test-dev',getToken:async()=>'token',authorize:async()=>true,
 fetchImpl:async()=>{throw Error('NO_NETWORK_BEFORE_CUTOVER');}});
assert.deepEqual(await disabledTransport.propose({operationId:'op_12345678'}),{ok:false,code:'SWAP_DIRECT_PROPOSE_DISABLED'});


const root='projects/ams-test-dev/databases/(default)/documents/';
const today='2026-10-26T16:00:00Z';
const canonical={
 A:{status:'Accepted',assignedTo:'a@example.test',revision:'A-rev',plannedBlocks:[{date:'2026-11-01',start:'09:00',end:'10:00'}]},
 B:{status:'Accepted',assignedTo:'b@example.test',revision:'B-rev',plannedBlocks:[{date:'2026-11-03',start:'11:00',end:'12:00'}]}
};
const availability={
 A:{reservations:[{date:'2026-11-01',start:'09:00',end:'10:00',owner:'a@example.test'}]},
 B:{reservations:[{date:'2026-11-03',start:'11:00',end:'12:00',owner:'b@example.test'}]}
};
let directWrites=0,directCreated=null;
const directFetch=async(url,init={})=>{
 if(url.endsWith(':batchGet')){
  const documents=JSON.parse(init.body).documents;
  return {ok:true,text:async()=>JSON.stringify(documents.map(name=>{
   const parts=name.slice(root.length).split('/');
   const payload=(parts[0]==='ams_swap20_dev_audits'?canonical:availability)[parts[1]];
   return {found:{name,updateTime:today,fields:{payload:{stringValue:JSON.stringify(payload)}}}};
  }))};
 }
 if(url.endsWith('/ams_swap20_dev_meta/reservation_fence'))
  return {ok:true,json:async()=>({updateTime:today})};
 if(url.includes('/ams_swap20_dev_proposals/')){
  if(init.method!=='PATCH')throw Error('Unexpected proposal method');
  directWrites++;
  directCreated=JSON.parse(init.body).fields.payload.stringValue;
  return {ok:true,json:async()=>({...JSON.parse(init.body),updateTime:today})};
 }
 throw Error('Unexpected direct request: '+url);
};
const liveIsolated=createSwapFirestoreDevTransport({
 project:'ams-test-dev',getToken:async()=>'token',fetchImpl:directFetch,authorize:async()=>true,
 enabled:true,canonicalCutoverVerified:true,expectedAvailabilityDocuments:20,
 loadCompleteReservationIndex:async()=>({complete:true,documentCount:20,reservations:[]}),
 resolveCanonicalAuditorUids:async()=>['auditor_111111','auditor_222222']
});
const created=await liveIsolated.propose({
 operationId:'test_direct_12345678',auditA:'A',auditB:'B',
 internalReason:'Controlled DEV fixture',ecasComment:'Date swap fixture',
 actor:{role:'manager',email:'manager@example.test'}
});
assert.equal(created.ok,true);
assert.equal(created.source,'firestore-direct');
assert.equal(directWrites,1);
const storedDirect=JSON.parse(directCreated);
assert.equal(storedDirect.status,'AWAITING_ACKNOWLEDGEMENT');
assert.deepEqual(storedDirect.requiredAuditorUids,['auditor_111111','auditor_222222']);
assert.deepEqual(storedDirect.originalRevisions,{A:'A-rev',B:'B-rev'});
