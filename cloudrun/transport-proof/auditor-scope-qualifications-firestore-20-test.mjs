import assert from 'node:assert/strict';
import {
 assertAuditorQualificationFirestoreRoster20,
 createAuditorScopeQualificationsFirestore20,
 prepareAuditorQualificationFirestoreMigration20
} from './auditor-scope-qualifications-firestore-20.js';
import {createAuditorQualificationSheetsProjectionAdapter20,createAuditorQualificationSheetsProjector20} from './auditor-scope-qualifications-projection-20.js';

const catalog=[['ScopeCode','DisplayName','SlotKey'],['ABC','ABC','SCOPE_01'],['NEW','New scope','SCOPE_09']];
const auditors=[['E-mail','ABC','Auditor_UID'],['a@example.com','x','UID-1'],['b@example.com','','UID-2']];
const relations=[['Qualified','ScopeCode','Auditor_UID']];
const prepared=prepareAuditorQualificationFirestoreMigration20({auditors,catalog,relations});
assert.equal(prepared.ok,true);
assert.equal(prepared.readOnly,true);
assert.equal(prepared.writesPerformed,false);
assert.equal(prepared.writeAuthorized,false);
assert.equal(prepared.documentCount,2);
assert.equal(prepared.grantCount,1);
assert.deepEqual(prepared.proposedDocuments.map(x=>x.id),['UID-1','UID-2']);
assert.deepEqual(prepared.proposedDocuments[0].record.qualifiedScopeCodes,['ABC']);
assert.deepEqual(prepared.proposedDocuments[1].record.qualifiedScopeCodes,[]);
assert.equal(prepared.manifest.sourceManifest.length,64);
for(const [field,limit] of [['auditors',1000],['catalog',200],['relations',5000]]){
 const source={auditors,catalog,relations};
 source[field]=Array.from({length:limit},(_,i)=>i===0?source[field][0]:[]);
 const result=prepareAuditorQualificationFirestoreMigration20(source);
 assert.equal(result.ok,false,`${field} at the read limit must not be accepted as complete`);
 assert.equal(result.error,'QUALIFICATION_FIRESTORE_SOURCE_TRUNCATED');
 assert.equal(result.writeAuthorized,false);
}
assert.throws(()=>assertAuditorQualificationFirestoreRoster20(
 Array.from({length:1000},(_,i)=>i===0?auditors[0]:[]),
 {records:prepared.proposedDocuments.map(x=>x.record)}
),/QUALIFICATION_FIRESTORE_ROSTER_INCOMPLETE/);
const withinLimit=auditors.concat(Array.from({length:999-auditors.length},()=>[]));
assert.equal(prepareAuditorQualificationFirestoreMigration20({auditors:withinLimit,catalog,relations}).ok,true);
assert.doesNotThrow(()=>assertAuditorQualificationFirestoreRoster20(withinLimit,{
 records:prepared.proposedDocuments.map(x=>x.record)
}));
const beyondBlankBoundary=withinLimit.concat([[],['UID-3','later@example.test','YES','Auditor','']]);
assert.equal(prepareAuditorQualificationFirestoreMigration20({auditors:beyondBlankBoundary,catalog,relations}).error,'QUALIFICATION_FIRESTORE_SOURCE_TRUNCATED');
assert.throws(()=>assertAuditorQualificationFirestoreRoster20(beyondBlankBoundary,{
 records:prepared.proposedDocuments.map(x=>x.record)
}),/QUALIFICATION_FIRESTORE_ROSTER_INCOMPLETE/);
const duplicateUidRoster=auditors.map((row,i)=>i===0?[...row,' auditor_uid ']:[...row,'OTHER-UID']);
assert.equal(prepareAuditorQualificationFirestoreMigration20({auditors:duplicateUidRoster,catalog,relations}).error,
 'AUDITOR_UID_SCHEMA_INVALID');
