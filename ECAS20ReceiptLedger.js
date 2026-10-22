// AMS ECAS delivery provenance, written ONLY after a confirmed real send.
// DEV redirects, dry-runs and suppressed sends are not prior ECAS communications.
function ECAS20_PlanningDigest_(blocks) {
 if(!Array.isArray(blocks)||!blocks.length)throw Error('ECAS planning digest needs blocks');
 var normalized=blocks.map(function(b){
  if(!b||!b.date||!b.start||!b.end)throw Error('Incomplete ECAS scheduling block');
  return {date:String(b.date),start:String(b.start),end:String(b.end)};
 });
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(normalized),Utilities.Charset.UTF_8);
 return bytes.map(function(x){return ('0'+((x+256)%256).toString(16)).slice(-2);}).join('');
}
// Legacy API acceptance is NOT delivery. The only authoritative receipt writer
// is the verified Resend delivery reconciler. Never mint SENT proof here.
function ECAS20_recordLegacyProviderAcceptance_(groupItems,sentStamp,finalStatus) {
 return {ok:false,recorded:0,reason:'RESEND_DELIVERY_VERIFICATION_REQUIRED'};
}
function RUN_SETUP_ECAS20_RECEIPT_LEDGER_DEV_20261021(){
 var p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||String(p.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY_RECEIPT_LEDGER');
 var ss=SpreadsheetApp.openById(p.getProperty('V5_SSOT_SPREADSHEET_ID'));
 var sh=ss.getSheetByName('AMS_ECAS_Communication_Receipts'),created=false;
 if(!sh){
  sh=ss.insertSheet('AMS_ECAS_Communication_Receipts');
  sh.getRange(1,1,1,5).setValues([['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']]);
  sh.setFrozenRows(1);created=true;
 }
 var h=sh.getRange(1,1,1,5).getValues()[0].map(String);
 if(JSON.stringify(h)!==JSON.stringify(['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']))throw Error('RECEIPT_SCHEMA_CONFLICT');
 return {ok:true,created:created,rows:sh.getLastRow(),flagsChanged:false};
}
