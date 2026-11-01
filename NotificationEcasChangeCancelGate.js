// FILE: NotificationEcasChangeCancelGate.js
// AMS 2.0: fail-closed ECAS change/cancel integration entrypoint.
// This is deliberately NOT bound to generic lifecycle transitions.
// The authoritative scheduling owner must explicitly provide the last
// communicated ECAS snapshot and its persisted communication receipt.
function ECAS20_SubmitVerifiedChangeCancel_(input) {
  input=input||{};
  var key=String(input.eventKey||'').trim();
  if(!['ECAS_AUDIT_CHANGED_DIGEST','ECAS_AUDIT_CANCELLED_DIGEST','ECAS_AUDIT_REJECTED_DIGEST'].includes(key))
    return {ok:false,queued:false,reason:'UNSUPPORTED_EVENT'};
  var prepared=StatusNotificationBridge_PrepareEcasChangeCancel_(key,input.before,input.after,input.ecasComment);
  if(!prepared.ok)return {ok:false,queued:false,reason:'INVALID_ECAS_CONTEXT',errors:prepared.errors};
  var before=input.before||{}, after=input.after||{};
  if(key==='ECAS_AUDIT_CHANGED_DIGEST'&&
    JSON.stringify({blocks:before.blocks||[],dates:before.plannedDates||[],json:before.planningJson||''})===
    JSON.stringify({blocks:after.blocks||[],dates:after.plannedDates||[],json:after.planningJson||''}))
    return {ok:false,queued:false,reason:'SCHEDULE_UNCHANGED'};
  // The proof must be a persisted receipt, not a caller-provided boolean alone.
  if(!before.communicationId||!before.communicatedToEcas)
    return {ok:false,queued:false,reason:'PREVIOUS_DELIVERY_NOT_PROVEN'};
  if(String(PropertiesService.getScriptProperties().getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')
    return {ok:false,queued:false,reason:'FEATURE_DISABLED'};
  if(typeof NotificationConfig_GetEvent!=='function')
    return {ok:false,queued:false,reason:'CONFIG_LOOKUP_UNAVAILABLE'};
  var config=NotificationConfig_GetEvent(key);
  if(!config||config.active!==true)
    return {ok:false,queued:false,reason:'EVENT_INACTIVE'};
  // A caller-supplied receipt is not authoritative. Require the scheduling
  // owner to expose a persisted delivery-verification function.
  if(typeof ECAS20_VerifyPersistedCommunication_!=='function')
    return {ok:false,queued:false,reason:'COMMUNICATION_VERIFIER_UNAVAILABLE'};
  var verified=false;
  try { verified=ECAS20_VerifyPersistedCommunication_(String(before.auditId),String(before.communicationId),before)===true; }
  catch(eVerify){return {ok:false,queued:false,reason:'COMMUNICATION_VERIFICATION_ERROR'};}
  if(!verified)return {ok:false,queued:false,reason:'PREVIOUS_DELIVERY_NOT_VERIFIED'};
  var recipient=StatusNotificationBridge_GetEcasRecipientEmail_();
  if(!recipient)return {ok:false,queued:false,reason:'ECAS_RECIPIENT_MISSING'};
  // No direct sending. The existing Notification Queue controls delivery.
  var payload=prepared.payload;
  payload.idempotencyKey=String(input.idempotencyKey||'');
  payload.recipientRole='PLANNING';
  payload.recipientEmail=recipient;
  var result=StatusNotificationBridge_QueueWithLock_(recipient,key,payload,String(after.auditId));
  return {ok:!!(result&&result.success),queued:!!(result&&result.success&&!result.skipped),result:result||null};
}
function RUN_DIAG_ECAS20_GATE_DEV_20261021() {
  var props=PropertiesService.getScriptProperties();
  var env=String(props.getProperty('AMS_ENV')||props.getProperty('ENVIRONMENT')||'').toUpperCase();
  if(env==='PROD'||env==='PRODUCTION')throw new Error('DEV_ONLY_DIAGNOSTIC');
  var prior={auditId:'TEST',communicatedToEcas:true,communicationId:'TEST_RECEIPT',
    version:'1',company:'TEST',mpsNumber:'TEST',auditorName:'TEST',
    scopes:['MPS-GAP'],plannedHours:8,blocks:[{date:'2026-10-20'}]};
  var next={auditId:'TEST',version:'2',blocks:[{date:'2026-10-21'}]};
  // Does not activate flags, notifications or mutate stored records.
  var v=StatusNotificationBridge_PrepareEcasChangeCancel_('ECAS_AUDIT_CHANGED_DIGEST',prior,next,'TEST');
  var off=String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES';
  var result={ok:v.ok,readOnly:true,featureDisabled:off,payloadReady:v.ok,
    note:'Integration remains gated pending authoritative event source and ECAS delivery provenance.'};
  Logger.log(JSON.stringify(result));return result;
}
