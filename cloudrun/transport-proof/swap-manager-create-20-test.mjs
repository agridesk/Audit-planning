import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const b=(date,start,end)=>({date,start,end});
let pair={eligible:true,auditA:{revision:'rev-a',assignedTo:'a@example.com',blocks:[b('2026-10-21','09:00','11:00')]},auditB:{revision:'rev-b',assignedTo:'b@example.com',blocks:[b('2026-10-22','13:00','15:00')]}};
let saved;
const ctx={Error,String,Array,Date,Number,JSON,Set,isNaN,
 V5_AUTH:{validateTrustedTokenByRole:(token,role)=>token==='valid'&&role==='Manager'?{ok:true,email:'manager@example.com'}:{ok:false}},
 Swap20_readCanonicalPair:()=>pair,
 Swap20_resolveAuditorUidForAudit_:id=>id==='A'?'auditor-001':'auditor-002',
 Swap20Store_create_:p=>{saved=structuredClone(p);return {success:true,status:p.status}},
 Swap20Store_read_:()=>null
};
for(const name of ['Swap20OverlapRule.js','Swap20ProposalSchedule.js','Swap20CanonicalCommitGuard.js','Swap20ManagerCommands.js'])runInNewContext(readFileSync(new URL(name,root),'utf8'),ctx);
const input={token:'valid',auditA:'A',auditB:'B',operationId:'swap-create-1',requiredAuditorUids:['auditor-001','auditor-002'],internalReason:'Operational change',ecasComment:'Updated audit visit schedule'};
assert.equal(ctx.Swap20ManagerCreateProposal(input).status,'AWAITING_ACKNOWLEDGEMENT');
assert.equal(saved.blocksA[0].date,'2026-10-22');
assert.equal(saved.blocksB[0].date,'2026-10-21');
assert.equal(saved.dateChanged,true);
pair={...pair,auditB:{...pair.auditB,blocks:[b('2026-10-21','13:00','15:00')]}};
assert.equal(ctx.Swap20ManagerCreateProposal(input).status,'CONFIRMED');
assert.equal(saved.dateChanged,false);
assert.throws(()=>ctx.Swap20ManagerCreateProposal({...input,token:'invalid'}),/authentication/);
assert.throws(()=>ctx.Swap20ManagerCreateProposal({...input,requiredAuditorUids:['auditor-001','auditor-003']}),/identity mismatch/);
console.log('Swap manager proposal creation tests passed');
