import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20CombinedEcasDispatch.js',import.meta.url),'utf8');
const p={operationId:'swap-123456',status:'APPLIED',canonicalCommitVerified:true,auditA:'A',auditB:'B'};
const props={AMS_ENV:'DEV',ECAS20_CHANGE_CANCEL_ENABLED:'NO',V5_SSOT_SPREADSHEET_ID:'DEV'};
let attempts=0;
const ctx={String,JSON,Date,Error,Array,Object,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||''})},
 Swap20Store_read_:()=>p,
 Swap20Journal_history_:()=>[{stage:'PREPARED',payload:{canonical:{headers:[],rows:[]}}},{stage:'WRITING'},{stage:'COMMITTED'}],
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getLastRow:()=>1})})},
 NotificationConfig_GetQueueSheetName:()=> 'Notification Queue',
 NotificationConfig_GetEvent:()=>({active:false}),
 StatusNotificationBridge_GetEcasRecipientEmail_:()=>{attempts++;return 'x@example.com'}
};
runInNewContext(src,ctx);
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(p.operationId).reason,'FEATURE_DISABLED');
assert.equal(attempts,0);
props.ECAS20_CHANGE_CANCEL_ENABLED='YES';
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(p.operationId).reason,'EVENT_NOT_ENABLED_FOR_DELIVERY');
props.AMS_ENV='PROD';
assert.throws(()=>ctx.Swap20_tryQueueCombinedEcasLocked_(p.operationId),/DEV only/);
console.log('Combined SWAP ECAS fail-closed dispatch tests passed');
