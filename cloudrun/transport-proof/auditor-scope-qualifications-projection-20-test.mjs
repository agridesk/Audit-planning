import assert from 'node:assert/strict';
import {auditorQualificationRecordsDigest20} from './auditor-scope-qualifications-firestore-20.js';
import {createAuditorQualificationSheetsProjectionAdapter20,createAuditorQualificationSheetsProjector20,planAuditorQualificationSheetsProjection20} from './auditor-scope-qualifications-projection-20.js';

const auditors=[['E-mail','ABC','Auditor_UID','Other'],['one@example.test','x','UID-1','keep-one'],['two@example.test','','UID-2','keep-two']];
const catalog=[['ScopeCode','DisplayName','SlotKey'],['ABC','ABC','SCOPE_01'],['NEW','New','SCOPE_09']];
const relations=[['Auditor_UID','ScopeCode','Qualified','Note'],['UID-1','ABC','YES','keep-a'],['UID-2','ABC','NO','keep-b']];
const sourceManifest='a'.repeat(64);
const records=[
 {auditorUid:'UID-1',qualifiedScopeCodes:[],sourceManifest},
 {auditorUid:'UID-2',qualifiedScopeCodes:['ABC','NEW'],sourceManifest}
];
const snapshot={records,manifest:{state:'READY',schemaVersion:1,sourceManifest,auditorCount:2,grantCount:2,contentSha256:auditorQualificationRecordsDigest20(records)}};
const input={auditors,catalog,relations,snapshot};
const before=structuredClone(input);
const plan=planAuditorQualificationSheetsProjection20(input);
assert.deepEqual(input,before,'Planning must not modify the source');
assert.equal(plan.readOnly,true);
assert.equal(plan.writesPerformed,false);
assert.equal(plan.sourceContentSha256,snapshot.manifest.contentSha256);
assert.deepEqual(plan.unrepresentedScopes,['SCOPE_09']);
assert.equal(plan.updates.length,7);

const sheets={Auditors:structuredClone(auditors),Auditor_Scope_Qualifications:structuredClone(relations)};
for(const update of plan.updates){
 const rows=sheets[update.sheet];
 while(rows.length<update.row)rows.push([]);
 const row=rows[update.row-1];
 assert.equal(row[update.column-1]??'',update.expected);
 row[update.column-1]=update.value;
}
assert.equal(sheets.Auditors[1][1],'');
assert.equal(sheets.Auditors[2][1],'x');
assert.equal(sheets.Auditors[1][3],'keep-one');
assert.equal(sheets.Auditor_Scope_Qualifications[1][3],'keep-a');
assert.equal(sheets.Auditor_Scope_Qualifications[2][3],'keep-b');
assert.deepEqual(sheets.Auditor_Scope_Qualifications[3],['UID-2','NEW','YES']);
assert.equal(planAuditorQualificationSheetsProjection20({
 snapshot,catalog,auditors:sheets.Auditors,relations:sheets.Auditor_Scope_Qualifications
}).updates.length,0,'A completed projection must be idempotent');

assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,relations:[...relations,['UID-1','abc','NO']]}),/RELATION_DUPLICATE/);
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,relations:[...relations,['UNKNOWN','ABC','YES']]}),/RELATION_INVALID/);
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,relations:[['Auditor_UID','ScopeCode','Qualified','qualified']]}),/RELATION_SCHEMA_INVALID/);
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,auditors:[['E-mail','ABC','Auditor_UID','abc'],...auditors.slice(1)]}),/SCHEMA_INVALID/);
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,snapshot:{...snapshot,manifest:{...snapshot.manifest,contentSha256:'0'.repeat(64)}}}),/SNAPSHOT_INVALID/);
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,auditors:auditors.slice(0,2)}),/ROSTER_DRIFT/);
const nearlyFull=relations.concat(Array.from({length:4999-relations.length},()=>[]));
assert.throws(()=>planAuditorQualificationSheetsProjection20({...input,relations:nearlyFull}),/ROW_LIMIT/);

