// FILE: NotificationEcasReceiptDiagnostics.js
// Read-only ECAS delivery evidence inventory. Never infers that a queue row
// proves a particular previous schedule; the scheduling owner must persist
// a snapshot-to-delivery receipt before change/cancel can be enabled.
function RUN_DIAG_ECAS_RECEIPTS_DEV_20261021() {
  var props=PropertiesService.getScriptProperties();
  var env=String(props.getProperty('AMS_ENV')||props.getProperty('ENVIRONMENT')||'').toUpperCase();
  if(env==='PROD'||env==='PRODUCTION')throw new Error('DEV_ONLY_ECAS_RECEIPTS');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var name=typeof NotificationConfig_GetQueueSheetName==='function'?
    NotificationConfig_GetQueueSheetName():'Notification Queue';
  var sheet=ss.getSheetByName(name);
  if(!sheet)throw new Error('NOTIFICATION_QUEUE_MISSING');
  var n=sheet.getLastRow();
  var values=n>1?sheet.getRange(2,1,n-1,12).getValues():[];
  var total=0,delivered=0,devRedirect=0,pending=0,other=0;
  var examples=[];
  for(var i=0;i<values.length;i++){
    var row=values[i],key=String(row[2]||'').trim();
    if(key!=='ECAS_AUDIT_APPROVAL_DIGEST')continue;
    total++;
    var status=String(row[1]||'').trim().toUpperCase();
    if(status==='SENT')delivered++;
    else if(status==='SENT_DEV_REDIRECT')devRedirect++;
    else if(status==='PENDING'||status==='RESERVED')pending++;
    else other++;
    if(examples.length<8)examples.push({row:i+2,auditId:String(row[4]||''),
      status:status,hasTimestampSent:!!row[11]});
  }
  var result={ok:true,readOnly:true,total:total,delivered:delivered,
    devRedirect:devRedirect,pending:pending,other:other,examples:examples,
    verifiedSnapshotReceiptCount:0,
    note:'Queue delivery rows alone do not verify the previously communicated schedule. ECAS Change/Cancel remains disabled.'};
  Logger.log(JSON.stringify(result));return result;
}

// Strict verifier for an authoritative, separately persisted ECAS snapshot receipt.
// Historical queue rows and caller-provided booleans do not qualify.
// A receipt record must be written by the future scheduling/notification
// integration owner after confirmed delivery, with matching schedule digest.
function ECAS20_VerifyPersistedCommunication_(auditId,communicationId,before) {
  if(!auditId||!communicationId||!before||!before.planningDigest)return false;
  var props=PropertiesService.getScriptProperties();
  var id=String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
  if(!id)return false;
  var ss=SpreadsheetApp.openById(id);
  var sheet=ss.getSheetByName('AMS_ECAS_Communication_Receipts');
  if(!sheet)return false;
  var values=sheet.getDataRange().getValues();
  if(values.length<2)return false;
  var headings=values[0].map(function(v){return String(v||'').trim();});
  var expected=['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At'];
  var idx=expected.map(function(h){return headings.indexOf(h);});
  if(idx.some(function(n){return n<0;}))return false;
  for(var i=1;i<values.length;i++){
    var row=values[i];
    if(String(row[idx[0]]||'')!==String(auditId))continue;
    if(String(row[idx[1]]||'')!==String(communicationId))continue;
    if(String(row[idx[2]]||'')!==String(before.planningDigest))continue;
    if(String(row[idx[3]]||'').toUpperCase()!=='SENT')continue;
    if(!row[idx[4]])continue;
    return true;
  }
  return false;
}
