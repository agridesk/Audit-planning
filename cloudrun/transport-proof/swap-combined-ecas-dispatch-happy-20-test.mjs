import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../Swap20CombinedEcasDispatch.js',import.meta.url),'utf8');
const op='operation-123';
const proposal={operationId:op,status:'APPLIED',canonicalCommitVerified:true,auditA:'A',auditB:'B',
 blocksA:[{date:'2026-10-23',start:'09:00',end:'11:00'}],
 blocksB:[{date:'2026-10-24',start:'09:00',end:'11:00'}],ecasComment:'Swapped'};
const old={blocks:[{date:'2026-10-21',start:'09:00',end:'11:00'}]};
const mem={AMS_ENV:'DEV',ECAS20_CHANGE_CANCEL_ENABLED:'YES',V5_SSOT_SPREADSHEET_ID:'DEV'};
const headers=['Audit ID','Planning JSON'];
const rows=['A','B'].map(id=>({auditId:id,values:[id,JSON.stringify(old)]}));
let row=null,appends=0;
const sheet={getLastRow:()=>row?2:1,getRange:()=>({createTextFinder:()=>({
 matchEntireCell:()=>({findAll:()=>row?[{getRow:()=>2}]:[]})}),
 getValues:()=>[[null,row?.status,'ECAS_AUDIT_CHANGED_DIGEST',null,'SWAP_'+op,
 null,null,null,null,null,null,null,JSON.stringify({payload:row?.payload})]]})};
const ctx={String,JSON,Date,Number,Array,Object,Error,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>mem[k]||'',setProperty:(k,v)=>{mem[k]=v;}})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})},
 NotificationConfig_GetQueueSheetName:()=> 'Notification Queue',
 NotificationConfig_GetEvent:()=>({active:true,sendEmail:true,logOnly:false}),
 StatusNotificationBridge_GetEcasRecipientEmail_:()=> 'ecas@example.com',
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>[{stage:'PREPARED',payload:{canonical:{headers,rows}}},
 {stage:'WRITING'},{stage:'COMMITTED'}],
 ECAS20_receiptDigest_:()=> 'hash',
 ECAS20_findConfirmedReceipt_:()=>({communicationId:'receipt-1'}),
 ECAS20_VerifyPersistedCommunication_:()=>true,
 NB_loadAuditBriefing_:auditId=>({auditId,company:'Company',auditNumber:'456',
 auditorEmail:'auditor@example.com',scopes:['MPS-GAP']}),
 Swap20_scheduleMinutes_:v=>Number(v.slice(0,2))*60+Number(v.slice(3)),
 Swap20_verifyCommittedReconciliationLocked_:()=>true,
 Swap20_notificationIntentKey_:()=> 'INTENT',
 NB_queueNotification_:(to,event,payload)=>{assert.equal(to,'ecas@example.com');
 assert.equal(event,'ECAS_AUDIT_CHANGED_DIGEST');appends++;row={status:'PENDING',payload};
 return {success:true};}
};
mem.INTENT=JSON.stringify({status:'AWAITING_PRIOR_ECAS_RECEIPTS'});
runInNewContext(src,ctx);
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(op).queued,true);
assert.equal(appends,1);
assert.equal(row.payload.swapItems.length,2);
assert.equal(row.payload.swapItems[0].auditId,'A');
assert.equal(row.payload.swapItems[1].auditId,'B');
assert.equal(JSON.parse(mem.INTENT).status,'QUEUED');
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(op).idempotent,true);
assert.equal(appends,1);
row.status='FAILED';
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(op).reason,'QUEUE_REQUIRES_REVIEW');
assert.equal(appends,1);
console.log('SWAP combined ECAS single queue test passed');