function workerFixture({changeDuringRead=false,changeAfterWrite=false,uncertainWrite=false,skipLast=false,frozen=true,failAck=false,failSecondAck=false,repeatToken=false}={}){
 const current=structuredClone(input);
 const events=[{operationId:'qe_'+'1'.repeat(64),state:'PENDING'},{operationId:'qe_'+'2'.repeat(64),state:'PENDING'}];
 let locked=false,reads=0,writes=0,ackCalls=0;
 const worker=createAuditorQualificationSheetsProjector20({
  withLock:async work=>{
   assert.equal(locked,false);locked=true;
   try{const result=await work();locked=false;return result;}
   catch(error){if(!/RECONCILE/.test(error.message))locked=false;throw error;}
  },
  assertFrozen:async()=>{if(!frozen)throw Error('QUALIFICATION_SOURCE_NOT_FROZEN');},
  eventStore:{
   listEditEvents:async({pageToken})=>{
    const offset=pageToken?1:0;
    return{events:structuredClone(events.slice(offset,offset+1)),nextPageToken:repeatToken?'next':offset===0?'next':null};
   },
   acknowledgeEditEvent:async({operationId,projectedContentSha256})=>{
    ackCalls++;
    if(failAck||(failSecondAck&&ackCalls===2))throw Error('SIMULATED_ACK_FAILURE');
    assert.equal(projectedContentSha256,current.snapshot.manifest.contentSha256);
    const event=events.find(x=>x.operationId===operationId);
    event.state='PROJECTED';return{acknowledged:true};
   }
  },
  readInputs:async()=>{
   if(changeDuringRead&&++reads===2){
    current.snapshot.records[0].qualifiedScopeCodes=['ABC'];
    current.snapshot.manifest.grantCount++;
    current.snapshot.manifest.contentSha256=auditorQualificationRecordsDigest20(current.snapshot.records);
   }
   return structuredClone(current);
  },
  writeCells:async updates=>{
   writes++;
   for(const update of skipLast?updates.slice(0,-1):updates){
    const rows=update.sheet==='Auditors'?current.auditors:current.relations;
    while(rows.length<update.row)rows.push([]);
    const row=rows[update.row-1];
    assert.equal(row[update.column-1]??'',update.expected);
    row[update.column-1]=update.value;
   }
   if(changeAfterWrite){
    current.snapshot.records[0].qualifiedScopeCodes=['ABC'];
    current.snapshot.manifest.grantCount++;
    current.snapshot.manifest.contentSha256=auditorQualificationRecordsDigest20(current.snapshot.records);
   }
   if(uncertainWrite)throw Error('SIMULATED_TIMEOUT');
  }
 });
 return{worker,state:()=>({locked,writes,current,events}),releaseAfterReconciliation:()=>{locked=false;}};
}
const successful=workerFixture();
assert.deepEqual(await successful.worker.reconcile(),{verified:true,updatedCells:7,acknowledgedEvents:2,pendingEvents:0});
assert.equal(successful.state().locked,false);
assert.deepEqual(await successful.worker.reconcile(),{verified:true,updatedCells:0,acknowledgedEvents:0,pendingEvents:0});
assert.equal(successful.state().writes,1);
const changed=workerFixture({changeDuringRead:true});
await assert.rejects(changed.worker.reconcile(),/SOURCE_CHANGED_RECONCILE/);
assert.equal(changed.state().writes,0);
assert.equal(changed.state().locked,true);
const timedOut=workerFixture({uncertainWrite:true});
await assert.rejects(timedOut.worker.reconcile(),/WRITE_UNCERTAIN_RECONCILE/);
assert.equal(timedOut.state().locked,true);
const incomplete=workerFixture({skipLast:true});
await assert.rejects(incomplete.worker.reconcile(),/UNCONFIRMED_RECONCILE/);
assert.equal(incomplete.state().locked,true);
const changedAfterWrite=workerFixture({changeAfterWrite:true});
await assert.rejects(changedAfterWrite.worker.reconcile(),/UNCONFIRMED_RECONCILE/);
assert.equal(changedAfterWrite.state().locked,true);
const unfrozen=workerFixture({frozen:false});
await assert.rejects(unfrozen.worker.reconcile(),/SOURCE_NOT_FROZEN/);
assert.equal(unfrozen.state().writes,0);
const failedAck=workerFixture({failAck:true});
await assert.rejects(failedAck.worker.reconcile(),/UNCONFIRMED_RECONCILE/);
assert.equal(failedAck.state().locked,true);
assert.ok(failedAck.state().events.every(x=>x.state==='PENDING'));
const partialAck=workerFixture({failSecondAck:true});
await assert.rejects(partialAck.worker.reconcile(),/UNCONFIRMED_RECONCILE/);
assert.deepEqual(partialAck.state().events.map(x=>x.state),['PROJECTED','PENDING']);
assert.equal(partialAck.state().locked,true);
partialAck.releaseAfterReconciliation();
assert.deepEqual(await partialAck.worker.reconcile(),{verified:true,updatedCells:0,acknowledgedEvents:1,pendingEvents:0});
assert.equal(partialAck.state().writes,1,'Recovery must not repeat confirmed Sheet writes');
const repeatedPage=workerFixture({repeatToken:true});
await assert.rejects(repeatedPage.worker.reconcile(),/UNCONFIRMED_RECONCILE/);
assert.equal(repeatedPage.state().locked,true);
assert.ok(repeatedPage.state().events.every(x=>x.state==='PENDING'));

let adapterInput=structuredClone(input),written=[],ensured=[];
const adapter=createAuditorQualificationSheetsProjectionAdapter20({
 assertFrozen:async()=>{},
 readInputs:async()=>structuredClone(adapterInput),
 ensureRows:async(sheet,row)=>ensured.push([sheet,row]),
 writeRaw:async data=>written.push(data)
});
await adapter.writeCells(plan.updates,{sourceContentSha256:plan.sourceContentSha256});
assert.equal(written.length,1);
assert.equal(written[0].length,7);
assert.ok(written[0].some(x=>x.range==="'Auditors'!B2"&&x.values[0][0]===''));
assert.ok(written[0].some(x=>x.range==="'Auditor_Scope_Qualifications'!B4"&&x.values[0][0]==='NEW'));
assert.deepEqual(ensured,[['Auditors',3],['Auditor_Scope_Qualifications',4]]);
adapterInput.auditors=[adapterInput.auditors[0],adapterInput.auditors[2],adapterInput.auditors[1]];
await assert.rejects(adapter.writeCells(plan.updates,{sourceContentSha256:plan.sourceContentSha256}),/PREIMAGE_CHANGED/);
assert.equal(written.length,1,'A moved UID must not be written at its old row');
let afterResize=structuredClone(input),resizeWrites=0,moved=false;
const movedDuringResize=createAuditorQualificationSheetsProjectionAdapter20({
 assertFrozen:async()=>{},
 readInputs:async()=>structuredClone(afterResize),
 ensureRows:async()=>{if(!moved){afterResize.auditors=[afterResize.auditors[0],afterResize.auditors[2],afterResize.auditors[1]];moved=true;}},
 writeRaw:async()=>{resizeWrites++;}
});
await assert.rejects(movedDuringResize.writeCells(plan.updates,{sourceContentSha256:plan.sourceContentSha256}),/PREIMAGE_CHANGED/);
assert.equal(resizeWrites,0);
console.log('Scope20 Firestore-to-Sheets projection planning: UID identity, preservation and idempotence PASS');
