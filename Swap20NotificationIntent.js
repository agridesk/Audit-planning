// Durable SWAP 2.0 external digest intent. No email is sent here.
// One operation ID corresponds to one combined change digest, never per audit.
function Swap20_notificationIntentKey_(operationId) {
 var id=String(operationId||'').trim();
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))throw Error('Invalid SWAP operation identifier');
 return 'AMS_SWAP20_ECAS_INTENT_'+id;
}
function Swap20_recordNotificationIntentLocked_(proposal) {
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV only SWAP intent');
 if(!proposal||!proposal.operationId)throw Error('Missing SWAP proposal');
 var state=Swap20Store_read_(proposal.operationId);
 var history=Swap20Journal_history_(proposal.operationId);
 if(!state||state.status!=='APPLIED'||state.canonicalCommitVerified!==true||
    !history.length||history[history.length-1].stage!=='COMMITTED')
  throw Error('SWAP not durably APPLIED');
 if(String(state.auditA)!==String(proposal.auditA)||String(state.auditB)!==String(proposal.auditB))
  throw Error('SWAP pair changed');
 var key=Swap20_notificationIntentKey_(proposal.operationId);
 var existing=props.getProperty(key);
 if(existing){
  var found=JSON.parse(existing);
  if(found.auditA!==state.auditA||found.auditB!==state.auditB||found.eventKey!=='ECAS_AUDIT_CHANGED_DIGEST'||found.combined!==true||found.lifecycleUnchanged!==true||found.ecasComment!==String(state.ecasComment||''))throw Error('SWAP notification intent conflict');
  return {ok:true,idempotent:true,operationId:state.operationId,notificationStatus:found.status};
 }
 var intent={operationId:state.operationId,auditA:state.auditA,auditB:state.auditB,
  eventKey:'ECAS_AUDIT_CHANGED_DIGEST',status:'AWAITING_PRIOR_ECAS_RECEIPTS',
  ecasComment:String(state.ecasComment||''),createdAt:new Date().toISOString(),
  combined:true,lifecycleUnchanged:true};
 if(!intent.ecasComment)throw Error('ECAS explanation missing');
 props.setProperty(key,JSON.stringify(intent));
 return {ok:true,idempotent:false,operationId:state.operationId,notificationStatus:intent.status};
}
// Call after the transaction has been durably APPLIED, under the same script lock.
// It does not queue or send, since earlier communication receipts are not yet proven.
function Swap20_stageNotificationAfterCommitLocked_(operationId) {
 return Swap20_recordNotificationIntentLocked_(Swap20Store_read_(operationId));
}
