// DEV-only reconciler. Resend HTTP acceptance is NOT a delivery receipt.
// Confirm GET /emails/{id} last_event=delivered and actual recipient before
// writing the audit planning fingerprint for SWAP/ECAS verification.
function RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022(){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')
  throw Error('ECAS delivery reconciliation is DEV only');
 var ss=SpreadsheetApp.openById(String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||''));
 var q=ss.getSheetByName(NotificationConfig_GetQueueSheetName());
 var receipts=ECAS20_receiptSheet_();
 if(!q||!receipts)throw Error('ECAS reconciliation queue or receipt ledger missing');
 var apiKey=NMG_getResendApiKey_();
 if(!apiKey)throw Error('Resend credentials missing');
 var n=q.getLastRow();
 if(n<2)return {ok:true,checked:0,confirmed:0,skipped:0};
 var rows=q.getRange(2,1,n-1,13).getValues();
 var existing=receipts.getLastRow()>1?receipts.getRange(2,1,receipts.getLastRow()-1,5).getValues():[];
 var checked=0,confirmed=0,skipped=0,seen={};
 for(var i=rows.length-1;i>=0&&checked<25;i--){
  var row=rows[i],event=String(row[2]||''),state=String(row[1]||'').toUpperCase();
  if(event!=='ECAS_AUDIT_APPROVAL_DIGEST'&&event!=='ECAS_AUDIT_CHANGED_DIGEST')continue;
  if(state!=='SENT'){skipped++;continue;}
  var note=String(row[9]||''),match=note.match(/^RESEND_ACCEPTED_ID:([a-f0-9-]{36})$/i);
  if(!match){skipped++;continue;}
  var id=match[1],recipient=String(row[3]||'').trim().toLowerCase();
  if(!recipient)throw Error('ECAS queue recipient missing at row '+(i+2));
  var raw=String(row[12]||'');
  var payload=JSON.parse(raw).payload;
  if(!payload)throw Error('ECAS queue payload missing at row '+(i+2));
  var audits=Array.isArray(payload.swapItems)&&payload.swapItems.length===2?payload.swapItems:[payload];
  if(event==='ECAS_AUDIT_CHANGED_DIGEST'&&String(row[4]).indexOf('SWAP_')===0&&audits.length!==2)
   throw Error('Combined SWAP queue must contain two audits');
  var pending=[];
  audits.forEach(function(a){
   if(!a.auditId||!Array.isArray(a.blocks)||!a.blocks.length)throw Error('ECAS audit evidence incomplete');
   var digest=ECAS20_receiptDigest_(a.blocks),already=existing.some(function(r){
    return String(r[0])===String(a.auditId)&&String(r[1])===id&&String(r[2])===digest&&String(r[3])==='SENT';
   });
   if(!already)pending.push({auditId:String(a.auditId),digest:digest});
  });
  if(!pending.length){skipped++;continue;}
  if(!seen[id]){
   var result=UrlFetchApp.fetch('https://api.resend.com/emails/'+encodeURIComponent(id),{
    method:'get',headers:{Authorization:'Bearer '+apiKey},muteHttpExceptions:true});
   if(Number(result.getResponseCode())!==200)throw Error('Resend delivery verification HTTP '+result.getResponseCode());
   var response=JSON.parse(String(result.getContentText()||''));
   if(String(response.id||'')!==id)throw Error('Resend message ID mismatch');
   seen[id]=response;
  }
  var item=seen[id],recipients=(Array.isArray(item.to)?item.to:[]).map(function(x){return String(x).trim().toLowerCase();});
  if(recipients.indexOf(recipient)<0)throw Error('Resend actual recipient mismatch');
  checked++;
  // A later message state such as bounced or complained cannot be assumed delivered.
  if(String(item.last_event||'').toLowerCase()!=='delivered'){skipped++;continue;}
  var timestamp=String(item.created_at||new Date().toISOString());
  pending.forEach(function(p){
   var record=[p.auditId,id,p.digest,'SENT',timestamp];
   receipts.appendRow(record);existing.push(record);confirmed++;
  });
 }
 return {ok:true,checked:checked,confirmed:confirmed,skipped:skipped,readOnlyQueue:true};
}
