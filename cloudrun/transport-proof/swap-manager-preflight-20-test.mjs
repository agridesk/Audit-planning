import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const saved={status:'CONFIRMED',auditA:'A',auditB:'B',originalRevisions:{A:'rev-a',B:'rev-b'},blocksA:[{date:'2026-10-21',start:'09:00',end:'11:00'}],blocksB:[{date:'2026-10-22',start:'13:00',end:'15:00'}]};
let received;
const ctx={Error,JSON,String,
 V5_AUTH:{validateTrustedTokenByRole:(token,role)=>token==='valid'&&role==='Manager'?{ok:true,email:'manager@example.com'}:{ok:false}},
 Swap20Store_read_:()=>saved,
 Swap20CanonicalCommitGuard:input=>{received=input;return {ok:true,readOnly:true};}
};
runInNewContext(readFileSync(new URL('Swap20ManagerCommitPreflight.js',root),'utf8'),ctx);
assert.equal(ctx.Swap20ManagerCommitPreflight({token:'valid',operationId:'swap-1',blocksA:[{date:'2030-01-01'}]}).ok,true);
assert.equal(received.blocksA,saved.blocksA);
assert.equal(received.blocksB,saved.blocksB);
assert.throws(()=>ctx.Swap20ManagerCommitPreflight({token:'invalid',operationId:'swap-1'}),/authentication/);
saved.status='WITHDRAWN';
assert.throws(()=>ctx.Swap20ManagerCommitPreflight({token:'valid',operationId:'swap-1'}),/Confirmed proposal required/);
console.log('Swap manager immutable commit preflight tests passed');
