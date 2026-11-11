import assert from 'node:assert/strict';
import {prepareCompositionAvailabilityInvalidation20 as plan} from './visit-composition-availability-invalidation-20.mjs';
const input=()=>({
 command:{auditId:'A-1',mode:'SEPARATELY',visits:[
  {auditId:'A-1',obligationId:'O-1'},
  {auditId:'A-2',obligationId:'O-2'},
  {auditId:'A-3',obligationId:'O-3'}
 ]},
 entities:[
  {auditId:'A-1',auditorId:'AUD-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
  {auditId:'A-2',auditorId:'AUD-1',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]},
  {auditId:'A-3',auditorId:'AUD-2',blocks:[{date:'2026-12-02',start:'09:00',end:'12:00'}]}
 ],
 operationId:'COMPOSE_OP_1'
});
const evidence=plan(input());
assert.equal(evidence.scope,'RESOLVED_AVAILABILITY_CACHE');
assert.equal(evidence.readModelOnly,true);
assert.equal(evidence.writeEnabled,false);
assert.equal(evidence.affectedAuditors,2);
assert.deepEqual(evidence.targets[0],{
 auditorUid:'AUD-1',auditIds:['A-1','A-2'],dates:['2026-11-18','2026-11-19']
});
assert.deepEqual(evidence.targets[1],{
 auditorUid:'AUD-2',auditIds:['A-3'],dates:['2026-12-02']
});
const together=input();
together.command={auditId:'A-1',mode:'TOGETHER'};
together.entities=[together.entities[0]];
assert.equal(plan(together).affectedAuditors,1);
const reject=(mutate,code)=>{
 const x=input();mutate(x);
 assert.throws(()=>plan(x),e=>e?.code===code,code);
};
reject(x=>{x.entities[1].auditId='A-1'},'COMPOSITION_INVALIDATION_VISIT_IDENTITY_INVALID');
reject(x=>{x.entities[1].auditId='FOREIGN'},'COMPOSITION_INVALIDATION_VISIT_SET_MISMATCH');
reject(x=>{x.entities[0].blocks[0].date='2026-02-30'},'COMPOSITION_INVALIDATION_DATE_INVALID');
reject(x=>{x.entities[0].auditorId=''},'COMPOSITION_INVALIDATION_VISIT_IDENTITY_INVALID');
reject(x=>{x.entities[0].blocks=Array.from({length:91},(_,i)=>({
 date:new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10),
 start:'08:00',end:'09:00'
}))},'COMPOSITION_INVALIDATION_RANGE_TOO_BROAD');
console.log('VISIT_COMPOSITION_AVAILABILITY_INVALIDATION_20_PASS: targeted cache dates per auditor, zero Availability writes');
