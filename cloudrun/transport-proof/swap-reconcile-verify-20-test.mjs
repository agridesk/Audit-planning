import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20CommittedReconciliation.js',import.meta.url),'utf8');
let calls=0, allow=true;
const ctx={String,Error,
 PlanningWorkspacePlannedAuditReadService_get:({auditId})=>({assignedTo:auditId==='A'?'first@example.test':'second@example.test',auditorEmail:auditId==='A'?'first@example.test':'second@example.test'}),
 Swap20_availabilityPlan_:(availability,proposal,owners)=>{
   assert.equal(owners.A,'first@example.test');
   assert.equal(owners.B,'second@example.test');
   return {sheetName:'Availability',width:5,originalHeight:2,values:[[],[]]};
 },
 Swap20_verifyAppliedPairLocked_:()=>{calls++;return allow;}
};
runInNewContext(src,ctx);
const before={canonical:{headers:['Audit ID','Assigned to'],rows:[
 {auditId:'A',values:['A','first@example.test']},{auditId:'B',values:['B','second@example.test']}
]},availability:{sheetName:'Availability',width:5,height:2}};
const history=[{stage:'PREPARED',payload:before},{stage:'WRITING'},{stage:'COMMITTED'}];
const proposal={auditA:'A',auditB:'B'};
assert.equal(ctx.Swap20_verifyCommittedReconciliationLocked_(history,proposal),true);
assert.equal(calls,1);
allow=false;
assert.equal(ctx.Swap20_verifyCommittedReconciliationLocked_(history,proposal),false);
assert.equal(calls,2);
assert.equal(ctx.Swap20_verifyCommittedReconciliationLocked_([{stage:'COMMITTED'}],proposal),false);
assert.equal(ctx.Swap20_verifyCommittedReconciliationLocked_(history,{auditA:'B',auditB:'A'}),false);
assert.equal(calls,2);
console.log('SWAP reconciliation verification contract tests passed');
