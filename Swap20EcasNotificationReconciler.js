/**
 * DEV-only periodic recovery of already staged SWAP 2.0 notification intents.
 * AUTHORITATIVE WRITE PATH:
 * Swap20AtomicCommitGate -> Swap20NotificationIntent ->
 * Swap20CombinedEcasDispatch -> Notification Queue -> NotificationSender.
 *
 * This file must NOT build an independent queue payload or backfill a journal.
 * Sender calls this under its existing global ScriptLock.
 */
var SWAP20_ECAS_INTENT_PREFIX_='AMS_SWAP20_ECAS_INTENT_';
function Swap20_reconcileEcasIntentsLocked_(){
  var props=PropertiesService.getScriptProperties();
  if(String(props.getProperty('AMS_ENV')||'').trim().toUpperCase()!=='DEV')
    throw Error('SWAP_ECAS_RECONCILE_DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var expected=String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
  if(!ss||!expected||ss.getId()!==expected)
    throw Error('SWAP_ECAS_RECONCILE_SSOT_MISMATCH');
  // Explicit opt-in and timestamp: no implicit replay of October/early Nov SWAPs.
  if(String(props.getProperty('AMS_SWAP20_ECAS_OUTBOX_ENABLED')||'').trim().toUpperCase()!=='YES')
    return {ok:true,readOnly:true,reason:'DISABLED',attempted:0,queued:0};
  var cutoff=String(props.getProperty('AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE')||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(cutoff)
      ||!Number.isFinite(Date.parse(cutoff)))
    throw Error('SWAP_ECAS_RECONCILE_CUTOFF_REQUIRED');
  if(String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')
    return {ok:true,readOnly:true,reason:'ECAS_FEATURE_DISABLED',attempted:0,queued:0};
  if(typeof Swap20_tryQueueCombinedEcasLocked_!=='function'
      ||typeof Swap20_notificationIntentKey_!=='function')
    throw Error('SWAP_ECAS_EXISTING_DISPATCH_UNAVAILABLE');
  // Only persisted intents from the canonical commit action qualify.
  var all=props.getProperties();
  var candidates=Object.keys(all).filter(function(key){
    return key.indexOf(SWAP20_ECAS_INTENT_PREFIX_)===0;
  });
  if(candidates.length>300)throw Error('SWAP_ECAS_INTENT_LIMIT_REVIEW');
  var intents=candidates.map(function(key){
    var item=JSON.parse(String(all[key]||'{}'));
    var id=key.slice(SWAP20_ECAS_INTENT_PREFIX_.length);
    if(Swap20_notificationIntentKey_(id)!==key||item.operationId!==id
       ||item.combined!==true||item.lifecycleUnchanged!==true
       ||item.eventKey!=='ECAS_AUDIT_CHANGED_DIGEST')
      throw Error('SWAP_ECAS_INTENT_CORRUPT');
    return item;
  }).filter(function(item){
    var created=Date.parse(String(item.createdAt||''));
    if(!Number.isFinite(created))throw Error('SWAP_ECAS_INTENT_DATE_CORRUPT');
    return created>=Date.parse(cutoff)&&item.status==='AWAITING_PRIOR_ECAS_RECEIPTS';
  }).sort(function(a,b){return Date.parse(a.createdAt)-Date.parse(b.createdAt);});
  var result={ok:true,readOnly:false,attempted:0,queued:0,skipped:0,errors:[]};
  for(var i=0;i<intents.length;i++){
    var item=intents[i];
    result.attempted++;
    try{
      // The existing dispatcher checks APPLIED, committed journal, both
      // authenticated receipts, live canonical pair, queue idempotency,
      // event config and the current CB recipient. Never bypass it.
      var outcome=Swap20_tryQueueCombinedEcasLocked_(item.operationId);
      if(outcome&&outcome.queued===true)result.queued++;
      else{
        result.skipped++;
        result.errors.push({operationId:item.operationId,
          reason:String(outcome&&outcome.reason||'NOT_QUEUED').slice(0,120)});
      }
    }catch(err){
      result.errors.push({operationId:item.operationId,
        reason:String(err&&err.message||err).slice(0,120)});
    }
  }
  result.ok=result.errors.length===0;
  return result;
}
function RUN_SWAP20_ECAS_NOTIFICATION_DIAG_DEV_20261109(){
  var props=PropertiesService.getScriptProperties();
  if(String(props.getProperty('AMS_ENV')||'').trim().toUpperCase()!=='DEV')
    throw Error('SWAP_ECAS_DIAG_DEV_ONLY');
  var all=props.getProperties(),intents=Object.keys(all).filter(function(k){
    return k.indexOf(SWAP20_ECAS_INTENT_PREFIX_)===0;
  });
  var statuses={};
  intents.forEach(function(k){
    var record=JSON.parse(String(all[k]||'{}')),status=String(record.status||'UNKNOWN');
    statuses[status]=(statuses[status]||0)+1;
  });
  var info={readOnly:true,intentCount:intents.length,intentStatuses:statuses,
    enabled:String(props.getProperty('AMS_SWAP20_ECAS_OUTBOX_ENABLED')||'').toUpperCase()==='YES'};
  Logger.log(JSON.stringify(info));return info;
}