assert.throws(()=>assertAuditorQualificationFirestoreRoster20(duplicateUidRoster,{
 records:prepared.proposedDocuments.map(x=>x.record)
}),/QUALIFICATION_FIRESTORE_ROSTER_UID_SCHEMA_INVALID/);
assert.throws(()=>assertAuditorQualificationFirestoreRoster20([...auditors,null],{
 records:prepared.proposedDocuments.map(x=>x.record)
}),/QUALIFICATION_FIRESTORE_ROSTER_INVALID/);
assert.equal(prepareAuditorQualificationFirestoreMigration20({
 auditors,catalog,relations:[...relations,['NO','ABC','UID-1']]
}).ok,false);
assert.throws(()=>createAuditorScopeQualificationsFirestore20({
 projectId:'audit-management-system-prod',getToken:async()=>'token'
}),/DEV_CONFIGURATION_REQUIRED/);

const store=new Map();
const events=new Map();
const versions=new Map();
let sequence=0;
let simulateConflict=false;
let failVerifyAfterCommit=false,failNextManifestRead=false;
const timestamp=id=>new Date(Date.UTC(2026,0,1,0,0,versions.get(id)||0)).toISOString();
const requests=[];
const apiResponse=(status,body={})=>({status,ok:status>=200&&status<300,json:async()=>body});
const rawDocument=(id,record,collection='ams_scope20_auditor_qualifications_20_dev')=>({
 name:`projects/audit-management-system-dev/databases/(default)/documents/${collection}/${id}`,
 updateTime:timestamp(id),
 fields:{payload:{mapValue:{fields:Object.fromEntries(Object.entries(record).map(([key,value])=>[
  key,typeof value==='string'?{stringValue:value}:typeof value==='number'?{integerValue:String(value)}:
   Array.isArray(value)?{arrayValue:{values:value.map(x=>({stringValue:x}))}}:
   {booleanValue:value}
 ]))}}}
});
async function fetchFirestore(url,init={}){
 const parsed=new URL(url),method=init.method||'GET';
 requests.push({url:parsed.toString(),method,body:init.body});
 if(parsed.pathname.endsWith('/documents:commit')){
  const writes=JSON.parse(init.body).writes;
  if(simulateConflict&&writes.some(w=>w.currentDocument?.updateTime)){
   simulateConflict=false;
   versions.set('migration_manifest',++sequence);
  }
  if(writes.some(w=>{
   const name=w.update.name,id=name.split('/').pop(),condition=w.currentDocument||{};
   const target=name.includes('/ams_scope20_qualification_events_20_dev/')?events:store;
   return condition.exists===false?target.has(id):!target.has(id)||condition.updateTime!==timestamp(id);
  }))return apiResponse(409);
  for(const write of writes){
   const id=write.update.name.split('/').pop();
   const fields=write.update.fields.payload.mapValue.fields;
   const record=Object.fromEntries(Object.entries(fields).map(([key,value])=>[
    key,'stringValue'in value?value.stringValue:'integerValue'in value?Number(value.integerValue):
     'booleanValue'in value?value.booleanValue:(value.arrayValue?.values||[]).map(x=>x.stringValue)
   ]));
   const target=write.update.name.includes('/ams_scope20_qualification_events_20_dev/')?events:store;
   target.set(id,record);
   versions.set(id,++sequence);
  }
  if(failVerifyAfterCommit&&writes.some(w=>w.currentDocument?.updateTime)){
   failVerifyAfterCommit=false;failNextManifestRead=true;
  }
  return apiResponse(200,{writeResults:writes.map(()=>({}))});
 }
 const prefix='/v1/projects/audit-management-system-dev/databases/(default)/documents/ams_scope20_auditor_qualifications_20_dev';
 const eventRoot='/v1/projects/audit-management-system-dev/databases/(default)/documents/ams_scope20_qualification_events_20_dev';
 const eventPrefix=eventRoot+'/';
 if(parsed.pathname===eventRoot){
  const docs=[...events.entries()].map(([id,value])=>rawDocument(id,value,'ams_scope20_qualification_events_20_dev'));
  const offset=Number(parsed.searchParams.get('pageToken')||0),size=Number(parsed.searchParams.get('pageSize')||100);
  return apiResponse(200,{documents:docs.slice(offset,offset+size),...(offset+size<docs.length?{nextPageToken:String(offset+size)}:{})});
 }
 if(parsed.pathname.startsWith(eventPrefix)){
  const id=decodeURIComponent(parsed.pathname.slice(eventPrefix.length));
  return events.has(id)?apiResponse(200,rawDocument(id,events.get(id),'ams_scope20_qualification_events_20_dev')):apiResponse(404);
 }
 if(parsed.pathname===prefix){
  let docs=[...store.entries()].map(([id,value])=>rawDocument(id,value));
  if(parsed.searchParams.has('pageToken'))return apiResponse(200,{documents:docs.slice(1)});
  if(store.size>1)return apiResponse(200,{documents:docs.slice(0,1),nextPageToken:'page-two'});
  return apiResponse(200,{documents:docs});
 }
 if(parsed.pathname.startsWith(prefix+'/')){
  const id=decodeURIComponent(parsed.pathname.slice(prefix.length+1));
  if(id==='migration_manifest'&&failNextManifestRead){failNextManifestRead=false;return apiResponse(503);}
  return store.has(id)?apiResponse(200,rawDocument(id,store.get(id))):apiResponse(404);
 }
 return apiResponse(500);
}
const firestore=createAuditorScopeQualificationsFirestore20({
 projectId:'audit-management-system-dev',getToken:async()=>'test-token',fetchImpl:fetchFirestore
});
let editSequence=0;
const edit=args=>firestore.editQualification({
 ...args,actorUid:'manager-test',operationId:'qe_'+String(++editSequence).padStart(64,'0')
});
await assert.rejects(firestore.readSnapshot(),/MANIFEST_NOT_READY/);
const beforePreviewPosts=requests.filter(x=>x.method==='POST').length;
assert.deepEqual(await firestore.previewSnapshot(prepared),{
 ready:false,alreadyApplied:false,documentCount:0,grantCount:0,createCount:2,
 sourceManifest:prepared.sourceManifest
});
assert.equal(requests.filter(x=>x.method==='POST').length,beforePreviewPosts);
const applied=await firestore.applySnapshot(prepared);
assert.deepEqual(applied,{ok:true,written:2,verified:true,unchanged:false,documentCount:2,grantCount:1});
const snapshot=await firestore.readSnapshot();
assert.equal(snapshot.records.length,2);
assert.deepEqual(snapshot.relations,[
 ['Auditor_UID','ScopeCode','Qualified'],
 ['UID-1','ABC','YES']
]);
assert.deepEqual(await firestore.applySnapshot(prepared),{
 ok:true,written:0,verified:true,unchanged:true,documentCount:2,grantCount:1
});
assert.equal((await firestore.previewSnapshot(prepared)).ready,true);
assert.ok(requests.filter(x=>x.method==='POST').every(x=>x.url.endsWith('/documents:commit')));
assert.ok(requests.filter(x=>x.method==='POST').every(x=>
 JSON.parse(x.body).writes.every(w=>w.currentDocument?.exists===false)));

