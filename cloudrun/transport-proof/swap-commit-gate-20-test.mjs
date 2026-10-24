import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const proposal={operationId:'swap-commit-1',status:'CONFIRMED',auditA:'A',auditB:'B',originalRevisions:{A:'1',B:'2'},blocksA:[],blocksB:[]};
let preflight=0,history=[],enabled=false;
const props={getProperty:key=>key==='AMS_ENV'?'DEV':key==='AMS_SWAP20_COMMIT_ENABLED'?(enabled?'true':'false'):''};
const ctx={Error,String,Date,JSON,
 PropertiesService:{getScriptProperties:()=>props},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 V5_AUTH:{validateTrustedTokenByRole:token=>token==='valid'?{ok:true,email:'manager@example.com'}:{ok:false}},
 Swap20Store_read_:()=>proposal,
 Swap20Store_key_:id=>'AMS_SWAP20_PROPOSAL_'+id,
 Swap20Journal_history_:()=>history,
 Swap20_executeLocked_:()=>{preflight++;return {committed:true}}
};
runInNewContext(readFileSync(new URL('Swap20AtomicCommitGate.js',root),'utf8'),ctx);
assert.throws(()=>ctx.Swap20ManagerCommit({token:'invalid',operationId:proposal.operationId}),/authentication/);
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}).code,'SWAP_ATOMIC_WRITE_DISABLED');
assert.equal(preflight,0);
enabled=true;
history=[{stage:'CANONICAL_WRITE_STARTED'}];
assert.throws(()=>ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}),/recovery required/);
proposal.status='WITHDRAWN';
history=[];
assert.throws(()=>ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}),/Confirmed swap proposal required/);
assert.equal(preflight,0);
const initialProps=ctx.PropertiesService;
ctx.PropertiesService={getScriptProperties:()=>({getProperty:key=>key==='AMS_ENV'?'PROD':key==='AMS_SWAP20_COMMIT_ENABLED'?'true':''})};
assert.throws(()=>ctx.Swap20ManagerCommit({token:'valid',operationId:proposal.operationId}),/restricted to DEV/);
ctx.PropertiesService=initialProps;
assert.equal(preflight,0);
const live={...proposal,status:'CONFIRMED'},records=[];let stored=JSON.stringify(live),writes=0,locked=false;
ctx.PropertiesService={getScriptProperties:()=>({getProperty:key=>key==='AMS_ENV'?'DEV':key==='AMS_SWAP20_COMMIT_ENABLED'?'true':key==='AMS_SWAP20_PROPOSAL_swap-commit-1'?stored:'',setProperty:(key,value)=>{assert.equal(key,'AMS_SWAP20_PROPOSAL_swap-commit-1');stored=value;}})};
ctx.LockService={getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})};
ctx.Swap20Store_read_=()=>JSON.parse(stored);
ctx.Swap20Store_key_=()=> 'AMS_SWAP20_PROPOSAL_swap-commit-1';
ctx.Swap20Journal_history_=()=>records;
ctx.Swap20_executeLocked_=()=>{writes++;records.push({stage:'COMMITTED'});return {committed:true};};
ctx.Swap20_validateTransition_=()=>true;
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:live.operationId}).status,'APPLIED');
assert.equal(writes,1);
assert.equal(ctx.Swap20ManagerCommit({token:'valid',operationId:live.operationId}).idempotent,true);
assert.equal(writes,1);
const pending=ctx.Swap20ManagerCommit({token:'valid',operationId:live.operationId});
assert.equal(pending.committed,true);
assert.equal(pending.notificationPending,true);
assert.equal(pending.notificationQueued,false);
assert.equal(writes,1);
ctx.Swap20_stageNotificationAfterCommitLocked_=()=>({ok:true,queued:true,notificationStatus:'QUEUED'});
const delivered=ctx.Swap20ManagerCommit({token:'valid',operationId:live.operationId});
assert.equal(delivered.notificationPending,false);
assert.equal(delivered.notificationQueued,true);
assert.equal(writes,1);
ctx.Swap20_stageNotificationAfterCommitLocked_=()=>{throw new Error('mailer unavailable');};
const mailFailure=ctx.Swap20ManagerCommit({token:'valid',operationId:live.operationId});
assert.equal(mailFailure.committed,true);
assert.equal(mailFailure.notificationPending,true);
assert.equal(mailFailure.notificationIntent.reason,'INTENT_STAGE_FAILED');
assert.equal(writes,1);
console.log('Swap fail-closed atomic commit gate tests passed');
