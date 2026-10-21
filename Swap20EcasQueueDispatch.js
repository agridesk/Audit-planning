// Queue ONE atomic ECAS change digest for a committed two-audit SWAP.
// Called with the manager script lock already held. No direct email sending.
function Swap20_tryQueueCombinedEcasLocked_(operationId) {
 var props=PropertiesService.getScriptProperties(),id=String(operationId||'').trim();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')return {ok:false,queued:false,reason:'DEV_ONLY'};
 if(String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()!=='YES')return {ok:false,queued:false,reason:'FEATURE_DISABLED'};
 if(typeof NotificationConfig_GetEvent!=='function')return {ok:false,queued:false,reason:'CONFIG_UNAVAILABLE'};
 var cfg=NotificationConfig_GetEvent('ECAS_AUDIT_CHANGED_DIGEST');
 if(!cfg||cfg.active!==true)return {ok:false,queued:false,reason:'EVENT_INACTIVE'};
 var proposal=Swap20Store_read_(id),history=Swap20Journal_history_(id);
 if(!proposal||proposal.status!=='APPLIED'||proposal.canonicalCommitVerified!==true||
   !history.length||history[history.length-1].stage!=='COMMITTED')
   return {ok:false,queued:false,reason:'SWAP_NOT_DURABLY_APPLIED'};
 var intentKey=Swap20_notificationIntentKey_(id),intentRaw=props.getProperty(intentKey);
 if(!intentRaw)return {ok:false,queued:false,reason:'INTENT_MISSING'};
 var intent=JSON.parse(intentRaw);
 if(intent.status==='QUEUED')return {ok:true,queued:false,idempotent:true,status:'QUEUED'};
 if(intent.auditA!==proposal.auditA||intent.auditB!==proposal.auditB||intent.combined!==true)
   return {ok:false,queued:false,reason:'INTENT_CONFLICT'};
 var journalBefore=history[0]&&history[0].stage==='PREPARED'&&history[0].payload&&history[0].payload.canonical;
 if(!journalBefore||!Array.isArray(journalBefore.rows)||journalBefore.rows.length!==2)
   return {ok:false,queued:false,reason:'JOURNAL_SNAPSHOT_MISSING'};
 var indexes={};
 journalBefore.headers.forEach(function(h,i){indexes[String(h||'').toLowerCase().replace(/[ _-]/g,'')]=i;});
 if(indexes.planningjson===undefined||indexes.company===undefined)
   return {ok:false,queued:false,reason:'CANONICAL_SCHEMA_MISSING'};
 var changes=[];
 for(var i=0;i<2;i++){
  var image=journalBefore.rows[i],aid=String(image.auditId||'');
  if(aid!==String(i===0?proposal.auditA:proposal.auditB))
   return {ok:false,queued:false,reason:'JOURNAL_PAIR_MISMATCH'};
  var prior=JSON.parse(String(image.values[indexes.planningjson]||'{}'));
  var originalBlocks=prior.blocks||[];
  if(!originalBlocks.length)return {ok:false,queued:false,reason:'ORIGINAL_PLAN_MISSING'};
  var digest=ECAS20_PlanningDigest_(originalBlocks);
  var receipt=Swap20_findPriorEcasReceipt_(aid,digest);
  if(!receipt)return {ok:false,queued:false,reason:'AWAITING_PRIOR_ECAS_RECEIPTS',auditId:aid};
  var live=PRT_readCanonicalRow_(aid),liveHeaders=live.headers||[],liveValues=live.row||[];
  var liveIndex={};
  liveHeaders.forEach(function(h,j){liveIndex[String(h||'').toLowerCase().replace(/[ _-]/g,'')]=j;});
  if(liveIndex.planningjson===undefined||liveIndex.status===undefined||
     String(liveValues[liveIndex.status]||'').trim().toUpperCase()!=='ACCEPTED')
   return {ok:false,queued:false,reason:'LIVE_AUDIT_NOT_ACCEPTED'};
  var newPlan=JSON.parse(String(liveValues[liveIndex.planningjson]||'{}'));
  var actualBlocks=newPlan.blocks||[],expected=i===0?proposal.blocksA:proposal.blocksB;
  if(JSON.stringify(actualBlocks.map(Swap20_justScheduleBlock_))!==JSON.stringify(expected.map(Swap20_justScheduleBlock_)))
   return {ok:false,queued:false,reason:'LIVE_PLAN_NOT_COMMITTED'};
  var detail=PlanningWorkspacePlannedAuditReadService_get({auditId:aid});
  if(!detail||!detail.auditorName||!detail.auditorEmail)
   return {ok:false,queued:false,reason:'AUDITOR_IDENTITY_MISSING'};
  var company=String(image.values[indexes.company]||'').trim();
  var uid=indexes.companyuid===undefined?'':String(image.values[indexes.companyuid]||'').trim();
  var mps=typeof NB_loadCompanyNumberForBriefing_==='function'?
    String(NB_loadCompanyNumberForBriefing_(SpreadsheetApp.getActiveSpreadsheet(),uid,company)||'').trim():'';
  if(!company||!mps)return {ok:false,queued:false,reason:'COMPANY_MPS_MISSING',auditId:aid};
  var scopes=[];
  journalBefore.headers.forEach(function(h,j){
   if(/^SCOPE_\d{2}$/.test(String(h||''))&&String(image.values[j]||'').trim())scopes.push(String(image.values[j]).trim());
  });
  if(!scopes.length)return {ok:false,queued:false,reason:'SCOPES_MISSING',auditId:aid};
  var hours=originalBlocks.reduce(function(total,b){return total+(Swap20_scheduleMinutes_(b.end)-Swap20_scheduleMinutes_(b.start))/60;},0);
  var base={auditId:aid,company:company,companyUid:uid,mpsNumber:mps,auditorName:detail.auditorName,
   auditorEmail:detail.auditorEmail,scopes:scopes,plannedHours:hours,
   skipAuditBriefing:true};
  var before=Object.assign({},base,{blocks:originalBlocks,
   version:'BEFORE_'+id,communicationId:receipt.communicationId,planningDigest:digest,communicatedToEcas:true});
  var after=Object.assign({},base,{blocks:actualBlocks,version:'AFTER_'+id});
  changes.push({before:before,after:after});
 }
 var combined=Swap20_prepareCombinedEcasDigest_(proposal,changes);
 var recipient=StatusNotificationBridge_GetEcasRecipientEmail_();
 if(!recipient)return {ok:false,queued:false,reason:'ECAS_RECIPIENT_MISSING'};
 var queue=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Notification Queue');
 var queueAuditId='SWAP_'+id;
 if(queue&&queue.getLastRow()>1){
  var existing=queue.getRange(2,2,queue.getLastRow()-1,4).getValues();
  for(var q=0;q<existing.length;q++){
   if(String(existing[q][3])!==queueAuditId||String(existing[q][1])!=='ECAS_AUDIT_CHANGED_DIGEST')continue;
   var previousStatus=String(existing[q][0]||'').toUpperCase();
   if(previousStatus!=='PENDING'&&previousStatus!=='RESERVED'&&previousStatus!=='SENT'&&previousStatus!=='SENT_DEV_REDIRECT')
    return {ok:false,queued:false,reason:'EXISTING_SWAP_QUEUE_REQUIRES_REVIEW'};
   intent.status='QUEUED';intent.queueAuditId=queueAuditId;intent.queueRow=q+2;
   props.setProperty(intentKey,JSON.stringify(intent));
   return {ok:true,queued:false,idempotent:true,status:'QUEUED'};
  }
 }
 var queued=NB_queueNotification_(recipient,'ECAS_AUDIT_CHANGED_DIGEST',{
  eventType:'ECAS_AUDIT_CHANGED_DIGEST',auditId:queueAuditId,
  company:'Gecombineerde auditwissel',ecasComment:proposal.ecasComment,
  swapItems:combined.items,skipAuditBriefing:true,recipientRole:'PLANNING'});
 if(!queued||queued.success!==true||(queued.skipped&&queued.reason!=='DUPLICATE_QUEUE_ROW'))
  return {ok:false,queued:false,reason:'QUEUE_REJECTED',result:queued||null};
 intent.status='QUEUED';intent.queueAuditId=queueAuditId;intent.queuedAt=new Date().toISOString();
 props.setProperty(intentKey,JSON.stringify(intent));
 return {ok:true,queued:!queued.skipped,combined:true,operationId:id,status:'QUEUED'};
}
function Swap20_justScheduleBlock_(b) {
 return {date:String(b.date||''),start:String(b.start||''),end:String(b.end||'')};
}
function Swap20_findPriorEcasReceipt_(auditId,digest) {
 var id=String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')||'');
 if(!id)return null;
 var sh=SpreadsheetApp.openById(id).getSheetByName('AMS_ECAS_Communication_Receipts');
 if(!sh||sh.getLastRow()<2)return null;
 var rows=sh.getRange(2,1,sh.getLastRow()-1,5).getValues();
 for(var i=rows.length-1;i>=0;i--){
  var row=rows[i];
  if(String(row[0])===String(auditId)&&String(row[2])===String(digest)&&
    String(row[3]).toUpperCase()==='SENT'&&row[4]){
   var receipt={communicationId:String(row[1])};
   if(ECAS20_VerifyPersistedCommunication_(auditId,receipt.communicationId,{planningDigest:digest}))return receipt;
  }
 }
 return null;
}
