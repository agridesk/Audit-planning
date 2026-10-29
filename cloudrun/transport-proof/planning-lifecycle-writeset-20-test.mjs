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
await assert.rejects(()=>normalizeLifecycleWriteset({writes:[{range:'Audit planning!A2:B3',values:[['invalid']]}],readBefore:async()=>[]}),/LIFECYCLE_WRITESET_VALUES_INVALID/);
await assert.rejects(()=>normalizeLifecycleWriteset({writes:[{range:'Audit planning!A0:C0',values:[['x','y','z']]}],readBefore:async()=>[]}),/LIFECYCLE_WRITESET_RANGE_UNSUPPORTED/);
console.log('Lifecycle writeset: overlapping transfer updates, successor rows, original images and invalid rows passed');
