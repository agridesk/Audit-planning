import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDirectAuditorAccept20 as prepare} from './lifecycle-auditor-accept-direct-20.mjs';
const headers=['Audit ID','Status','Assigned to','Planning JSON','Last decision timestamp','Status since','Auditor_UID','Last auditor decision','Last auditor decision timestamp','Date accepted'];
const row=['audit_012345','Approved','Auditor Example','{}','','','auditor_012345','','',''];
const expectedRevision=createHash('sha256').update([row[0],row[1],row[2],row[3],row[4],row[5]].join('|')).digest('hex').slice(0,24);
const cutover={environment:'DEV',enabled:true,canonicalOwner:'CLOUD_RUN',gasAcceptDisabled:true,managerAcceptFenced:true,sharedFenceVerified:true,outboxVerified:true,expectedRevision};
const actor={role:'AUDITOR',email:'auditor@example.org',auditorUid:'auditor_012345'};
const roster={headers:['Auditor_UID','E-mail','Role','Active','Name','Abbreviation'],rows:[['auditor_012345','auditor@example.org','AUDITOR','YES','Auditor Example','AE']]};
const args={cutover,actor,roster,audit:{headers,row,sourceRow:3},now:'2026-10-27T23:00:00'};
const result=prepare(args);
assert.equal(result.afterStatus,'Accepted');assert.equal(result.row[1],'Accepted');assert.equal(result.row[6],'auditor_012345');assert.equal(row[1],'Approved');assert.equal(result.needsAtomicOutbox,true);
for(const [name,patch,error] of [
 ['wrong revision',{cutover:{...cutover,expectedRevision:'0'.repeat(24)}},'REVISION_CONFLICT'],
 ['other UID',{actor:{...actor,auditorUid:'auditor_999999'}},'IDENTITY_NOT_UNIQUE'],
 ['wrong role',{actor:{...actor,role:'MANAGER'}},'ACTOR_INVALID'],
 ['invalid status',{audit:{headers,row:row.map((v,i)=>i===1?'Accepted':v),sourceRow:3}},'STATUS_CONFLICT'],
 ['wrong owner',{cutover:{...cutover,gasAcceptDisabled:false}},'WRITER_STILL_ACTIVE'],
 ['wrong assignment',{audit:{headers,row:row.map((v,i)=>i===2?'Unassigned':v),sourceRow:3}},'ASSIGNMENT_MISMATCH']
])assert.throws(()=>prepare({...args,...patch}),new RegExp(error),name);
console.log('LIFECYCLE_DIRECT_AUDITOR_ACCEPT_PREPARATION_PASS 7');
