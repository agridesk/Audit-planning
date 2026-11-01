import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../../',import.meta.url);
const files=['StatusNotificationBridge.js','NotificationEcasChangeCancelGate.js','NotificationEcasPersistedReceipt.js'];
const sources=Object.fromEntries(files.map(f=>[f,readFileSync(new URL(f,root),'utf8')]));
for(const s of Object.values(sources))new vm.Script(s);
const before={auditId:'A',communicatedToEcas:true,communicationId:'R1',version:'R1',company:'Farm',mpsNumber:'123',auditorUid:'U',auditorName:'Auditor',scopes:['ABC'],plannedHours:8,blocks:[{date:'2026-11-05',start:'08:00',end:'16:00'}]};
const after={auditId:'A',version:'REJECTED'};
const rows=[['TimestampCreated','Status','Type','Recipient','Audit ID','Company','Subject','Body','Attempts','LastError','PayloadHash','TimestampSent','Reserved'],['','SENT','ECAS_AUDIT_APPROVAL_DIGEST','ecas@example.invalid','A','','','','','','R1','2026-11-05',JSON.stringify({payload:before})]];
function test(enabled,values=rows){const calls=[];
 const sandbox={SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>values.length,getDataRange:()=>({getValues:()=>values})})})},StatusNotificationBridge_GetEcasRecipientEmail_:()=> 'ecas@example.invalid',PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='ECAS20_CHANGE_CANCEL_ENABLED'?(enabled?'YES':'NO'):''})},NotificationConfig_GetEvent:()=>({active:true}),StatusNotificationBridge_QueueWithLock_:(...args)=>{calls.push(args);return{success:true}},JSON,String,Number,Array,Object,Logger:{log:()=>{}}};
 vm.createContext(sandbox);
 // Evaluate only pure preparer and validation functions, not unrelated bridge globals.
 const bridge=sources['StatusNotificationBridge.js'];const start=bridge.indexOf('function StatusNotificationBridge_ValidateEcasChangeCancel_('),end=bridge.indexOf('/** Read-only DEV integration contract diagnostic.',start);
 assert.ok(start>=0&&end>start);vm.runInContext(bridge.slice(start,end),sandbox);
 vm.runInContext(sources['NotificationEcasPersistedReceipt.js'],sandbox);
 vm.runInContext(sources['NotificationEcasChangeCancelGate.js'],sandbox);
 return{out:sandbox.ECAS20_SubmitVerifiedChangeCancel_({eventKey:'ECAS_AUDIT_REJECTED_DIGEST',before,after,ecasComment:'Client refused',idempotencyKey:'K'}),calls};}
assert.equal(test(false).out.reason,'FEATURE_DISABLED');
const ok=test(true);assert.equal(ok.out.queued,true);assert.equal(ok.calls.length,1);assert.equal(ok.calls[0][1],'ECAS_AUDIT_REJECTED_DIGEST');assert.equal(ok.calls[0][2].ecasComment,'Client refused');
const pending=rows.map(r=>r.slice());pending[1][1]='PENDING';assert.equal(test(true,pending).out.reason,'PREVIOUS_DELIVERY_NOT_VERIFIED');
console.log('ECAS verified gate feature flag, SENT receipt and Reject dispatch OK');
