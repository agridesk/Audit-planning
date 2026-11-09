import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../Swap20EcasNotificationReconciler.js',import.meta.url),'utf8');
const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const intentSource=readFileSync(new URL('../../Swap20NotificationIntent.js',import.meta.url),'utf8');
const dispatchSource=readFileSync(new URL('../../Swap20CombinedEcasDispatch.js',import.meta.url),'utf8');
assert(sender.includes("typeof Swap20_reconcileEcasIntentsLocked_==='function'"));
assert(sender.includes('SWAP20_ECAS_RECONCILER_MISSING'));
assert(intentSource.includes('Swap20_stageNotificationAfterCommitLocked_'));
assert(dispatchSource.includes('Swap20_tryQueueCombinedEcasLocked_'));
assert(dispatchSource.includes('Swap20_existingCombinedQueueLocked_'));
assert(dispatchSource.includes("history[history.length-1].stage!=='COMMITTED'"));
assert(dispatchSource.includes('PREVIOUS_DELIVERY_PROOF_MISSING'));
assert(!source.includes('NB_queueNotification_('),'Reconciler must reuse existing atomic dispatcher');
const op='SWAP20_test_intent_1234567890';
const other='SWAP20_second_intent_1234567890';
const intent=id=>({operationId:id,auditA:'A',auditB:'B',combined:true,
 lifecycleUnchanged:true,eventKey:'ECAS_AUDIT_CHANGED_DIGEST',
 status:'AWAITING_PRIOR_ECAS_RECEIPTS',createdAt:'2026-11-10T10:00:00Z'});
const mem={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:'DEV_SSOT',
 AMS_SWAP20_ECAS_OUTBOX_ENABLED:'NO',
 AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE:'2026-11-09T00:00:00Z',
 ECAS20_CHANGE_CANCEL_ENABLED:'YES'};
mem['AMS_SWAP20_ECAS_INTENT_'+op]=JSON.stringify(intent(op));
let dispatches=[],response={ok:true,queued:true};
const props={getProperty:k=>mem[k]||'',getProperties:()=>({...mem})};
const ctx={String,Number,Date,Object,Array,JSON,Error,
 PropertiesService:{getScriptProperties:()=>props},
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getId:()=> 'DEV_SSOT'})},
 Swap20_notificationIntentKey_:id=>'AMS_SWAP20_ECAS_INTENT_'+id,
 Swap20_tryQueueCombinedEcasLocked_:id=>{dispatches.push(id);return response;},
 Logger:{log:()=>{}}
};
runInNewContext(source,ctx);
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().reason,'DISABLED');
assert.equal(dispatches.length,0);
mem.AMS_SWAP20_ECAS_OUTBOX_ENABLED='YES';
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().queued,1);
assert.equal(dispatches.length,1);
assert.equal(dispatches[0],op);
mem.AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE='2026-11-11T00:00:00Z';
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().attempted,0);
assert.equal(dispatches.length,1);
mem.AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE='2026-11-09T00:00:00Z';
response={ok:false,queued:false,reason:'PREVIOUS_DELIVERY_PROOF_MISSING'};
const failure=ctx.Swap20_reconcileEcasIntentsLocked_();
assert.equal(failure.ok,false);
assert.equal(failure.errors.length,1);
assert.equal(failure.errors[0].reason,'PREVIOUS_DELIVERY_PROOF_MISSING');
mem['AMS_SWAP20_ECAS_INTENT_'+op]=JSON.stringify({...intent(op),status:'QUEUED'});
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().attempted,0);
mem['AMS_SWAP20_ECAS_INTENT_'+other]=JSON.stringify({...intent(other),createdAt:'2026-11-08T10:00:00Z'});
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().attempted,0,'No historical replay');
mem.AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE='';
assert.throws(()=>ctx.Swap20_reconcileEcasIntentsLocked_(),/CUTOFF_REQUIRED/);
mem.AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE='2026-11-09T00:00:00Z';
mem.ECAS20_CHANGE_CANCEL_ENABLED='NO';
assert.equal(ctx.Swap20_reconcileEcasIntentsLocked_().reason,'ECAS_FEATURE_DISABLED');
mem.ECAS20_CHANGE_CANCEL_ENABLED='YES';
mem.AMS_ENV='PROD';
assert.throws(()=>ctx.Swap20_reconcileEcasIntentsLocked_(),/DEV_ONLY/);
mem.AMS_ENV='DEV';
mem.V5_SSOT_SPREADSHEET_ID='WRONG';
assert.throws(()=>ctx.Swap20_reconcileEcasIntentsLocked_(),/SSOT_MISMATCH/);
console.log('SWAP ECAS intent recovery: gating, cutoff, provenance, idempotent dispatch contract PASS');
