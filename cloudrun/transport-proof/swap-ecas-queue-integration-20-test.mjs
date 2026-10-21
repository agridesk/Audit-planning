import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../../',import.meta.url);
const files=['Swap20CombinedEcasDigest.js','Swap20EcasQueueDispatch.js','Swap20EcasIntentReconciler.js'];
const operationId='swap-12345678';
const intentKey='AMS_SWAP20_ECAS_INTENT_'+operationId;
const proposal={operationId,auditA:'A',auditB:'B',status:'APPLIED',canonicalCommitVerified:true,ecasComment:'Twee audits wisselen',blocksA:[{date:'2026-10-21',start:'09:00',end:'17:00'}],blocksB:[{date:'2026-10-20',start:'09:00',end:'17:00'}]};
const makePlan=date=>JSON.stringify({blocks:[{date,start:'09:00',end:'17:00'}]});
const headers=['Audit ID','Company','Company_UID','SCOPE_01','Planning JSON','Status'];
const snapshots=[
 {auditId:'A',values:['A','Company A','company-a','MPS-GAP',makePlan('2026-10-20'),'Accepted']},
 {auditId:'B',values:['B','Company B','company-b','MPS-ABC',makePlan('2026-10-21'),'Accepted']}];
const next=[
 {auditId:'A',headers,row:['A','Company A','company-a','MPS-GAP',makePlan('2026-10-21'),'Accepted']},
 {auditId:'B',headers,row:['B','Company B','company-b','MPS-ABC',makePlan('2026-10-20'),'Accepted']}];
const before={canonical:{headers,rows:snapshots}};
const history=[{stage:'PREPARED',payload:before},{stage:'WRITING'},{stage:'COMMITTED'}];
const properties={AMS_ENV:'DEV',ECAS20_CHANGE_CANCEL_ENABLED:'YES',V5_SSOT_SPREADSHEET_ID:'dev-id',
 [intentKey]:JSON.stringify({status:'AWAITING_PRIOR_ECAS_RECEIPTS',auditA:'A',auditB:'B',combined:true})};
const receipts=[['A','receipt-A','digest-2026-10-20','SENT','2026-10-20'],['B','receipt-B','digest-2026-10-21','SENT','2026-10-21']];
const receiptSheet={getLastRow:()=>receipts.length+1,getRange:()=>({getValues:()=>receipts})};
let queued=0,recipientCount=0;
const ctx={String,JSON,Array,Object,Date,Error,Logger:{log:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key],setProperty:(key,value)=>{properties[key]=value;},getProperties:()=>({...properties})})},
 SpreadsheetApp:{openById:()=>({getSheetByName:()=>receiptSheet}),getActiveSpreadsheet:()=>({getSheetByName:()=>null})},
 NotificationConfig_GetEvent:()=>({active:true}),
 Swap20Store_read_:()=>proposal,
 Swap20Journal_history_:()=>history,
 Swap20_notificationIntentKey_:()=>intentKey,
 ECAS20_PlanningDigest_:blocks=>'digest-'+blocks[0].date,
 ECAS20_VerifyPersistedCommunication_:()=>true,
 PRT_readCanonicalRow_:id=>next.find(x=>x.auditId===id),
 PlanningWorkspacePlannedAuditReadService_get:({auditId})=>({auditorName:'Auditor '+auditId,auditorEmail:auditId.toLowerCase()+'@example.test'}),
 NB_loadCompanyNumberForBriefing_:()=> 'MPS001',
 Swap20_scheduleMinutes_:time=>{const [h,m]=time.split(':').map(Number);return h*60+m;},
 StatusNotificationBridge_PrepareEcasChangeCancel_:(_,previous,current,reason)=>({ok:true,payload:{auditId:previous.auditId,
  eventType:'ECAS_AUDIT_CHANGED_DIGEST',company:previous.company,mpsNumber:previous.mpsNumber,
  auditorName:previous.auditorName,auditorEmail:previous.auditorEmail,scopes:previous.scopes,
  blocks:current.blocks,previousBlocks:previous.blocks,plannedHours:previous.plannedHours,ecasComment:reason}}),
 StatusNotificationBridge_GetEcasRecipientEmail_:()=>{recipientCount++;return 'planning@example.test';},
 NB_queueNotification_:(to,event,payload)=>{queued++;assert.equal(to,'planning@example.test');
  assert.equal(event,'ECAS_AUDIT_CHANGED_DIGEST');assert.equal(payload.swapItems.length,2);
  assert.equal(payload.auditId,'SWAP_'+operationId);return {success:true};}};
for(const f of files)runInNewContext(readFileSync(new URL(f,root),'utf8'),ctx);
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(operationId).queued,true);
assert.equal(queued,1);
assert.equal(JSON.parse(properties[intentKey]).status,'QUEUED');
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(operationId).idempotent,true);
assert.equal(queued,1);
properties.ECAS20_CHANGE_CANCEL_ENABLED='NO';
assert.equal(ctx.Swap20_tryQueueCombinedEcasLocked_(operationId).reason,'FEATURE_DISABLED');
assert.equal(queued,1);
console.log('SWAP single-queue-row ECAS integration and idempotence tests passed');
