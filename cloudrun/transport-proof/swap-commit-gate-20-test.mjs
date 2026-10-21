import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const proposal={operationId:'swap-commit-1',status:'CONFIRMED',auditA:'A',auditB:'B',originalRevisions:{A:'1',B:'2'},blocksA:[],blocksB:[]};
let preflight=0,history=[];
const ctx={Error,String,
 V5_AUTH:{validateTrustedTokenByRole:token=>token==='valid'?{ok:true,email:'manager@example.com'}:{ok:false}},
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>history,
 Swap20CanonicalCommitGuard:()=>{preflight++;return {ok:true};}
};
runInNewContext(readFileSync(new URL('Swap20AtomicCommitGate.js',root),'utf8'),ctx);
assert.throws(()=>ctx.Swap20ManagerCommit({token:'invalid',operationId:proposal.operationId}),/authentication/);
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}).code,'SWAP_ATOMIC_WRITE_DISABLED');
assert.equal(preflight,1);
history=[{stage:'PREPARED'}];
assert.throws(()=>ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}),/recovery required/);
proposal.status='WITHDRAWN';
assert.throws(()=>ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}),/Confirmed/);
console.log('Swap fail-closed atomic commit gate tests passed');
