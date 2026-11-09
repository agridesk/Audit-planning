import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('../../Swap20EcasNotificationReconciler.js',import.meta.url),'utf8');
const sender=readFileSync(new URL('../../NotificationSender.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../../NotificationRenderer_PlanningToClientDigest.js',import.meta.url),'utf8');
new vm.Script(code);
assert(sender.includes("typeof Swap20_reconcileEcasIntentsLocked_==='function'"));
assert(renderer.includes('NB_assertCommittedSwapJournal_(swapOperationId)'));
assert(sender.includes("finalStatus==='SENT'&&/^ECAS_AUDIT_(APPROVAL|CHANGED)_DIGEST$/"));
const operation='SWAP20_test_operation_0123456789';
const previous=[{date:'2026-11-14',start:'09:00',end:'13:00'}];
const next=[{date:'2026-11-16',start:'09:00',end:'13:00'}];
const auditIds=['AUD_A','AUD_B'];
let props={AMS_ENV:'DEV',V5_SSOT_SPREADSHEET_ID:'DEV_SSOT',
 AMS_SWAP20_ECAS_OUTBOX_ENABLED:'NO',AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE:'2026-11-09T00:00:00Z'};
let stage='COMMITTED',stageTime='2026-11-10T10:00:00Z',rows=[];
let queueRows=[['TimestampCreated','Status','Type','Recipient','Audit ID','Company','Subject','Body','Attempts','LastError','PayloadHash','TimestampSent','Reserved']];
const auditBefore=(id)=>({auditId:id,rowNumber:id==='AUD_A'?2:3,values:[id,'Accepted',JSON.stringify({blocks:previous})]});
const canonical={sheetName:'Audit planning',headers:['Audit ID','Status','Planning JSON'],rows:auditIds.map(auditBefore)};
const proposal={operationId:operation,auditA:'AUD_A',auditB:'AUD_B',blocksA:next,blocksB:next,ecasComment:'Exchange dates'};
const journalRows=()=>[
 ['Operation_ID','Sequence','Stage','Recorded_At'],
 [operation,1,'PREPARED','2026-11-10T09:00:00Z'],
 [operation,2,'WRITING','2026-11-10T09:10:00Z'],
 [operation,3,stage,stageTime]
];
let writeCount=0;
const sheetByName=name=>{
 if(name==='AMS_Swap_20_Journal')return {getLastRow:()=>4,getRange:()=>({getValues:journalRows})};
 if(name==='Notification Queue')return {getDataRange:()=>({getValues:()=>queueRows})};
 if(name==='Audit planning')return {getRange:(row)=>({getValues:()=>[[
  row===2?'AUD_A':'AUD_B','Accepted',JSON.stringify({blocks:next})
 ]]})};
 return null;
};
const ss={getId:()=> 'DEV_SSOT',getSheetByName:sheetByName};
const sentPayload=id=>({auditId:id,company:'Company '+id,mpsNumber:'913496',
 auditorUid:'auditorUID',auditorEmail:'auditor@example.invalid',auditorName:'Auditor',
 scopes:['MPS-ABC'],plannedHours:4,blocks:previous,plannedDates:[],planningJson:''});
function setProofs(){
 queueRows=queueRows.slice(0,1);
 auditIds.forEach((id,i)=>queueRows.push(['','SENT','ECAS_AUDIT_APPROVAL_DIGEST','ecas@example.invalid',id,'Company','','','',
 '',String(i+100), '2026-11-09T10:00:00Z',JSON.stringify({payload:sentPayload(id)})]));
}
const testContext={
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||''})},
 SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
 NotificationConfig_GetAllEvents:()=>({'ECAS_AUDIT_CHANGED_DIGEST':{active:true}}),
 NotificationConfig_GetEvent:()=>({active:true,sendEmail:true,logOnly:false}),
 Swap20Journal_history_:()=>[
  {sequence:1,stage:'PREPARED',payload:{canonical}},
  {sequence:2,stage:'WRITING'},
  {sequence:3,stage:stage}],
 Swap20Store_read_:()=>proposal,
 StatusNotificationBridge_GetEcasRecipientEmail_:()=> 'ecas@example.invalid',
 NB_assertEcasSwapScopeOwnership_:scopes=>{if(scopes.some(x=>x!=='MPS-ABC'))throw Error('CB_MISMATCH');},
 ECAS20_VerifyPersistedCommunication_:(_id,receipt)=>receipt==='100'||receipt==='101',
 NB_queueNotification_:(_email,event,payload)=>{
  assert.equal(event,'ECAS_AUDIT_CHANGED_DIGEST');
  assert.equal(payload.swapItems.length,2);
  assert.equal(payload.auditId,'SWAP_'+operation);
  writeCount++;
  queueRows.push(['','PENDING',event,'ecas@example.invalid',payload.auditId,'','','','','','','',JSON.stringify({payload})]);
  return {success:true};
 },
 Logger:{log:()=>{}}
};
vm.runInNewContext(code,testContext);
const t=testContext;
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().readOnly,true,'Disabled by default');
assert.equal(writeCount,0);
props.AMS_SWAP20_ECAS_OUTBOX_ENABLED='YES';
setProofs();
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,1);
assert.equal(writeCount,1,'Atomic pair is one queue record');
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,0,'Idempotent rerun');
assert.equal(writeCount,1);
setProofs();stage='CONFLICT';
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,0,'Conflict never queued');
stage='COMMITTED';stageTime='2026-11-08T10:00:00Z';
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,0,'Historical transaction blocked');
stageTime='2026-11-10T10:00:00Z';
setProofs();queueRows[1][1]='SENT_DEV_REDIRECT';
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,0,'Redirect is not external delivery');
assert.equal(writeCount,1);
setProofs();queueRows[1][12]='';
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().queued,0,'Missing immutable receipt blocks queue');
assert.equal(writeCount,1);
setProofs();testContext.NotificationConfig_GetAllEvents=()=>({});
assert.equal(t.Swap20_reconcileEcasIntentsLocked_().readOnly,true,'Absent config blocks queue');
assert.equal(writeCount,1);
props.AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE='';
assert.throws(()=>t.Swap20_reconcileEcasIntentsLocked_(),/CUTOFF_REQUIRED/);
console.log('SWAP ECAS reconciler: 9 fail-closed and atomic tests PASS');
