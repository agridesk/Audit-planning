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
function ECAS20_recordConfirmedDelivery_(groupItems,sentStamp,finalStatus) {
 if(finalStatus!=='SENT')return {ok:true,recorded:0,reason:'NO_CONFIRMED_ECAS_DELIVERY'};
 var p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')return {ok:false,reason:'DEV_ONLY_TRACKING'};
 var id=String(p.getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 if(id!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return {ok:false,reason:'WRONG_SSOt'};
 var ss=SpreadsheetApp.openById(id),sh=ss.getSheetByName('AMS_ECAS_Communication_Receipts');
 if(!sh)return {ok:false,reason:'RECEIPT_LEDGER_NOT_INITIALIZED'};
 var h=sh.getRange(1,1,1,5).getValues()[0].map(String);
 if(JSON.stringify(h)!==JSON.stringify(['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']))return {ok:false,reason:'RECEIPT_HEADERS_INVALID'};
 var rows=[],items=groupItems||[];
 for(var i=0;i<items.length;i++){
  var entry=items[i]||{},code=String(entry.eventCode||''),payload=entry.payload||{};
  var children=Array.isArray(payload.swapItems)&&payload.swapItems.length?payload.swapItems:[payload];
  if(code!=='ECAS_AUDIT_APPROVAL_DIGEST'&&code!=='ECAS_AUDIT_CHANGED_DIGEST')continue;
  for(var j=0;j<children.length;j++){
   var child=children[j]||{},auditId=String(child.auditId||entry.auditId||'').trim();
   if(!auditId||auditId.indexOf('SWAP_')===0)continue;
   var digest;
   try{digest=ECAS20_PlanningDigest_(child.blocks);}catch(e){continue;}
   var receipt='NQ_'+String(entry.rowIndex||'')+'_'+auditId;
   if(!entry.rowIndex)continue;
   rows.push([auditId,receipt,digest,'SENT',String(sentStamp||new Date().toISOString())]);
  }
 }
 if(!rows.length)return {ok:true,recorded:0};
 var existing=sh.getLastRow()>1?sh.getRange(2,1,sh.getLastRow()-1,2).getValues():[];
 var prior={};existing.forEach(function(r){prior[String(r[0])+'|'+String(r[1])]=true;});
 var unique=rows.filter(function(r){var key=r[0]+'|'+r[1];if(prior[key])return false;prior[key]=true;return true;});
 if(unique.length)sh.getRange(sh.getLastRow()+1,1,unique.length,5).setValues(unique);
 return {ok:true,recorded:unique.length};
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
