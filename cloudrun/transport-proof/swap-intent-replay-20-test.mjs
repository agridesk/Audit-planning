import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../Swap20AtomicCommitGate.js',import.meta.url),'utf8');
const proposal={operationId:'swap-intent-1',status:'CONFIRMED',auditA:'A',auditB:'B'};
let persisted={...proposal,status:'APPLIED',canonicalCommitVerified:true},calls=0;
const props={getProperty:k=>k==='AMS_ENV'?'DEV':k==='AMS_SWAP20_COMMIT_ENABLED'?'true':''};
const ctx={String,JSON,Date,Error,
 PropertiesService:{getScriptProperties:()=>props},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 V5_AUTH:{validateTrustedTokenByRole:()=>({ok:true,email:'manager@example.test'})},
 Swap20Store_read_:()=>persisted,
 Swap20Journal_history_:()=>[{stage:'COMMITTED'}],
 Swap20_stageNotificationAfterCommitLocked_:id=>{calls++;assert.equal(id,proposal.operationId);return {ok:true,idempotent:calls>1};}};
runInNewContext(source,ctx);
assert.equal(ctx.Swap20ManagerCommit({token:'token',operationId:proposal.operationId}).notificationIntent.ok,true);
assert.equal(ctx.Swap20ManagerCommit({token:'token',operationId:proposal.operationId}).notificationIntent.idempotent,true);
assert.equal(calls,2);
console.log('SWAP notification intent replay coverage passed');
