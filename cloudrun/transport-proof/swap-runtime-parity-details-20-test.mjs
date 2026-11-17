import assert from 'node:assert/strict';
import {buildSwapRuntimeParityDetails} from './swap-dev-backfill-cli-20.mjs';

const auditName='projects/dev/databases/(default)/documents/ams_swap20_dev_audits/AUD-1';
const availabilityName='projects/dev/databases/(default)/documents/ams_swap20_dev_availability/AUD-1';
const writes=[
 {update:{name:auditName,fields:{payload:{stringValue:JSON.stringify({plannedBlocks:[{date:'2026-11-17'}],status:'Accepted'})}}}},
 {update:{name:availabilityName,fields:{payload:{stringValue:JSON.stringify({reservations:[],status:'Accepted'})}}}},
 {update:{name:'projects/dev/databases/(default)/documents/ams_swap20_dev_audits/AUD-2',fields:{payload:{stringValue:'{"plannedBlocks":[]}'}}}}
];
const existing=new Map([
 [auditName,{fields:{payload:{stringValue:'{"plannedBlocks":[],"status":"Accepted"}'}}}],
 [availabilityName,{fields:{payload:{stringValue:'{"reservations":[],"status":"Accepted"}'}}}]
]);

const result=buildSwapRuntimeParityDetails(writes,existing);
assert.deepEqual(result.collections,{
 ams_swap20_dev_audits:{expected:2,missing:1,drift:1},
 ams_swap20_dev_availability:{expected:1,missing:0,drift:0}
});
assert.deepEqual(result.missingDocuments,[
 {collection:'ams_swap20_dev_audits',auditId:'AUD-2'}
]);
assert.deepEqual(result.drift.map(({collection,auditId,changedFields})=>({collection,auditId,changedFields})),[
 {collection:'ams_swap20_dev_audits',auditId:'AUD-1',changedFields:['plannedBlocks']}
]);
assert.throws(
 ()=>buildSwapRuntimeParityDetails([{update:{name:auditName,fields:{payload:{stringValue:'not-json'}}}}],new Map([[auditName,{fields:{payload:{stringValue:'{}'}}}]])),
 {message:'SWAP_RUNTIME_PARITY_PAYLOAD_INVALID'}
);
console.log('SWAP runtime parity document details passed');
