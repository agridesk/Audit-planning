// SWAP 2.0: consolidated post-commit notification readiness.
// The operation, not either audit, owns the one combined ECAS message.
// This inspection never writes to the queue or sends an email.
function Swap20_checkCombinedEcasReadiness_(operationId,receipts) {
 var id=String(operationId||'').trim(),p=PropertiesService.getScriptProperties();
 if(String(p.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('SWAP ECAS DEV only');
 var state=Swap20Store_read_(id),history=Swap20Journal_history_(id);
 if(!state||state.status!=='APPLIED'||state.canonicalCommitVerified!==true||
    !history.length||history[history.length-1].stage!=='COMMITTED')
  return {ok:false,ready:false,reason:'SWAP_NOT_DURABLY_APPLIED'};
 var raw=p.getProperty(Swap20_notificationIntentKey_(id));
 if(!raw)return {ok:false,ready:false,reason:'NOTIFICATION_INTENT_MISSING'};
 var intent=JSON.parse(raw);
 if(intent.operationId!==id||intent.auditA!==state.auditA||intent.auditB!==state.auditB||
    intent.eventKey!=='ECAS_AUDIT_CHANGED_DIGEST'||intent.combined!==true)
  return {ok:false,ready:false,reason:'INTENT_CONFLICT'};
 if(!receipts||!receipts[state.auditA]||!receipts[state.auditB])
  return {ok:false,ready:false,reason:'PRIOR_RECEIPTS_MISSING'};
 var ids=[state.auditA,state.auditB];
 for(var i=0;i<ids.length;i++){
  var prior=receipts[ids[i]];
  if(!prior||String(prior.auditId)!==String(ids[i])||!prior.communicationId||!prior.planningDigest)
   return {ok:false,ready:false,reason:'PRIOR_RECEIPT_INCOMPLETE'};
  if(typeof ECAS20_VerifyPersistedCommunication_!=='function'||
     ECAS20_VerifyPersistedCommunication_(ids[i],prior.communicationId,prior)!==true)
   return {ok:false,ready:false,reason:'PRIOR_DELIVERY_UNVERIFIED'};
 }
 return {ok:true,ready:true,operationId:id,eventKey:'ECAS_AUDIT_CHANGED_DIGEST',
  combined:true,uniqueOperationKey:'SWAP20_ECAS_'+id,recipientCount:1,
  queued:false,sent:false};
}
