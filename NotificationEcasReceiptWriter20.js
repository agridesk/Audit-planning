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
function ECAS20_recordConfirmedDelivery_(items,sentAt,status){
 if(String(status)!=='SENT')return {ok:false,reason:'NOT_CONFIRMED_SEND'};
 var env=String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase();
 if(env!=='DEV')return {ok:false,reason:'DEV_ONLY_INSTRUMENTATION'};
 var sh=ECAS20_receiptSheet_();
 if(!sh)return {ok:false,reason:'RECEIPT_SHEET_NOT_INITIALIZED'};
 var records=[];
 (items||[]).forEach(function(item){
  var payload=item.payload||item;
  var event=String(item.eventCode||item.eventType||payload.eventType||'');
  if(event!=='ECAS_AUDIT_APPROVAL_DIGEST'&&event!=='ECAS_AUDIT_CHANGED_DIGEST')return;
  var audits=Array.isArray(payload.swapItems)&&payload.swapItems.length===2?payload.swapItems:[payload];
  audits.forEach(function(a){
   if(!a.auditId||!Array.isArray(a.blocks)||!a.blocks.length)return;
   records.push({auditId:String(a.auditId),digest:ECAS20_receiptDigest_(a.blocks),
    communicationId:String(payload.operationId||a.auditId)+'_'+String(sentAt)});
  });
 });
 if(!records.length)return {ok:true,recorded:0};
 var existing=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,5).getValues():[];
 var count=0;
 records.forEach(function(rec){
  var duplicate=existing.some(function(row){return String(row[0])===rec.auditId&&
   String(row[1])===rec.communicationId&&String(row[2])===rec.digest;});
  if(duplicate)return;
  sh.appendRow([rec.auditId,rec.communicationId,rec.digest,'SENT',String(sentAt)]);
  existing.push([rec.auditId,rec.communicationId,rec.digest,'SENT',String(sentAt)]);count++;
 });
 return {ok:true,recorded:count};
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