const noWriteCount=requests.filter(x=>x.method==='POST').length;
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'abc',qualified:true,expectedQualified:false,expectedContentSha256:prepared.sourceManifest
}),/SCOPE_CODE_CASE_MISMATCH/);
assert.equal(requests.filter(x=>x.method==='POST').length,noWriteCount);
await assert.rejects(firestore.editQualification({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:true,expectedContentSha256:prepared.sourceManifest
}),/EDIT_INVALID/);
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:false,expectedContentSha256:prepared.sourceManifest
}),/EDIT_STALE/);
assert.equal(requests.filter(x=>x.method==='POST').length,noWriteCount);
const edited=await edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:true,expectedContentSha256:prepared.sourceManifest
});
assert.equal(edited.changed,true);
const editWrites=JSON.parse(requests.filter(x=>x.method==='POST').at(-1).body).writes;
assert.equal(editWrites.length,3);
assert.ok(editWrites.slice(0,2).every(w=>typeof w.currentDocument?.updateTime==='string'));
assert.equal(editWrites[2].currentDocument.exists,false);
assert.equal(events.size,1);
assert.equal([...events.values()][0].state,'PENDING');
const eventId=[...events.keys()][0];
assert.equal((await firestore.readEditEvent(eventId)).contentSha256,edited.contentSha256);
assert.equal(await firestore.readEditEvent('qe_'+'f'.repeat(64)),null);
await assert.rejects(firestore.readEditEvent('invalid'),/EDIT_INVALID/);
assert.equal((await firestore.listEditEvents({pageSize:1})).events[0].operationId,eventId);
await assert.rejects(firestore.listEditEvents({pageSize:201}),/EVENT_SCAN_INVALID/);
const originalEvent=events.get(eventId);
events.set(eventId,{...originalEvent,operationId:'qe_'+'f'.repeat(64)});
await assert.rejects(firestore.readEditEvent(eventId),/EVENT_INVALID/);
events.set(eventId,originalEvent);
const afterEdit=await firestore.readSnapshot();
assert.equal(afterEdit.manifest.sourceManifest,prepared.sourceManifest);
assert.equal(afterEdit.manifest.contentSha256,edited.contentSha256);
assert.equal(afterEdit.manifest.grantCount,0);
assert.deepEqual(afterEdit.relations,[['Auditor_UID','ScopeCode','Qualified']]);
await assert.rejects(firestore.acknowledgeEditEvent({
 operationId:eventId,projectedContentSha256:prepared.sourceManifest
}),/EVENT_ACK_STALE/);
simulateConflict=true;
await assert.rejects(firestore.acknowledgeEditEvent({
 operationId:eventId,projectedContentSha256:edited.contentSha256
}),/WRITE_CONFLICT_RECONCILE/);
assert.equal((await firestore.readEditEvent(eventId)).state,'PENDING');
assert.deepEqual(await firestore.acknowledgeEditEvent({
 operationId:eventId,projectedContentSha256:edited.contentSha256
}),{acknowledged:true,unchanged:false});
assert.equal((await firestore.readEditEvent(eventId)).state,'PROJECTED');
const ackWrites=JSON.parse(requests.filter(x=>x.method==='POST').at(-1).body).writes;
assert.ok(ackWrites[0].update.name.endsWith('/migration_manifest'));
assert.ok(ackWrites.every(w=>typeof w.currentDocument?.updateTime==='string'));
assert.deepEqual(await firestore.acknowledgeEditEvent({
 operationId:eventId,projectedContentSha256:edited.contentSha256
}),{acknowledged:true,unchanged:true});
const ackReplayWrites=requests.filter(x=>x.method==='POST').length;
await assert.rejects(firestore.acknowledgeEditEvent({
 operationId:eventId,projectedContentSha256:prepared.sourceManifest
}),/EVENT_ACK_PROOF_CONFLICT/);
assert.equal(requests.filter(x=>x.method==='POST').length,ackReplayWrites);
await assert.rejects(firestore.previewSnapshot(prepared),/EXISTING_MANIFEST_CONFLICT/);
await assert.rejects(firestore.applySnapshot(prepared),/EXISTING_MANIFEST_CONFLICT/);
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:true,expectedQualified:false,expectedContentSha256:prepared.sourceManifest
}),/EDIT_STALE/);
const noOpWrites=requests.filter(x=>x.method==='POST').length;
assert.equal((await edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:false,expectedContentSha256:edited.contentSha256
})).changed,false);
assert.equal(requests.filter(x=>x.method==='POST').length,noOpWrites);
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:true,expectedQualified:false,expectedContentSha256:prepared.sourceManifest
}),/EDIT_STALE/);
simulateConflict=true;
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:true,expectedQualified:false,expectedContentSha256:edited.contentSha256
}),/WRITE_CONFLICT_RECONCILE/);
assert.deepEqual((await firestore.readSnapshot()).relations,[['Auditor_UID','ScopeCode','Qualified']]);
const restored=await edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:true,expectedQualified:false,expectedContentSha256:edited.contentSha256
});
assert.equal(restored.contentSha256,prepared.sourceManifest);
assert.deepEqual((await firestore.readSnapshot()).relations,[
 ['Auditor_UID','ScopeCode','Qualified'],['UID-1','ABC','YES']
]);
const existingOperation=[...events.keys()][0];
await assert.rejects(firestore.editQualification({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:true,
 expectedContentSha256:restored.contentSha256,actorUid:'manager-test',operationId:existingOperation
}),/WRITE_CONFLICT_RECONCILE/);
assert.deepEqual((await firestore.readSnapshot()).relations,[
 ['Auditor_UID','ScopeCode','Qualified'],['UID-1','ABC','YES']
]);
failVerifyAfterCommit=true;
await assert.rejects(edit({
 auditorUid:'UID-1',scopeCode:'ABC',qualified:false,expectedQualified:true,expectedContentSha256:restored.contentSha256
}),/EDIT_UNCONFIRMED_RECONCILE/);
const recovered=await firestore.readSnapshot();
assert.deepEqual(recovered.relations,[['Auditor_UID','ScopeCode','Qualified']]);
assert.equal((await firestore.readEditEvent([...events.keys()].at(-1))).contentSha256,recovered.manifest.contentSha256);
const eventsBeforeConcurrent=events.size;
const firstPage=await firestore.listEditEvents({pageSize:1});
assert.ok(firstPage.nextPageToken);
const secondPage=await firestore.listEditEvents({pageSize:1,pageToken:firstPage.nextPageToken});
assert.notEqual(firstPage.events[0].operationId,secondPage.events[0].operationId);
const concurrent=await Promise.allSettled(['UID-1','UID-2'].map(auditorUid=>edit({
 auditorUid,scopeCode:'ABC',qualified:true,expectedQualified:false,expectedContentSha256:recovered.manifest.contentSha256
})));
assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);
assert.match(concurrent.find(x=>x.status==='rejected').reason.message,/WRITE_CONFLICT_RECONCILE/);
assert.equal(events.size,eventsBeforeConcurrent+1);
assert.equal((await firestore.readSnapshot()).manifest.grantCount,1);
const originalRecord=store.get('UID-1');
store.set('UID-1',{...originalRecord,qualifiedScopeCodes:['ABC','abc']});
await assert.rejects(firestore.readSnapshot(),/SCOPE_LIST_INVALID/);
store.set('UID-1',originalRecord);

