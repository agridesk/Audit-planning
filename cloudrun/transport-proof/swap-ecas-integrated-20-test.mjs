import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
let stored={operationId:'operation-123',auditA:'A',auditB:'B',status:'CONFIRMED',ecasComment:'Both changed'};
const mem={AMS_ENV:'DEV',AMS_SWAP20_COMMIT_ENABLED:'true'};
const key='AMS_SWAP20_PROPOSAL_operation-123';
mem[key]=JSON.stringify(stored);
const journal=[];let writes=0;
const ctx={Error,String,JSON,Date,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>mem[k]||'',setProperty:(k,v)=>{mem[k]=v;}})},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 V5_AUTH:{validateTrustedTokenByRole:()=>({ok:true,email:'manager@example.test'})},
 Swap20Store_read_:()=>JSON.parse(mem[key]),
 Swap20Store_key_:()=>key,
 Swap20Journal_history_:()=>journal,
 Swap20_executeLocked_:()=>{writes++;journal.push({stage:'COMMITTED'});return {committed:true};},
 Swap20_validateTransition_:()=>true,
 Swap20_verifyCommittedReconciliationLocked_:()=>true
};
for(const name of ['Swap20NotificationIntent.js','Swap20AtomicCommitGate.js'])
 runInNewContext(readFileSync(new URL(name,root),'utf8'),ctx);
const first=ctx.Swap20ManagerCommit({token:'manager',operationId:stored.operationId});
assert.equal(first.status,'APPLIED');
assert.equal(first.notificationIntent.notificationStatus,'AWAITING_PRIOR_ECAS_RECEIPTS');
assert.equal(first.notificationIntent.idempotent,false);
assert.equal(writes,1);
const repeat=ctx.Swap20ManagerCommit({token:'manager',operationId:stored.operationId});
assert.equal(repeat.idempotent,true);
assert.equal(repeat.notificationIntent.idempotent,true);
assert.equal(writes,1);
const intentKeys=Object.keys(mem).filter(k=>k.startsWith('AMS_SWAP20_ECAS_INTENT_'));
assert.equal(intentKeys.length,1);
const intent=JSON.parse(mem[intentKeys[0]]);
assert.equal(intent.combined,true);
assert.equal(intent.lifecycleUnchanged,true);
assert.equal(intent.eventKey,'ECAS_AUDIT_CHANGED_DIGEST');
assert.equal(intent.auditA,'A');
assert.equal(intent.auditB,'B');
console.log('SWAP commit to single combined ECAS intent integration test passed');
