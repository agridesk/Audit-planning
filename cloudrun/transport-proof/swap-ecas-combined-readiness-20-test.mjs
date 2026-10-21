import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20EcasCombinedReadiness.js',import.meta.url),'utf8');
let verified=0;
const state={operationId:'operation-123',auditA:'A',auditB:'B',status:'APPLIED',canonicalCommitVerified:true};
const record={operationId:'operation-123',auditA:'A',auditB:'B',eventKey:'ECAS_AUDIT_CHANGED_DIGEST',combined:true};
const receipts={A:{auditId:'A',communicationId:'r1',planningDigest:'d1'},B:{auditId:'B',communicationId:'r2',planningDigest:'d2'}};
const ctx={String,Error,JSON,PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='AMS_ENV'?'DEV':JSON.stringify(record)})},
 Swap20Store_read_:()=>state,Swap20Journal_history_:()=>[{stage:'COMMITTED'}],
 Swap20_notificationIntentKey_:()=> 'intent',
 ECAS20_VerifyPersistedCommunication_:()=>{verified++;return true;}};
runInNewContext(src,ctx);
const good=ctx.Swap20_checkCombinedEcasReadiness_('operation-123',receipts);
assert.equal(good.ok,true);
assert.equal(good.combined,true);
assert.equal(good.recipientCount,1);
assert.equal(good.queued,false);
assert.equal(verified,2);
assert.equal(ctx.Swap20_checkCombinedEcasReadiness_('operation-123',{A:receipts.A}).reason,'PRIOR_RECEIPTS_MISSING');
state.status='CONFIRMED';
assert.equal(ctx.Swap20_checkCombinedEcasReadiness_('operation-123',receipts).reason,'SWAP_NOT_DURABLY_APPLIED');
console.log('SWAP combined ECAS readiness tests passed');
