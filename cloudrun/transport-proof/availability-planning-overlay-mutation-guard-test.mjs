import assert from 'node:assert/strict';
import {createPlanningOverlayService} from './availability-planning-overlay-service-20.js';
const rows=[['Audit ID','Status','Assigned to','Planning JSON'],['A1','ACCEPTED','a@example.com',JSON.stringify([{date:'2027-01-12',start:'09:00',end:'12:00'}])],['A2','PENDING_APPROVAL','a@example.com',JSON.stringify([{date:'2027-01-13',start:'10:00',end:'11:00'}])]];
let calls=0;
const service={read:async()=>({}),mutate:async()=>{calls++;return {success:true}}};
const overlay=createPlanningOverlayService({service,readPlanningRows:async()=>rows,listCanonicalAuditors:async()=>[{auditorId:'a',email:'a@example.com'}]});
const actor={id:'manager:x',role:'manager'},base={actor,auditorId:'a',expectedVersion:0};
await assert.rejects(()=>overlay.mutate({...base,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-01',toDate:'2027-12-31',wholeDay:true}}),/COMMITTED_CONFLICT/);
assert.equal(calls,0);
await overlay.mutate({...base,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-12',toDate:'2027-01-12',start:'12:00',end:'17:00'}});
assert.equal(calls,1);
await overlay.mutate({...base,mutation:{action:'BLOCK_PERIOD',fromDate:'2027-01-13',toDate:'2027-01-13',start:'10:00',end:'11:00'}});
assert.equal(calls,2); // provisional reservation is not committed
await overlay.mutate({...base,mutation:{action:'RELEASE_BASELINE',targetExceptionId:'x',date:'2027-01-12',wholeDay:true}});
assert.equal(calls,3);
console.log('PASS: committed mutation guard, boundary, provisional, release');