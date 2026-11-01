// AMS 2.0 #88. Canonical post-transition ECAS outbox adapter.
// Never trusts a caller-supplied prior schedule; reads a persisted SENT digest.
function ECAS20_SentEpoch_(value){
 if(value instanceof Date)return value.getTime();
 var s=String(value||'').trim(),m=s.match(/^(\\d{2})[-/](\\d{2})[-/](\\d{4})(?:[ T](\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);
 if(m)return Date.UTC(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
 if(/^\\d{4}-\\d{2}-\\d{2}/.test(s)||/^[A-Za-z]{3} /.test(s))return Date.parse(s);
 return NaN;
}
function ECAS20_QueueCommittedLifecycle_(action,ctx,payload,result){
  action=String(action||'').trim().toUpperCase();ctx=ctx||{};payload=payload||{};result=result||{};
  var auditId=String(ctx.auditId||'').trim(),reason=String(payload.reason||payload.comment||'').trim();
  if(action!=='CANCEL'&&action!=='REJECT')return {ok:false,queued:false,reason:'UNSUPPORTED_ACTION'};
  if(result.success!==true||!auditId)return {ok:false,queued:false,reason:'TRANSITION_NOT_COMMITTED'};
  if(!reason)return {ok:false,queued:false,reason:'ACTION_REASON_REQUIRED'};
  if(typeof ECAS20_SubmitVerifiedChangeCancel_!=='function')return {ok:false,queued:false,reason:'GATE_UNAVAILABLE'};
  var recipient=StatusNotificationBridge_GetEcasRecipientEmail_();
  if(!recipient)return {ok:false,queued:false,reason:'ECAS_RECIPIENT_MISSING'};
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notification Queue');
  if(!sheet||sheet.getLastRow()<2)return {ok:false,queued:false,reason:'NO_PRIOR_ECAS_COMMUNICATION'};
  var values=sheet.getDataRange().getValues(),header=values[0].map(function(x){return String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');});
  var c={status:header.indexOf('status'),type:header.indexOf('type'),recipient:header.indexOf('recipient'),audit:header.indexOf('auditid'),hash:header.indexOf('payloadhash'),sent:header.indexOf('timestampsent'),reserved:header.indexOf('reserved')};
  if(Object.keys(c).some(function(k){return c[k]<0;}))return {ok:false,queued:false,reason:'NOTIFICATION_QUEUE_SCHEMA_UNVERIFIED'};
  var prior=[],eventKey=action==='CANCEL'?'ECAS_AUDIT_CANCELLED_DIGEST':'ECAS_AUDIT_REJECTED_DIGEST';
  for(var i=1;i<values.length;i++){
    var r=values[i],event=String(r[c.type]||'').trim(),status=String(r[c.status]||'').trim().toUpperCase();
    if(status!=='SENT'||!r[c.sent]||String(r[c.audit]||'').trim()!==auditId||String(r[c.recipient]||'').trim().toLowerCase()!==recipient.toLowerCase())continue;
    if(event!=='ECAS_AUDIT_APPROVAL_DIGEST'&&event!=='ECAS_AUDIT_CHANGED_DIGEST')continue;
    var receipt=String(r[c.hash]||'').trim();if(!receipt)continue;
    var raw;try{raw=JSON.parse(String(r[c.reserved]||''));}catch(e){continue;}
    var p=raw&&raw.payload||raw||{};
    if(String(p.auditId||'').trim()!==auditId||!String(p.company||'').trim()||!String(p.mpsNumber||'').trim()||!String(p.auditorUid||'').trim()||!Array.isArray(p.scopes)||!p.scopes.length||!Array.isArray(p.blocks)||!p.blocks.length||!(Number(p.plannedHours)>0))continue;
    prior.push({receipt:receipt,payload:p,sentAt:String(r[c.sent])});
  }
  if(!prior.length)return {ok:false,queued:false,reason:'NO_VERIFIED_PRIOR_ECAS_COMMUNICATION'};
  prior=prior.filter(function(x){return !isNaN(Date.parse(x.sentAt));}).sort(function(a,b){return Date.parse(b.sentAt)-Date.parse(a.sentAt);});
  if(!prior.length)return {ok:false,queued:false,reason:'ECAS_SENT_TIMESTAMP_INVALID'};
  if(prior.length>1&&Date.parse(prior[0].sentAt)===Date.parse(prior[1].sentAt))return {ok:false,queued:false,reason:'AMBIGUOUS_PRIOR_ECAS_COMMUNICATION'};
  var record=prior[0],p=record.payload;
  var before={auditId:auditId,communicatedToEcas:true,communicationId:record.receipt,company:p.company,mpsNumber:p.mpsNumber,auditorUid:p.auditorUid,auditorName:p.auditorName||'',auditorEmail:p.auditorEmail||'',scopes:p.scopes,blocks:p.blocks,plannedDates:p.plannedDates||[],planningJson:p.planningJson||'',plannedHours:p.plannedHours,version:record.receipt};
  var after={auditId:auditId,version:String(result.transitionId||result.sourceRevision||result.afterStatus||result.newStatus||'COMMITTED')};
  if(!after.version||after.version===before.version)return {ok:false,queued:false,reason:'COMMITTED_VERSION_NOT_DISTINCT'};
  // Dedup before writing; same prior receipt + action may never be queued twice.
  for(var j=1;j<values.length;j++){
    var row=values[j];if(String(row[c.audit]||'').trim()!==auditId||String(row[c.type]||'').trim()!==eventKey)continue;
    var existing;try{existing=JSON.parse(String(row[c.reserved]||''));}catch(e2){continue;}
    var e=existing&&existing.payload||existing||{};
    if(String(e.originalEcasCommunicationId||'').trim()===record.receipt)return {ok:true,queued:false,reason:'ALREADY_QUEUED_FOR_PRIOR_RECEIPT'};
  }
  return ECAS20_SubmitVerifiedChangeCancel_({eventKey:eventKey,before:before,after:after,ecasComment:reason,idempotencyKey:'ECAS20|'+eventKey+'|'+auditId+'|'+record.receipt});
}
