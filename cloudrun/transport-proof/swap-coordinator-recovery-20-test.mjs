import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const p={operationId:'swap-12345678',auditA:'A',auditB:'B',status:'CONFIRMED',originalRevisions:{A:'ra',B:'rb'},blocksA:[{date:'2026-10-22',start:'09:00',end:'10:00'}],blocksB:[{date:'2026-10-21',start:'09:00',end:'10:00'}]};
function fixture(failure){
 const events=[],journal=[];
 const ctx={Error,String,JSON,Array,Number,Math,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'DEV'})},
 Swap20Store_read_:()=>p,Swap20Journal_history_:()=>journal.slice(),
 Swap20CanonicalCommitGuard:()=>({ok:true}),
 Swap20_captureCanonicalBeforeImages_:()=>({sheetName:'Audit planning',headers:['Assigned to'],rows:[{auditId:'A',values:['a@x.com']},{auditId:'B',values:['b@x.com']}]}),
 Swap20_captureAvailabilityBeforeImages_:()=>({sheetName:'Auditor Availability',height:1,width:1,values:[['Date']]}),
 Swap20_availabilityPlan_:()=>({sheetName:'Auditor Availability',width:1,values:[['Date']]}),
 Swap20Journal_appendLocked_:(_,seq,stage,payload)=>{assert.equal(seq,journal.length);journal.push({stage,payload});events.push(stage);},
 Swap20_verifyCanonicalBeforeImages_:()=>{if(failure==='prewrite')throw Error('prewrite');},
 Swap20_writeAvailabilityPlanLocked_:()=>{if(failure==='availability')throw Error('availability');events.push('availability');},
 Swap20_writeCanonicalPairLocked_:()=>{if(failure==='canonical')throw Error('canonical');events.push('canonical');},
 Swap20_verifyAppliedPairLocked_:()=>{if(failure==='verification')throw Error('verification');events.push('verified');},
 Swap20_restoreCanonicalBeforeImages_:()=>events.push('restoreCanonical'),
 Swap20_restoreAvailabilityBeforeImages_:()=>events.push('restoreAvailability')};
 for(const file of ['Swap20TransactionCoordinator.js','Swap20TransactionRecovery.js'])runInNewContext(readFileSync(new URL(file,root),'utf8'),ctx);
 return {ctx,journal,events};
}
const ok=fixture();assert.equal(ok.ctx.Swap20_executeLocked_(p).committed,true);assert.equal(ok.journal.at(-1).stage,'COMMITTED');
for(const stage of ['availability','canonical','verification']){
 const f=fixture(stage);assert.throws(()=>f.ctx.Swap20_executeLocked_(p),/Swap transaction aborted/);
 assert.equal(f.journal.at(-1).stage,'ROLLED_BACK');
 assert.ok(f.events.includes('restoreCanonical'));assert.ok(f.events.includes('restoreAvailability'));
}
const early=fixture('prewrite');assert.throws(()=>early.ctx.Swap20_executeLocked_(p),/before data writes/);
assert.equal(early.journal.at(-1).stage,'CONFLICT');assert.ok(!early.events.includes('restoreCanonical'));
const stale=fixture();stale.ctx.Swap20Store_read_=()=>({...p,status:'WITHDRAWN'});
assert.throws(()=>stale.ctx.Swap20_executeLocked_(p),/Proposal changed/);assert.equal(stale.journal.length,0);
const interrupted=fixture();interrupted.journal.push({stage:'PREPARED',payload:{}});interrupted.journal.push({stage:'WRITING',payload:{}});
assert.equal(interrupted.ctx.Swap20_recoverLocked_(p.operationId).readOnly,true);
assert.equal(interrupted.journal.length,2);
console.log('Swap coordinator and recovery regression tests passed');
