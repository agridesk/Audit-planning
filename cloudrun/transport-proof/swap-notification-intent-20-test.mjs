import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20NotificationIntent.js',import.meta.url),'utf8');
const proposal={operationId:'operation-123',status:'APPLIED',canonicalCommitVerified:true,auditA:'A',auditB:'B',ecasComment:'Combined schedule update'};
const memory={AMS_ENV:'DEV'};
const ctx={String,JSON,Date,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>memory[k]||'',setProperty:(k,v)=>{memory[k]=v;}})},
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>[{stage:'PREPARED'},{stage:'WRITING'},{stage:'COMMITTED'}]
};
runInNewContext(src,ctx);
const first=ctx.Swap20_stageNotificationAfterCommitLocked_(proposal.operationId);
assert.equal(first.ok,true);
assert.equal(first.idempotent,false);
assert.equal(first.notificationStatus,'AWAITING_PRIOR_ECAS_RECEIPTS');
const retry=ctx.Swap20_stageNotificationAfterCommitLocked_(proposal.operationId);
assert.equal(retry.idempotent,true);
assert.equal(Object.keys(memory).filter(k=>k.startsWith('AMS_SWAP20_ECAS_INTENT_')).length,1);
proposal.status='CONFIRMED';
assert.throws(()=>ctx.Swap20_stageNotificationAfterCommitLocked_(proposal.operationId),/not durably APPLIED/);
proposal.status='APPLIED';
memory.AMS_ENV='PROD';
assert.throws(()=>ctx.Swap20_stageNotificationAfterCommitLocked_(proposal.operationId),/DEV only/);
console.log('SWAP combined notification intent tests passed');
