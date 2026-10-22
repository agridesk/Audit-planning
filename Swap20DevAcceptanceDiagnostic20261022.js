// DEV-only read-only SWAP / ECAS 2.0 acceptance gate.
// Does not send mail, change configuration, or write audits.
function RUN_DIAG_SWAP_ECAS20_DEV_READY_20261022(){
 var props=PropertiesService.getScriptProperties();
 var dev='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV_ENV_REQUIRED');
 if(String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==dev)throw Error('DEV_SSOT_ID_MISMATCH');
 var ss=SpreadsheetApp.openById(dev),issues=[],counts={};
 function checkSheet(name,headers){
  var sh=ss.getSheetByName(name);
  if(!sh){issues.push('MISSING_'+name);return null;}
  if(headers){
   var row=sh.getRange(1,1,1,headers.length).getValues()[0].map(String);
   if(JSON.stringify(row)!==JSON.stringify(headers))issues.push('HEADER_MISMATCH_'+name);
  }
  return sh;
 }
 var canonical=checkSheet('Audit planning');
 var availability=checkSheet('Auditor Availability');
 var journal=checkSheet('AMS_Swap_20_Journal',['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']);
 var receipts=checkSheet('AMS_ECAS_Communication_Receipts',['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']);
 var queue=checkSheet(NotificationConfig_GetQueueSheetName());
 counts.auditRows=canonical?Math.max(0,canonical.getLastRow()-1):0;
 counts.availabilityRows=availability?Math.max(0,availability.getLastRow()-1):0;
 counts.journalEvents=journal?Math.max(0,journal.getLastRow()-1):0;
 counts.receipts=receipts?Math.max(0,receipts.getLastRow()-1):0;
 counts.queueRows=queue?Math.max(0,queue.getLastRow()-1):0;
 if(queue&&queue.getLastColumn()<13)issues.push('QUEUE_SCHEMA_INCOMPLETE');
 if(typeof Swap20_tryQueueCombinedEcasLocked_!=='function')issues.push('SWAP_DISPATCH_UNAVAILABLE');
 if(typeof ECAS20_findConfirmedReceipt_!=='function')issues.push('ECAS_RECEIPT_LOOKUP_UNAVAILABLE');
 if(typeof RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022!=='function')issues.push('RESEND_DELIVERY_RECONCILER_UNAVAILABLE');
 if(typeof Swap20ManagerCommit!=='function')issues.push('SWAP_COMMIT_UNAVAILABLE');
 var result={ok:issues.length===0,readOnly:true,environment:'DEV',
  commitEnabled:String(props.getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true',
  ecasChangeEnabled:String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()==='YES',
  counts:counts,issues:issues,requiredNextStep:'DEV transaction and delivered ECAS acceptance with isolated test audits'};
 Logger.log(JSON.stringify(result));return result;
}
