import assert from 'node:assert/strict';
import {assertAuditorAcceptCutover20 as guard} from './lifecycle-accept-cutover-20.mjs';
const valid={environment:'DEV',enabled:true,canonicalOwner:'CLOUD_RUN',gasAcceptDisabled:true,managerAcceptFenced:true,sharedFenceVerified:true,outboxVerified:true,auditorUid:'auditor_012345',auditId:'audit_012345',expectedRevision:'abcdef012345abcdef012345'};
assert.equal(guard(valid),true);
const cases=[
 ['environment','PROD','DEV_ONLY'],
 ['enabled',false,'DIRECT_DISABLED'],
 ['canonicalOwner','GAS','OWNER_UNVERIFIED'],
 ['gasAcceptDisabled',false,'WRITER_STILL_ACTIVE'],
 ['managerAcceptFenced',false,'WRITER_UNFENCED'],
 ['sharedFenceVerified',false,'FENCE_UNVERIFIED'],
 ['outboxVerified',false,'OUTBOX_UNVERIFIED'],
 ['auditorUid','','UID_INVALID'],
 ['auditId','','AUDIT_ID_INVALID'],
 ['expectedRevision','','REVISION_REQUIRED']
];
for(const [key,value,code] of cases)assert.throws(()=>guard({...valid,[key]:value}),new RegExp(code));
console.log('LIFECYCLE_ACCEPT_CUTOVER_FAIL_CLOSED_PASS '+cases.length+' rejection cases');
