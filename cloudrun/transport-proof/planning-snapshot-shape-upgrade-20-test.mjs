import assert from 'node:assert/strict';
import {createPlanningAtomicFirestoreStore} from './planning-atomic-firestore-store-20.js';
import {executeSnapshotShapeUpgrades20,planSnapshotShapeUpgrades20} from './planning-snapshot-shape-upgrade-20.js';

const docs=new Map(),prefix='projects/audit-management-system-dev/databases/(default)/documents/';
let clock=0,commits=0;
const copy=v=>structuredClone(v);
const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:
 Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const response=(status,json)=>({ok:status>=200&&status<300,status,async json(){return copy(json);}});
const fetchImpl=async(url,init={})=>{
 const path=decodeURIComponent(new URL(url).pathname),method=init.method||'GET';
 if(path.endsWith(':beginTransaction'))return response(200,{transaction:'tx'});
 if(path.endsWith(':commit')){
  commits++;const {writes}=JSON.parse(init.body);
  for(const w of writes){const k=(w.update?.name||w.delete).slice(prefix.length),p=w.currentDocument;if(p?.exists===false&&docs.has(k)||p?.updateTime&&p.updateTime!==docs.get(k)?.updateTime)return response(409,{});}
  for(const w of writes){const k=(w.update?.name||w.delete).slice(prefix.length);if(w.delete)docs.delete(k);else docs.set(k,{name:'x/'+w.update.name,updateTime:'t'+(++clock),fields:copy(w.update.fields)});}
  return response(200,{commitTime:'now',writeResults:writes.map(()=>({}))});
 }
 if(method==='GET'){const d=docs.get(path.split('/documents/')[1]);return d?response(200,d):response(404,{});}
 throw Error('MOCK_METHOD');
};
const store=createPlanningAtomicFirestoreStore({projectId:'audit-management-system-dev',getToken:async()=>'token',fetchImpl});
const put=(id,value)=>docs.set('ams_planning_20_dev_audits/'+id,{name:'x',updateTime:'t'+(++clock),fields:{payload:encode(value)}});

const headers=['Audit ID','Status','Auditor_UID','Planning JSON','Company'];
const sheet=[headers,['OK1','Approved','UID-1','{"b":1}','C1'],['BAD1','Approved','UID-2','{"b":2}','C2'],['DONE','Approved','UID-3','{}','C3']];
const legacy=(auditId,status,uid,json,extra={})=>({auditId,revision:0,auditorId:uid,claimIds:['claim-'+auditId],blocks:[{date:'2027-01-01'}],pendingOperationId:null,lastOperationId:null,
 snapshot:{auditId,status,auditorUid:uid,planningJson:json,sourceRevision:'a'.repeat(24)},...extra});
const records=[
 legacy('OK1','Approved','UID-1','{"b":1}'),
 legacy('BAD1','Approved','UID-OTHER','{"b":2}'),
 legacy('GONE','Approved','UID-4','{}'),
 {auditId:'DONE',revision:2,snapshot:{auditId:'DONE',status:'Approved',headers,row:sheet[3],sourceRow:4}},
 legacy('OLD','Approved','UID-5','{}',{removed:true})
];
for(const r of records)put(r.auditId,r);

// Plan: only the exact authority match is eligible; mismatches are counted, shaped/removed ignored.
const plan=planSnapshotShapeUpgrades20(sheet,records);
assert.equal(plan.eligible,1);assert.equal(plan.legacySnapshots,3);
assert.deepEqual(plan.blocked,{AUDITOR_UID_MISMATCH:1,SHEET_ROW_MISSING:1});
assert.deepEqual(plan.candidates.map(c=>[c.auditId,c.sourceRow,c.expectedRevision]),[['OK1',2,0]]);
assert.match(plan.manifest,/^[0-9a-f]{64}$/);
assert.equal(commits,0,'planning never writes');
assert.throws(()=>planSnapshotShapeUpgrades20([['Audit ID']],records),/SHAPE_UPGRADE_HEADERS_MISSING/);

// Execute refuses blocked rows and stale manifests without writing.
await assert.rejects(()=>executeSnapshotShapeUpgrades20({store,sheetValues:sheet,records,manifest:plan.manifest}),/SHAPE_UPGRADE_BLOCKED_ROWS_PRESENT/);
const cleanRecords=records.filter(r=>['OK1','DONE','OLD'].includes(r.auditId));
const cleanPlan=planSnapshotShapeUpgrades20(sheet,cleanRecords);
await assert.rejects(()=>executeSnapshotShapeUpgrades20({store,sheetValues:sheet,records:cleanRecords,manifest:'0'.repeat(64)}),/SHAPE_UPGRADE_MANIFEST_CHANGED/);
assert.equal(commits,0);

// Execute: adds only headers/row/sourceRow; revision, claims, blocks and operation markers unchanged.
const before=await store.readAudit('OK1');
assert.deepEqual(await executeSnapshotShapeUpgrades20({store,sheetValues:sheet,records:cleanRecords,manifest:cleanPlan.manifest}),{eligible:1,upgraded:1,replayed:0,manifest:cleanPlan.manifest});
const after=await store.readAudit('OK1');
assert.equal(commits,1);
const {headers:h,row,sourceRow,shapeUpgradedAt,...restSnapshot}=after.snapshot;
assert.deepEqual(h,headers);assert.deepEqual(row,sheet[1]);assert.equal(sourceRow,2);assert.ok(shapeUpgradedAt);
assert.deepEqual(restSnapshot,before.snapshot);
const {snapshot:_a,...restAfter}=after,{snapshot:_b,...restBefore}=before;
assert.deepEqual(restAfter,restBefore);
assert.equal([...docs.keys()].filter(k=>!k.startsWith('ams_planning_20_dev_audits/')).length,0,'no outbox or claim writes');

// Replay is idempotent (no write); conflicting shape and stale revision fail closed.
const candidate=cleanPlan.candidates[0];
assert.deepEqual(await store.upgradeSnapshotShape(candidate),{upgraded:false,seeded:false,idempotent:true});
assert.equal(commits,1);
await assert.rejects(()=>store.upgradeSnapshotShape({...candidate,row:[...candidate.row.slice(0,4),'OTHER']}),/PLANNING_SHAPE_UPGRADE_ALREADY_SHAPED/);
await assert.rejects(()=>store.upgradeSnapshotShape({...candidate,expectedRevision:1}),/PLANNING_SHAPE_UPGRADE_REVISION_CONFLICT/);
await assert.rejects(()=>store.upgradeSnapshotShape({...candidate,auditId:'OLD',expectedRevision:0}),/PLANNING_SHAPE_UPGRADE_STATE_INVALID/);
await assert.rejects(()=>store.upgradeSnapshotShape({...candidate,auditId:'MISSING'}),/PLANNING_SHAPE_UPGRADE_AUDIT_MISSING/);
assert.equal(commits,1);

// After upgrade nothing remains eligible.
const upgradedRecords=cleanRecords.map(r=>r.auditId==='OK1'?after:r);
assert.equal(planSnapshotShapeUpgrades20(sheet,upgradedRecords).legacySnapshots,0);
console.log('planning-snapshot-shape-upgrade-20 OK');
