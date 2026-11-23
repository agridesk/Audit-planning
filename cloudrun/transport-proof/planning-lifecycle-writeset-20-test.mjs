import assert from 'node:assert/strict';
import {normalizeLifecycleWriteset,normalizeRejectWritesetWithPlanning,mergeLifecycleWritesets} from './planning-lifecycle-writeset-20.js';
// Transfer sends several individual RAW A1 writes, while completion supplies
// full-row writes for the parent and new successor. The combined projection
// must be a single canonical final image per row.
const inputs=[
 {range:'Audit planning!B5',values:[['auditor-new']]},
 {range:'Audit planning!D5:E5',values:[['Accepted','2027-01-01']]},
 {range:'Audit planning!B5:D5',values:[['','new-uid','Pending Approval']]},
 {range:'Audit planning!A11:C11',values:[['child-id','Pending Planning','']]},
 {range:'Audit planning!A5:A5',values:[['parent-id']]}
];
const before=new Map([['Audit planning!A5:E5',['parent-id','aud-old','old-uid','Accepted','old-time']],['Audit planning!A11:C11',[]]]);
const normalized=await normalizeLifecycleWriteset({writes:inputs,readBefore:async ranges=>ranges.map(range=>{
 const row=before.get(range)||[];
 if(!before.has(range))throw Error('UNEXPECTED_READ_RANGE_'+range);
 return {range,values:row.length?[row]:[]};
})});
assert.deepEqual(normalized.projectionWrites,[
 {range:'Audit planning!A11:C11',values:[['child-id','Pending Planning','']]},
 {range:'Audit planning!A5:E5',values:[['parent-id','','new-uid','Pending Approval','2027-01-01']]}
]);
assert.deepEqual(normalized.projectionPreconditions,[
 {range:'Audit planning!A11:C11',before:['','','']},
 {range:'Audit planning!A5:E5',before:['parent-id','aud-old','old-uid','Accepted','old-time']}
]);
const trailing=await normalizeLifecycleWriteset({writes:[{range:'Audit planning!A9:E9',values:[['audit-9','Pending Planning']]}],readBefore:async()=>[{values:[['audit-9','Approved','old','','']]}]});
assert.deepEqual(trailing.projectionWrites[0].values,[['audit-9','Pending Planning','','','']]);
assert.deepEqual(trailing.projectionPreconditions[0].before,['audit-9','Approved','old','','']);
await assert.rejects(()=>normalizeLifecycleWriteset({writes:[{range:'Audit planning!A2:B3',values:[['invalid']]}],readBefore:async()=>[]}),/LIFECYCLE_WRITESET_VALUES_INVALID/);
await assert.rejects(()=>normalizeLifecycleWriteset({writes:[{range:'Audit planning!A0:C0',values:[['x','y','z']]}],readBefore:async()=>[]}),/LIFECYCLE_WRITESET_RANGE_UNSUPPORTED/);

const planningRows=[['Audit ID','Status','Assigned to'],['audit-1','Accepted','auditor']];
const rejectWrites=[
 {range:'Company_Scopes!B3:B3',values:[['NO']]},
 {range:'Auditor Availability!A4:C4',values:[['YES','','']]},
 {range:'Company_Scopes!C3:C3',values:[['now']]}
];
const tombstone={range:'Audit planning!A2:C2',values:[['audit-1','Rejected','']]};
let reads=0;
const readBefore=async ranges=>{
 reads++;
 return ranges.map(range=>{
  if(range==='Audit planning!A1:BW2000')return {values:planningRows};
  if(range==='Audit planning!A2:C2')return {values:[planningRows[1]]};
  if(range==='Company_Scopes!B3:C3')return {values:[['YES','old']]};
  if(range==='Auditor Availability!A4:C4')return {values:[['NO','audit-1','Accepted']]};
  throw Error('UNEXPECTED_RANGE_'+range);
 });
};
const batched=await normalizeRejectWritesetWithPlanning({writes:rejectWrites,readBefore});
assert.equal(reads,1);
assert.deepEqual(batched.planning,planningRows);
const normalizedTombstone=await normalizeLifecycleWriteset({writes:[tombstone],
 readBefore:async()=>[{values:[batched.planning[1]]}]});
const merged=mergeLifecycleWritesets(batched.normalized,normalizedTombstone);
const legacy=await normalizeLifecycleWriteset({writes:[...rejectWrites,tombstone],readBefore});
assert.deepEqual(merged,legacy,'batching must preserve all before and after images and their order');
await assert.rejects(()=>normalizeRejectWritesetWithPlanning({writes:[tombstone],readBefore}),/LIFECYCLE_REJECT_PLANNING_WRITES_UNSUPPORTED/);
await assert.rejects(()=>normalizeRejectWritesetWithPlanning({writes:rejectWrites,readBefore:async()=>[]}),/LIFECYCLE_PREFLIGHT_PLANNING_INCOMPLETE/);
assert.throws(()=>mergeLifecycleWritesets(normalizedTombstone,normalizedTombstone),/LIFECYCLE_WRITESET_OVERLAPPING_ROWS/);
console.log('Lifecycle writeset: overlapping transfer updates, successor rows, original images and invalid rows passed');
