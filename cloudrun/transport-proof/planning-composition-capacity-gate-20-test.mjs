import assert from 'node:assert/strict';
import {createCompositionCapacityGate20} from './planning-composition-capacity-gate-20.mjs';
let acquired=0,released=0,uncertain=0,blocked=false,records=[];
const uid='AUD-1',email='auditor@example.com';
const reader={async readQualifications(){return {
 auditorRows:[['Name','E-mail','Role','Active','Auditor_UID'],['Auditor',email,'Auditor','Yes',uid]],
 qualificationRows:[['Auditor_UID','ScopeCode','Qualified'],[uid,'MPS-GAP','YES'],[uid,'GRASP','YES']]
}}};
const availabilityService={
 async acquirePlanningLease(args){acquired++;records.push(args);return {token:'L'+acquired,document:{version:1}}},
 async releasePlanningLease(){released++},
 async markPlanningLeaseUncertain(){uncertain++}
};
const gate=createCompositionCapacityGate20({
 canonicalReader:reader,availabilityService,
 hardGate:({blocks})=>{if(blocked||!blocks.length)throw Error('BLOCKED')},
 roster:async()=>[{auditorId:uid,email,role:'auditor',active:true}]
});
const actor={role:'manager',auditorId:'M-1'};
const blocks=[{date:'2026-11-18',start:'08:00',end:'16:00'}];
const command={
 mode:'TOGETHER',obligations:[
 {obligationId:'O1',scopeCode:'MPS-GAP'},{obligationId:'O2',scopeCode:'GRASP'}
 ]};
const entities=[{auditId:'A-1',auditorId:uid,blocks,nextSnapshot:{auditId:'A-1'}}];
const ok=await gate.acquire({actor,command,entities});
assert.equal(ok.leaseCount,1);
assert.equal(acquired,1);assert.equal(released,0);
await ok.release();assert.equal(released,1);
blocked=true;
await assert.rejects(()=>gate.acquire({actor,command,entities}),/BLOCKED/);
assert.equal(acquired,2);assert.equal(released,2);
blocked=false;
const separated={...command,mode:'SEPARATELY'};
const two=[
 {...entities[0],nextSnapshot:{obligationId:'O1'}},
 {auditId:'A-2',auditorId:uid,blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}],nextSnapshot:{obligationId:'O2'}}
];
const split=await gate.acquire({actor,command:separated,entities:two});
assert.equal(split.leaseCount,2);assert.equal(acquired,4);
await split.uncertain('SIMULATED_PROJECTION_OUTCOME_UNKNOWN');
assert.equal(uncertain,2);
assert.equal(records[0].auditorId,uid);
assert.equal(records[0].auditorEmail,email);
await assert.rejects(()=>gate.acquire({actor,command:{...command,obligations:[{scopeCode:'UNKNOWN'}]},entities}),/COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED/);
assert.equal(acquired,4);
console.log('VISIT_COMPOSITION_CAPACITY_GATE_20_PASS: canonical qualifications, per-visit leases, release, uncertain recovery, fail-closed');
