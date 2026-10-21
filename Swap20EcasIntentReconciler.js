// SWAP ECAS outbox reconciler. Caller holds script lock; never sends mail.
// Existing NotificationSender periodic trigger invokes it before reserving rows.
function Swap20_reconcileEcasIntentsLocked_() {
 var p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
    String(p.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')
   return {ok:true,disabled:true,queued:0};
 if(typeof Swap20_tryQueueCombinedEcasLocked_!=='function')
   return {ok:false,reason:'DISPATCH_MISSING',queued:0};
 var properties=p.getProperties(),prefix='AMS_SWAP20_ECAS_INTENT_',ids=Object.keys(properties).filter(function(k){return k.indexOf(prefix)===0;}).sort();
 var result={ok:true,scanned:0,queued:0,awaiting:0,errors:0};
 for(var i=0;i<ids.length&&result.scanned<20;i++){
  var id=ids[i].substring(prefix.length),intent;
  try{intent=JSON.parse(properties[ids[i]]);}catch(e){result.errors++;continue;}
  if(!intent||intent.status==='QUEUED')continue;
  result.scanned++;
  try{
   var dispatched=Swap20_tryQueueCombinedEcasLocked_(id);
   if(dispatched&&dispatched.queued)result.queued++;
   else result.awaiting++;
  }catch(err){
   result.errors++;
   Logger.log('SWAP20_ECAS_OUTBOX_RETRY_FAILED '+id+': '+String(err));
  }
 }
 return result;
}
