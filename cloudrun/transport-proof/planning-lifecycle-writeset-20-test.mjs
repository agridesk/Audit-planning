import assert from 'node:assert/strict';
import {normalizeLifecycleWriteset} from './planning-lifecycle-writeset-20.js';
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
const reused=await normalizeLifecycleWriteset({
 writes:[{range:'Audit planning!B2:D2',values:[['Accepted']]},{range:'Auditor Availability!A3',values:[['Busy']]}],
 planningRows:[['ID','Status','Note','Date'],['audit-2','Approved',0]],
 readBefore:async ranges=>{
  assert.deepEqual(ranges,['Auditor Availability!A3:A3']);
  return [{values:[['Free']]}];
 }
});
assert.deepEqual(reused.projectionPreconditions,[
 {range:'Audit planning!B2:D2',before:['Approved',0,'']},
 {range:'Auditor Availability!A3:A3',before:['Free']}
]);
console.log('Lifecycle writeset: overlapping transfer updates, successor rows, original images and invalid rows passed');
