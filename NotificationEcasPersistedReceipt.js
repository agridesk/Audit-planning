// AMS 2.0 ECAS delivery provenance. Read-only, fail-closed.
// The Notification Queue SENT record is the source of the last ECAS communication.
function ECAS20_VerifyPersistedCommunication_(auditId,communicationId,before){
  auditId=String(auditId||'').trim();communicationId=String(communicationId||'').trim();before=before||{};
  if(!auditId||!communicationId||String(before.auditId||'').trim()!==auditId)return false;
  var sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notification Queue');
  if(!sheet||sheet.getLastRow()<2)return false;
  var values=sheet.getDataRange().getValues(),h=values[0].map(function(x){return String(x||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');});
  var idx=function(name){return h.indexOf(name);};
  var c={status:idx('status'),type:idx('type'),recipient:idx('recipient'),audit:idx('auditid'),hash:idx('payloadhash'),sent:idx('timestampsent'),reserved:idx('reserved')};
  if(Object.keys(c).some(function(k){return c[k]<0;}))return false;
  var canonicalRecipient=StatusNotificationBridge_GetEcasRecipientEmail_();
  if(!canonicalRecipient)return false;
  var found=0;
  for(var i=1;i<values.length;i++){
    var r=values[i],status=String(r[c.status]||'').trim().toUpperCase(),event=String(r[c.type]||'').trim().toUpperCase();
    if(status!=='SENT'||!r[c.sent]||String(r[c.audit]||'').trim()!==auditId||String(r[c.hash]||'').trim()!==communicationId)continue;
    if(event!=='ECAS_AUDIT_APPROVAL_DIGEST'&&event!=='ECAS_AUDIT_CHANGED_DIGEST')continue;
    var raw;try{raw=JSON.parse(String(r[c.reserved]||''));}catch(e){continue;}
    var p=raw&&raw.payload||raw||{};
    if(String(p.auditId||'').trim()!==auditId||String(r[c.recipient]||'').trim().toLowerCase()!==String(canonicalRecipient).trim().toLowerCase())continue;
    if(String(before.company||'').trim()!==String(p.company||'').trim())continue;
    if(String(before.mpsNumber||'').trim()!==String(p.mpsNumber||'').trim())continue;
    if(String(before.auditorUid||'').trim()!==String(p.auditorUid||'').trim())continue;
    if(JSON.stringify(before.scopes||[])!==JSON.stringify(p.scopes||[]))continue;
    if(Number(before.plannedHours)!==Number(p.plannedHours))continue;
    if(JSON.stringify(before.blocks||[])!==JSON.stringify(p.blocks||[]))continue;
    found++;
  }
  return found===1;
}
