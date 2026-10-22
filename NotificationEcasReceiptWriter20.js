// Persist ECAS send provenance after NotificationSender marks actual SENT.
// Never creates evidence for redirected, suppressed, simulated or failed sends.
var ECAS20_RECEIPTS_TAB_='AMS_ECAS_Communication_Receipts';
function ECAS20_receiptDigest_(blocks){
 if(!Array.isArray(blocks)||!blocks.length)throw Error('ECAS receipt blocks missing');
 var raw=JSON.stringify(blocks.map(function(b){return {date:String(b.date),start:String(b.start),end:String(b.end)};}));
 var hash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8);
 return hash.map(function(b){return ('0'+(b<0?b+256:b).toString(16)).slice(-2);}).join('');
}
function ECAS20_receiptSheet_(){
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 if(!id)throw Error('ECAS receipt SSoT missing');
 var sh=SpreadsheetApp.openById(id).getSheetByName(ECAS20_RECEIPTS_TAB_);
 if(!sh)return null;
 var expected=['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At'];
 var headers=sh.getRange(1,1,1,5).getValues()[0];
 if(JSON.stringify(headers)!==JSON.stringify(expected))throw Error('ECAS receipts schema mismatch');
 return sh;
}
function RUN_SETUP_ECAS20_RECEIPTS_DEV_20261022(){
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')
  throw Error('DEV-only receipt setup');
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 var ss=SpreadsheetApp.openById(id);
 if(ss.getSheetByName(ECAS20_RECEIPTS_TAB_))return {ok:true,existing:true};
 var sh=ss.insertSheet(ECAS20_RECEIPTS_TAB_);
 sh.getRange(1,1,1,5).setValues([['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']]);
 sh.setFrozenRows(1);
 return {ok:true,created:true};
}
// Resend HTTP 2xx only confirms API acceptance. A verified delivery webhook
// is required to write SENT receipt evidence; do not manufacture it here.
function ECAS20_recordConfirmedDelivery_(items,sentAt,status){
 return {ok:false,recorded:0,reason:'RESEND_DELIVERY_CONFIRMATION_REQUIRED'};
}
function ECAS20_findConfirmedReceipt_(auditId,digest){
 var sh=ECAS20_receiptSheet_();
 if(!sh)return null;
 var n=sh.getLastRow();
 if(n<2)return null;
 var rows=sh.getRange(2,1,n-1,5).getValues();
 for(var i=rows.length-1;i>=0;i--){
  var r=rows[i];
  if(String(r[0])===String(auditId)&&String(r[2])===String(digest)&&
   String(r[3]).toUpperCase()==='SENT'&&r[4])return {communicationId:String(r[1]),planningDigest:digest};
 }
 return null;
}
