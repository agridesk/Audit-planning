// Combined ECAS notification for one verified SWAP operation. Caller holds script lock.
// No direct email; Notification Queue remains the single delivery owner.
// SWAP-specific authoritative receipt verifier. Avoid colliding global
// ECAS20_VerifyPersistedCommunication_ implementations with different
// contracts; a queue SENT row alone is NOT confirmed external delivery.
function Swap20_verifyEcasDeliveredReceipt_(auditId,communicationId,planningDigest){
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
 if(!id||!auditId||!communicationId||!planningDigest)return false;
 var ss=SpreadsheetApp.openById(id),sh=ss&&ss.getSheetByName('AMS_ECAS_Communication_Receipts');
 if(!sh||sh.getLastRow()<2)return false;
 var rows=sh.getDataRange().getValues(),headers=rows[0]||[];
 var expected=['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At'];
 var cols=expected.map(function(k){return headers.indexOf(k)});
 if(cols.some(function(c){return c<0}))return false;
 var matches=0;
 for(var i=1;i<rows.length;i++){
  var row=rows[i];
  if(String(row[cols[0]]||'')!==String(auditId)
    ||String(row[cols[1]]||'')!==String(communicationId)
    ||String(row[cols[2]]||'')!==String(planningDigest))continue;
  if(String(row[cols[3]]||'').trim().toUpperCase()!=='SENT'||!row[cols[4]])continue;
  matches++;
 }
 return matches===1;
}
function Swap20_digestPlanning_(planningJson) {
 var raw=String(planningJson||'');
 if(!raw)throw Error('Previous ECAS planning unavailable');
 var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw,Utilities.Charset.UTF_8);
 return bytes.map(function(b){return ('0'+(b<0?b+256:b).toString(16)).slice(-2);}).join('');
}
function Swap20_existingCombinedQueueLocked_(operationId){
 var ss=SpreadsheetApp.openById(String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||''));
 var name=NotificationConfig_GetQueueSheetName();
 var sh=ss.getSheetByName(name);
 if(!sh)throw Error('Notification Queue missing');
 var last=sh.getLastRow();
 if(last<2)return null;
 // Search the durable queue ledger rather than a bounded recent duplicate window.
 var needle='SWAP_'+String(operationId);
 var matches=sh.getRange(2,5,last-1,1).createTextFinder(needle).matchEntireCell(true).findAll();
 if(matches.length>1)throw Error('Duplicate SWAP queue ledger entries require review');
 if(!matches.length)return null;
 var row=matches[0].getRow();
 var cells=sh.getRange(row,1,1,13).getValues()[0];
 if(String(cells[2])!=='ECAS_AUDIT_CHANGED_DIGEST')throw Error('SWAP queue event mismatch');
 var payload=JSON.parse(String(cells[12]||'{}')).payload||{};
 if(String(payload.operationId)!==String(operationId)||!Array.isArray(payload.swapItems)||payload.swapItems.length!==2)
  throw Error('SWAP queue payload identity mismatch');
 return {row:row,status:String(cells[1]||''),payload:payload};
}
function Swap20_tryQueueCombinedEcasLocked_(operationId){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV only ECAS queue');
 if(String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')
  return {ok:false,queued:false,reason:'FEATURE_DISABLED'};
 var proposal=Swap20Store_read_(operationId);
 if(!proposal||proposal.status!=='APPLIED'||proposal.canonicalCommitVerified!==true)
  throw Error('SWAP is not APPLIED');
 var history=Swap20Journal_history_(operationId);
 if(!history.length||history[history.length-1].stage!=='COMMITTED'||history[0].stage!=='PREPARED')
  throw Error('SWAP journal not committed');
 var previous=history[0].payload&&history[0].payload.canonical;
 if(!previous||!Array.isArray(previous.rows)||previous.rows.length!==2)
  throw Error('SWAP before-image incomplete');
 var existing=Swap20_existingCombinedQueueLocked_(operationId);
 if(existing){
  var acceptable=['PENDING','RESERVED','SENT','SENT_DEV_REDIRECT'];
  if(acceptable.indexOf(existing.status.toUpperCase())<0)
   return {ok:false,queued:false,reason:'QUEUE_REQUIRES_REVIEW',queueStatus:existing.status};
  return {ok:true,queued:true,idempotent:true,status:existing.status};
 }
 // An absent config row must never inherit NotificationConfig's permissive default.
 if(typeof NotificationConfig_GetAllEvents!=='function')return {ok:false,queued:false,reason:'EVENT_CONFIG_MAP_UNAVAILABLE'};
 var allConfig=NotificationConfig_GetAllEvents();
 if(!allConfig||!Object.prototype.hasOwnProperty.call(allConfig,'ECAS_AUDIT_CHANGED_DIGEST'))
  return {ok:false,queued:false,reason:'EVENT_CONFIG_MISSING'};
 var cfg=NotificationConfig_GetEvent('ECAS_AUDIT_CHANGED_DIGEST');
 if(!cfg||cfg.active!==true||cfg.sendEmail!==true||cfg.logOnly===true)
  return {ok:false,queued:false,reason:'EVENT_NOT_ENABLED_FOR_DELIVERY'};
 if(typeof ECAS20_findConfirmedReceipt_!=='function'||typeof ECAS20_receiptDigest_!=='function')
  return {ok:false,queued:false,reason:'RECEIPT_FINDER_MISSING'};
 var recipient=StatusNotificationBridge_GetEcasRecipientEmail_();
 if(!recipient)return {ok:false,queued:false,reason:'ECAS_RECIPIENT_MISSING'};
 var norm=previous.headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');});
 var idCol=norm.indexOf('auditid'),jsonCol=norm.indexOf('planningjson');
 if(idCol<0||jsonCol<0)throw Error('Previous SWAP planning schema invalid');
 var ids=[proposal.auditA,proposal.auditB],items=[];
 for(var i=0;i<2;i++){
  var image=previous.rows[i],auditId=ids[i];
  if(String(image.auditId)!==String(auditId)||String(image.values[idCol])!==String(auditId))
   throw Error('SWAP before-image audit identity mismatch');
  var oldJson=String(image.values[jsonCol]||''),old=JSON.parse(oldJson);
  if(!Array.isArray(old.blocks)||!old.blocks.length)throw Error('Previous audit blocks missing');
  var actualDigest=ECAS20_receiptDigest_(old.blocks);
  var communicated=ECAS20_findConfirmedReceipt_(auditId,actualDigest);
  if(!communicated)
   return {ok:false,queued:false,reason:'PREVIOUS_DELIVERY_PROOF_MISSING',auditId:auditId};
  if(!Swap20_verifyEcasDeliveredReceipt_(auditId,communicated.communicationId,actualDigest))
   return {ok:false,queued:false,reason:'PREVIOUS_DELIVERY_NOT_VERIFIED',auditId:auditId};
  var detail=NB_loadAuditBriefing_(auditId,{});
  if(!detail||String(detail.auditId)!==String(auditId))
   return {ok:false,queued:false,reason:'CURRENT_AUDIT_BRIEFING_MISSING',auditId:auditId};
  var blocks=i===0?proposal.blocksA:proposal.blocksB;
  if(!Array.isArray(blocks)||!blocks.length)throw Error('SWAP new blocks missing');
  if(!detail.company||!(detail.auditNumber||detail.mpsNumber)||!detail.auditorEmail||
      !Array.isArray(detail.scopes)||!detail.scopes.length)
   return {ok:false,queued:false,reason:'INCOMPLETE_ECAS_BRIEFING',auditId:auditId};
  // The scope -> CB mapping is resolved at runtime, not assumed from ECAS UI.
  if(typeof NB_assertEcasSwapScopeOwnership_!=='function')
   return {ok:false,queued:false,reason:'SWAP_CB_OWNER_GUARD_MISSING'};
  NB_assertEcasSwapScopeOwnership_(detail.scopes);
  items.push({auditId:auditId,eventType:'ECAS_AUDIT_CHANGED_DIGEST',
   company:detail.company,mpsNumber:detail.mpsNumber||detail.auditNumber,
   auditorEmail:detail.auditorEmail,auditorName:detail.auditorName||detail.auditorEmail,
   scopes:detail.scopes,blocks:blocks,previousBlocks:old.blocks,
   previousPlanningJson:oldJson,plannedHours:blocks.reduce(function(sum,b){
    return sum+(Swap20_scheduleMinutes_(b.end)-Swap20_scheduleMinutes_(b.start))/60;
   },0),ecasComment:String(proposal.ecasComment||''),skipAuditBriefing:true});
 }
 // Verify current persisted canonical pair before queuing; no guessed success.
 if(Swap20_verifyCommittedReconciliationLocked_(history,proposal)!==true)
  throw Error('SWAP pair no longer matches committed state');
 var payload={auditId:'SWAP_'+operationId,operationId:operationId,
  eventType:'ECAS_AUDIT_CHANGED_DIGEST',recipientRole:'PLANNING',
  skipAuditBriefing:true,ecasComment:String(proposal.ecasComment||''),
  swapItems:items,config:{consolidate:true,bufferMinutes:10,
   digestGroup:'ECAS_OPERATIONAL',templateFamily:'EXTERNAL_OPERATIONAL'}};
 var outcome=NB_queueNotification_(recipient,'ECAS_AUDIT_CHANGED_DIGEST',payload);
 if(!outcome||outcome.success!==true||outcome.skipped===true)
  return {ok:false,queued:false,reason:'QUEUE_NOT_APPENDED',outcome:outcome||null};
 var key=Swap20_notificationIntentKey_(operationId),raw=props.getProperty(key);
 if(!raw)throw Error('SWAP intent missing after queue append');
 var intent=JSON.parse(raw);
 intent.status='QUEUED';intent.queuedAt=new Date().toISOString();
 props.setProperty(key,JSON.stringify(intent));
 return {ok:true,queued:true,idempotent:false,status:'QUEUED'};
}