const conflictStore=new Map([['UID-1',{auditorUid:'UID-1',qualifiedScopeCodes:['OTHER'],sourceManifest:prepared.sourceManifest}]]);
const conflictFetch=async(url,init={})=>{
 const u=new URL(url);
 if((init.method||'GET')==='GET'&&u.pathname.endsWith('/migration_manifest'))return apiResponse(404);
 if((init.method||'GET')==='GET')return apiResponse(200,{documents:[...conflictStore.entries()].map(([id,value])=>rawDocument(id,value))});
 return apiResponse(500);
};
const conflicted=createAuditorScopeQualificationsFirestore20({
 projectId:'audit-management-system-dev',getToken:async()=>'test-token',fetchImpl:conflictFetch
});
await assert.rejects(conflicted.applySnapshot(prepared),/PARTIAL_STATE_CONFLICT/);

const staleRequests=[];
const staleStore=createAuditorScopeQualificationsFirestore20({
 projectId:'audit-management-system-dev',getToken:async()=>'test-token',
 fetchImpl:async(url,init={})=>{
  staleRequests.push({method:init.method||'GET',url});
  return init.method==='POST'?apiResponse(200,{writeResults:[]}):apiResponse(200,{documents:[]});
 }
});
const changedSource=prepareAuditorQualificationFirestoreMigration20({
 auditors:[auditors[0],['a@example.com','','UID-1'],auditors[2]],catalog,relations
});
await assert.rejects(staleStore.applySnapshot(prepared,{verifySource:async()=>changedSource}),/SOURCE_CHANGED_RECONCILE/);
assert.equal(staleRequests.some(x=>x.method==='POST'),false,'Stale source must be rejected before Firestore writes');

