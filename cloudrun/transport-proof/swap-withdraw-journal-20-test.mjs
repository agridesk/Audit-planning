import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20ManagerCommands.js',import.meta.url),'utf8');
let stage='CONFLICT',payload={noWrites:true},history=[];
let saved=null;
const proposal={operationId:'SWAP20_test1234',status:'CONFIRMED',auditA:'A',auditB:'B',acknowledgedAuditorUids:[],requiredAuditorUids:[]};
const ctx={String,JSON,Date,Array,Set,Error,
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>history,
 Swap20Store_transition_:(id,expected,next)=>{saved=next;return {success:true,status:next.status}},
};
runInNewContext(src,ctx);
const auth={ok:true,email:'manager@example.com',role:'Manager'};
const withdraw=()=>ctx.Swap20ManagerWithdrawProposalAuthorized_({operationId:proposal.operationId},auth);
history=[{stage:'PREPARED',payload:{}},{stage:'CONFLICT',payload:{noWrites:true}}];
assert.equal(withdraw().status,'WITHDRAWN');
assert.equal(saved.status,'WITHDRAWN');
for(const terminal of ['PREPARED','WRITING','COMMITTED','ROLLING_BACK','FAILED']){
 history=[{stage:'PREPARED',payload:{}},{stage:terminal,payload:{}}];
 assert.throws(withdraw,/SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY/);
}
history=[{stage:'PREPARED',payload:{}},{stage:'CONFLICT',payload:{noWrites:false}}];
assert.throws(withdraw,/SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY/);
history=[{stage:'PREPARED',payload:{}},{stage:'WRITING',payload:{}},{stage:'CONFLICT',payload:{noWrites:true}}];
assert.throws(withdraw,/SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY/);
history=[{stage:'PREPARED',payload:{}},{stage:'ROLLED_BACK',payload:{}}];
assert.equal(withdraw().status,'WITHDRAWN');
history=[];
assert.equal(withdraw().status,'WITHDRAWN');
console.log('SWAP withdrawal journal safety tests passed');
