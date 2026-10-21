import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../Swap20AtomicCommitGate.js',import.meta.url),'utf8');
const proposal={operationId:'op1',status:'CONFIRMED',auditA:'A',auditB:'B'};
let raw=JSON.stringify(proposal),writes=0,locked=false;
const key='AMS_SWAP20_PROPOSAL_op1';
const properties={getProperty:k=>k==='AMS_ENV'?'DEV':k==='AMS_SWAP20_COMMIT_ENABLED'?'true':k===key?raw:'',setProperty:(k,v)=>{assert.equal(k,key);raw=v;}};
let journal=[{stage:'COMMITTED'}];
const context={JSON,String,Date,Error,PropertiesService:{getScriptProperties:()=>properties},
LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},
V5_AUTH:{validateTrustedTokenByRole:()=>({ok:true,email:'manager@example.test'})},
Swap20Store_read_:()=>JSON.parse(raw),
Swap20Store_key_:()=>key,
Swap20Journal_history_:()=>journal,
Swap20_executeLocked_:()=>{writes++;throw Error('must not replay');},
Swap20_validateTransition_:(before,after)=>{assert.equal(before.status,'CONFIRMED');assert.equal(after.status,'APPLIED');}};
runInNewContext(source,context);
const first=context.Swap20ManagerCommit({token:'valid',operationId:'op1'});
assert.equal(first.reconciled,true);
assert.equal(JSON.parse(raw).status,'APPLIED');
assert.equal(JSON.parse(raw).canonicalCommitVerified,true);
assert.equal(writes,0);
const second=context.Swap20ManagerCommit({token:'valid',operationId:'op1'});
assert.equal(second.idempotent,true);
assert.equal(writes,0);
raw=JSON.stringify(proposal);journal=[{stage:'WRITING'}];
assert.throws(()=>context.Swap20ManagerCommit({token:'valid',operationId:'op1'}),/recovery required/);
assert.equal(writes,0);
console.log('SWAP COMMITTED metadata reconciliation tests passed');