store.clear();versions.clear();events.clear();requests.length=0;
const specialUid='UID,1%2F';
const specialPrepared=prepareAuditorQualificationFirestoreMigration20({
 auditors:[auditors[0],['special@example.test','x',specialUid]],catalog,relations
});
assert.equal(specialPrepared.ok,true);
await firestore.applySnapshot(specialPrepared);
assert.ok(store.has(specialUid),'Firestore resource names must retain the literal UID');
const specialWrites=JSON.parse(requests.find(x=>x.method==='POST').body).writes;
assert.ok(specialWrites[0].update.name.endsWith('/'+specialUid));
assert.equal((await firestore.readSnapshot()).records[0].auditorUid,specialUid);
await edit({auditorUid:specialUid,scopeCode:'ABC',qualified:false,expectedQualified:true,expectedContentSha256:specialPrepared.sourceManifest});
assert.equal((await firestore.readSnapshot()).records[0].auditorUid,specialUid);
assert.ok(JSON.parse(requests.filter(x=>x.method==='POST').at(-1).body).writes[0].update.name.endsWith('/'+specialUid));

const sheetData={
 Auditors:[auditors[0].slice(),['special@example.test','x',specialUid]],
 Auditor_Scope_Qualifications:structuredClone(relations)
};
let rawSheetWrites=0,locked=false;
const readProjectionInputs=async()=>({
 snapshot:await firestore.readSnapshot(),auditors:structuredClone(sheetData.Auditors),catalog,
 relations:structuredClone(sheetData.Auditor_Scope_Qualifications)
});
const projectionAdapter=createAuditorQualificationSheetsProjectionAdapter20({
 assertFrozen:async()=>{},
 readInputs:readProjectionInputs,
 ensureRows:async()=>{},
 writeRaw:async data=>{
  rawSheetWrites++;
  for(const entry of data){
   const match=entry.range.match(/^'(Auditors|Auditor_Scope_Qualifications)'!([A-Z]+)(\d+)$/);
   assert.ok(match);
   const column=[...match[2]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
   const rows=sheetData[match[1]],row=Number(match[3])-1;
   while(rows.length<=row)rows.push([]);
   rows[row][column]=entry.values[0][0];
  }
 }
});
const projector=createAuditorQualificationSheetsProjector20({
 withLock:async work=>{assert.equal(locked,false);locked=true;try{return await work();}finally{locked=false;}},
 assertFrozen:async()=>{},readInputs:readProjectionInputs,writeCells:projectionAdapter.writeCells,eventStore:firestore
});
assert.deepEqual(await projector.reconcile(),{verified:true,updatedCells:1,acknowledgedEvents:1,pendingEvents:0});
assert.equal(sheetData.Auditors[1][1],'');
assert.equal((await firestore.readEditEvent([...events.keys()][0])).state,'PROJECTED');
assert.deepEqual(await projector.reconcile(),{verified:true,updatedCells:0,acknowledgedEvents:0,pendingEvents:0});
assert.equal(rawSheetWrites,1);

console.log('Scope20 Firestore qualifications: UID-bound migration, manifest, complete read and create-only apply');
