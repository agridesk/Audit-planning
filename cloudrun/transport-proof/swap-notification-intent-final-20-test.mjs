import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20NotificationIntent.js',import.meta.url),'utf8');
const proposal={operationId:'swap-accept-1',auditA:'A',auditB:'B',status:'APPLIED',canonicalCommitVerified:true,ecasComment:'Two Accepted audits exchanged'};
const values={AMS_ENV:'DEV'};
const ctx={String,JSON,Date,Error,RegExp,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>values[k]||'',setProperty:(k,v)=>{values[k]=v;}})},
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>[{stage:'PREPARED'},{stage:'WRITING'},{stage:'COMMITTED'}]};
runInNewContext(src,ctx);
const first=ctx.Swap20_stageNotificationAfterCommitLocked_('swap-accept-1');
assert.equal(first.ok,true);
assert.equal(first.idempotent,false);
const second=ctx.Swap20_stageNotificationAfterCommitLocked_('swap-accept-1');
assert.equal(second.idempotent,true);
const intents=Object.keys(values).filter(k=>k.startsWith('AMS_SWAP20_ECAS_INTENT_'));
assert.equal(intents.length,1);
const intent=JSON.parse(values[intents[0]]);
assert.equal(intent.combined,true);
assert.equal(intent.lifecycleUnchanged,true);
assert.equal(intent.status,'AWAITING_PRIOR_ECAS_RECEIPTS');
assert.equal(intent.eventKey,'ECAS_AUDIT_CHANGED_DIGEST');
const oldStatus=proposal.status;
proposal.status='CONFIRMED';
assert.throws(()=>ctx.Swap20_stageNotificationAfterCommitLocked_('swap-accept-1'),/not durably APPLIED/);
proposal.status=oldStatus;
values.AMS_ENV='PROD';
assert.throws(()=>ctx.Swap20_stageNotificationAfterCommitLocked_('swap-accept-1'),/DEV only/);
console.log('SWAP combined ECAS notification intent exactly-once contract passed');
