import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRotationRealizedAuditFirestoreStore20,prepareRotationRealizedAuditMigration20,rotationRealizedAuditRows20} from './rotation-realized-audit-firestore-20.mjs';
import {buildRotationManager20} from './rotation-manager-20.mjs';

const scopeRows=[
 ['SlotKey','ScopeCode','DisplayName','Active','Archived','Rotation_Applies','Rotation_Normal_Maximum'],
 ['SCOPE_01','ABC','ABC','TRUE','FALSE','TRUE','3']
];
const completedRows=[
 ['Company','Company_UID','Auditor_UID','Status','Date completed','Audit ID','SCOPE_01'],
 ['Example company','COMPANY-1','UID-1','Completed','2026-03-02','AUDIT-1','X']
];
const plan=prepareRotationRealizedAuditMigration20({scopeRows,completedRows});
assert.equal(plan.stats.completedAudits,1);
assert.equal(plan.stats.scopeEvents,1);
assert.deepEqual(plan.records[0],{
 auditId:'AUDIT-1',company:'Example company',companyUid:'COMPANY-1',auditorUid:'UID-1',
 status:'Completed',completedAt:'2026-03-02',year:2026,scopeSlots:['SCOPE_01']
});
assert.equal(Object.keys(plan.records[0]).some(key=>/email/i.test(key)),false);
assert.throws(()=>prepareRotationRealizedAuditMigration20({scopeRows,completedRows:[completedRows[0],['Example company','COMPANY-1','auditor@example.test','Completed','2026-03-02','AUDIT-1','X']]}),/ROTATION_AMS_AUDITOR_UID_UNRESOLVED/);
assert.throws(()=>prepareRotationRealizedAuditMigration20({scopeRows,completedRows:[completedRows[0],['Example company','COMPANY-1','UID-1','Completed','March 2, 2026','AUDIT-1','X']]}),/ROTATION_HISTORY_DATE_INVALID/);

const auditors=[['Name','E-mail','Auditor_UID'],['Auditor One','auditor@example.test','UID-1']];
const readmodel=buildRotationManager20(scopeRows,auditors,rotationRealizedAuditRows20(plan.records,scopeRows));
assert.equal(readmodel.rows.length,1);
assert.equal(readmodel.rows[0].auditorUid,'UID-1');
assert.equal(readmodel.rows[0].companyUid,'COMPANY-1');

const docs=new Map();
const liveDocs=new Map();
let writeCount=0;
const respond=(status,value)=>({status,ok:status>=200&&status<300,json:async()=>value});
const encode=value=>{
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='number')return {integerValue:String(value)};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
};
const fetchImpl=async(url,options={})=>{
 const method=options.method||'GET';
 const path=new URL(url).pathname;
 if(method==='GET'&&path.endsWith('/ams_rotation_realized_audit_migrations_20_dev/active')){
  return docs.has('migration')?respond(200,docs.get('migration')):respond(404,{});
 }
 if(method==='GET'&&path.endsWith('/ams_rotation_realized_audits_20_dev')){
  return respond(200,{documents:[...docs.entries()].filter(([id])=>id!=='migration').map(([,doc])=>doc)});
 }
 if(method==='GET'&&path.endsWith('/ams_rotation_realized_audit_events_20_dev')){
  return respond(200,{documents:[...liveDocs.values()]});
 }
 if(method==='POST'&&path.endsWith('/documents:commit')){
  writeCount++;
  const body=JSON.parse(options.body);
  for(const write of body.writes){
   const id=write.update.name.split('/').pop();
   const key=write.update.name.includes('/ams_rotation_realized_audit_migrations_20_dev/')?'migration':id;
   if(write.currentDocument?.exists===false&&docs.has(key))return respond(409,{});
   docs.set(key,{name:write.update.name,fields:write.update.fields,updateTime:'2026-11-22T00:00:00Z'});
  }
  return respond(200,{});
 }
 throw Error('Unexpected Firestore request');
};
const store=createRotationRealizedAuditFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=>'test-token',fetchImpl});
await assert.rejects(store.read(),/ROTATION_FIRESTORE_MIGRATION_NOT_READY/);
const preview=await store.preview(plan);
assert.equal(preview.ready,true);
assert.equal(preview.createCount,1);
assert.equal(writeCount,0);
await assert.rejects(store.apply({...plan,confirm:false}),/ROTATION_FIRESTORE_CONFIRM_REQUIRED/);
assert.equal(writeCount,0);
const applied=await store.apply({...plan,confirm:true});
assert.equal(applied.applied,true);
assert.equal(applied.created,1);
assert.equal(writeCount,2);
assert.deepEqual(await store.read(),plan.records);
const liveRecord={...plan.records[0],auditId:'AUDIT-2',auditorUid:'UID-2',companyUid:'COMPANY-2'};
const liveId=createHash('sha256').update(liveRecord.auditId).digest('hex');
liveDocs.set(liveId,{name:'projects/audit-management-system-dev/databases/(default)/documents/ams_rotation_realized_audit_events_20_dev/'+liveId,
 fields:{payload:encode(liveRecord)},updateTime:'2026-11-22T00:00:00Z'});
assert.deepEqual(await store.read(),[plan.records[0],liveRecord]);
const duplicateId=createHash('sha256').update(plan.records[0].auditId).digest('hex');
liveDocs.set(duplicateId,{name:'projects/audit-management-system-dev/databases/(default)/documents/ams_rotation_realized_audit_events_20_dev/'+duplicateId,
 fields:{payload:encode(plan.records[0])},updateTime:'2026-11-22T00:00:00Z'});
assert.deepEqual(await store.read(),[plan.records[0],liveRecord],'identical baseline/live events deduplicate');
liveDocs.set(duplicateId,{name:'projects/audit-management-system-dev/databases/(default)/documents/ams_rotation_realized_audit_events_20_dev/'+duplicateId,
 fields:{payload:encode({...plan.records[0],company:'Conflicting company'})},updateTime:'2026-11-22T00:00:00Z'});
await assert.rejects(store.read(),/ROTATION_FIRESTORE_LIVE_CONFLICT/);
const replay=await store.preview(plan);
assert.equal(replay.ready,true);
assert.equal(replay.createCount,0);
assert.equal(replay.replayCount,1);
await assert.rejects(store.preview({...plan,sourceManifest:'0'.repeat(64)}),/ROTATION_FIRESTORE_SOURCE_CHANGED/);

console.log('rotation realized-audit Firestore migration: PASS');
