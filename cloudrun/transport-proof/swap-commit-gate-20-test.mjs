import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const proposal={operationId:'swap-commit-1',status:'CONFIRMED',auditA:'A',auditB:'B',originalRevisions:{A:'1',B:'2'},blocksA:[],blocksB:[]};
let preflight=0,history=[],enabled=false;
const props={getProperty:key=>key==='AMS_ENV'?'DEV':key==='AMS_SWAP20_COMMIT_ENABLED'?(enabled?'true':'false'):''};
const ctx={Error,String,PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'DEV'})},Date,JSON,
 PropertiesService:{getScriptProperties:()=>props},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 V5_AUTH:{validateTrustedTokenByRole:token=>token==='valid'?{ok:true,email:'manager@example.com'}:{ok:false}},
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>history,
 Swap20_executeLocked_:()=>{preflight++;return {committed:true}}
};
runInNewContext(readFileSync(new URL('Swap20AtomicCommitGate.js',root),'utf8'),ctx);
assert.throws(()=>ctx.Swap20ManagerCommit({token:'invalid',operationId:proposal.operationId}),/authentication/);
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}).code,'SWAP_ATOMIC_WRITE_DISABLED');
assert.equal(preflight,0);
enabled=true;
history=[{stage:'PREPARED'}];
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}).code,'SWAP_ATOMIC_WRITE_DISABLED');
proposal.status='WITHDRAWN';
history=[];
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}).code,'SWAP_ATOMIC_WRITE_DISABLED');
assert.equal(preflight,0);
console.log('Swap fail-closed atomic commit gate tests passed');
