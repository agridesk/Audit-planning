/**
 * DEV-only SWAP 2.0 -> ECAS operational notification reconciliation.
 * Call ONLY under NotificationSender's existing script lock.
 * This intentionally does not backfill historical SWAPs and does not send mail.
 * Missing evidence leaves the journal untouched and creates no queue entry.
 */
var SWAP20_ECAS_NOTIFY_EVENT_='ECAS_AUDIT_CHANGED_DIGEST';
function Swap20EcasNotifications_yes_(v){return String(v||'').trim().toUpperCase()==='YES';}
function Swap20EcasNotifications_config_(){
  var props=PropertiesService.getScriptProperties();
  if(String(props.getProperty('AMS_ENV')||'').trim().toUpperCase()!=='DEV')throw Error('SWAP_NOTIFY_DEV_ONLY');
  var ss=SpreadsheetApp.getActiveSpreadsheet(),expected=String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'').trim();
  if(!ss||!expected||ss.getId()!==expected)throw Error('SWAP_NOTIFY_SSOT_MISMATCH');
  var enabled=Swap20EcasNotifications_yes_(props.getProperty('AMS_SWAP20_ECAS_OUTBOX_ENABLED'));
  var since=String(props.getProperty('AMS_SWAP20_ECAS_OUTBOX_NOT_BEFORE')||'').trim();
  if(!enabled)return {enabled:false,ss:ss,reason:'SWAP_NOTIFY_DISABLED'};
  // Strict UTC activation boundary is mandatory: previous commits must never be replayed.
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(since)
      ||!Number.isFinite(Date.parse(since)))
    throw Error('SWAP_NOTIFY_ACTIVATION_CUTOFF_REQUIRED');
  var cfg=NotificationConfig_GetAllEvents();
  if(!cfg||!Object.prototype.hasOwnProperty.call(cfg,SWAP20_ECAS_NOTIFY_EVENT_))
    return {enabled:false,ss:ss,reason:'SWAP_NOTIFY_CONFIG_MISSING'};
  var event=NotificationConfig_GetEvent(SWAP20_ECAS_NOTIFY_EVENT_);
  if(!event||event.active!==true||event.sendEmail!==true||event.logOnly===true)
    return {enabled:false,ss:ss,reason:'SWAP_NOTIFY_EVENT_NOT_SENDABLE'};
  return {enabled:true,ss:ss,sinceMs:Date.parse(since),config:event};
}
function Swap20EcasNotifications_headers_(row){
  return (row||[]).map(function(x){return String(x||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');});
}
function Swap20EcasNotifications_column_(headers,name){
  var i=headers.indexOf(String(name).toLowerCase().replace(/[^a-z0-9]/g,''));
  if(i<0)throw Error('SWAP_NOTIFY_SCHEMA_'+name);
  return i;
}
function Swap20EcasNotifications_blocks_(blocks){
  if(!Array.isArray(blocks)||!blocks.length)throw Error('SWAP_NOTIFY_BLOCKS_MISSING');
  return blocks.map(function(b){
    var date=String(b.date||'').trim(),start=String(b.start||'').trim(),end=String(b.end||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))
      throw Error('SWAP_NOTIFY_BLOCK_INVALID');
    return {date:date,start:start,end:end};
  });
}
function Swap20EcasNotifications_equalBlocks_(a,b){
  return JSON.stringify(Swap20EcasNotifications_blocks_(a))===JSON.stringify(Swap20EcasNotifications_blocks_(b));
}
function Swap20EcasNotifications_candidates_(ss,sinceMs){
  var sh=ss.getSheetByName('AMS_Swap_20_Journal');
  if(!sh)throw Error('SWAP_NOTIFY_JOURNAL_MISSING');
  var last=sh.getLastRow();
  if(last<2)return [];
  var rows=sh.getRange(1,1,last,4).getValues(),h=Swap20EcasNotifications_headers_(rows[0]);
  var op=Swap20EcasNotifications_column_(h,'Operation_ID'),
    seq=Swap20EcasNotifications_column_(h,'Sequence'),
    stage=Swap20EcasNotifications_column_(h,'Stage'),
    time=Swap20EcasNotifications_column_(h,'Recorded_At');
  var byId={};
  for(var i=1;i<rows.length;i++){
    var row=rows[i],id=String(row[op]||'').trim();if(!id)continue;
    if(!/^SWAP20_[A-Za-z0-9_-]{8,100}$/.test(id))throw Error('SWAP_NOTIFY_JOURNAL_ID_INVALID');
    var sequence=Number(row[seq]),prior=byId[id];
    if(!Number.isInteger(sequence)||sequence<1||(prior&&sequence!==prior.sequence+1)||(!prior&&sequence!==1))
      throw Error('SWAP_NOTIFY_JOURNAL_SEQUENCE');
    byId[id]={operationId:id,sequence:sequence,stage:String(row[stage]||'').trim().toUpperCase(),time:String(row[time]||'').trim()};
  }
  return Object.keys(byId).map(function(id){return byId[id];}).filter(function(x){
    var stamp=Date.parse(x.time);
    if(!Number.isFinite(stamp))throw Error('SWAP_NOTIFY_JOURNAL_DATE_INVALID');
    return x.stage==='COMMITTED'&&stamp>=sinceMs;
  }).sort(function(a,b){return Date.parse(a.time)-Date.parse(b.time);});
}
function Swap20EcasNotifications_queue_(ss){
  var sh=ss.getSheetByName('Notification Queue');
  if(!sh)throw Error('SWAP_NOTIFY_QUEUE_MISSING');
  var rows=sh.getDataRange().getValues(),h=Swap20EcasNotifications_headers_(rows[0]||[]);
  var cols={};
  ['Status','Type','Recipient','Audit ID','PayloadHash','TimestampSent','Reserved'].forEach(function(x){
    cols[x]=Swap20EcasNotifications_column_(h,x);
  });
  return {rows:rows.slice(1),cols:cols};
}
function Swap20EcasNotifications_prior_(queue,auditId,recipient){
  var c=queue.cols,all=[];
  queue.rows.forEach(function(row){
    if(String(row[c['Audit ID']]||'').trim()!==auditId)return;
    if(String(row[c.Status]||'').trim().toUpperCase()!=='SENT')return;
    if(['ECAS_AUDIT_APPROVAL_DIGEST','ECAS_AUDIT_CHANGED_DIGEST'].indexOf(String(row[c.Type]||'').trim())<0)return;
    if(String(row[c.Recipient]||'').trim().toLowerCase()!==recipient.toLowerCase())return;
    var hash=String(row[c.PayloadHash]||'').trim(),stamp=Date.parse(String(row[c.TimestampSent]||'').trim());
    if(!hash||!Number.isFinite(stamp))return;
    var data;try{data=JSON.parse(String(row[c.Reserved]||''));}catch(e){return;}
    var p=data&&data.payload||data||{};
    if(String(p.auditId||'')!==auditId||!Array.isArray(p.blocks)||!Array.isArray(p.scopes)||!p.scopes.length)return;
    all.push({stamp:stamp,receipt:hash,payload:p});
  });
  all.sort(function(a,b){return b.stamp-a.stamp;});
  if(!all.length)throw Error('SWAP_NOTIFY_PRIOR_ECAS_SENT_PROOF_MISSING');
  if(all.length>1&&all[0].stamp===all[1].stamp)throw Error('SWAP_NOTIFY_PRIOR_ECAS_AMBIGUOUS');
  return all[0];
}
function Swap20EcasNotifications_hasQueued_(queue,operationId){
  var key='SWAP_'+operationId,c=queue.cols;
  return queue.rows.some(function(row){return String(row[c['Audit ID']]||'').trim()===key;});
}
function Swap20EcasNotifications_canonical_(ss,before,proposal){
  if(!before||!before.canonical||!Array.isArray(before.canonical.rows)
     ||before.canonical.rows.length!==2)throw Error('SWAP_NOTIFY_BEFORE_IMAGE_MISSING');
  var image=before.canonical,sh=ss.getSheetByName(image.sheetName);
  if(!sh)throw Error('SWAP_NOTIFY_CANONICAL_MISSING');
  var headers=Swap20EcasNotifications_headers_(image.headers||[]);
  var auditCol=Swap20EcasNotifications_column_(headers,'Audit ID'),
    jsonCol=Swap20EcasNotifications_column_(headers,'Planning JSON'),
    statusCol=Swap20EcasNotifications_column_(headers,'Status');
  var expected=[proposal.auditA,proposal.auditB],newBlocks=[proposal.blocksA,proposal.blocksB],out=[];
  image.rows.forEach(function(row,i){
    if(row.auditId!==expected[i]||!Array.isArray(row.values))throw Error('SWAP_NOTIFY_PAIR_MISMATCH');
    var oldPlan;try{oldPlan=JSON.parse(String(row.values[jsonCol]||''));}catch(e){throw Error('SWAP_NOTIFY_OLD_PLAN_INVALID');}
    var oldBlocks=Swap20EcasNotifications_blocks_(oldPlan.blocks);
    var newExpected=Swap20EcasNotifications_blocks_(newBlocks[i]);
    if(Swap20EcasNotifications_equalBlocks_(oldBlocks,newExpected))
      throw Error('SWAP_NOTIFY_SCHEDULE_UNCHANGED');
    var live=sh.getRange(row.rowNumber,1,1,image.headers.length).getValues()[0];
    if(String(live[auditCol]||'')!==row.auditId||String(live[statusCol]||'').trim().toUpperCase()!=='ACCEPTED')
      throw Error('SWAP_NOTIFY_CANONICAL_IDENTITY_CHANGED');
    var livePlan;try{livePlan=JSON.parse(String(live[jsonCol]||''));}catch(e){throw Error('SWAP_NOTIFY_LIVE_PLAN_INVALID');}
    if(!Swap20EcasNotifications_equalBlocks_(livePlan.blocks,newExpected))
      throw Error('SWAP_NOTIFY_CANONICAL_CHANGED_SINCE_COMMIT');
    out.push({auditId:row.auditId,oldBlocks:oldBlocks,newBlocks:newExpected});
  });
  return out;
}
function Swap20EcasNotifications_prepare_(ss,operationId,queue,recipient){
  var history=Swap20Journal_history_(operationId);
  if(history.length<3||history[0].stage!=='PREPARED'
     ||history[history.length-1].stage!=='COMMITTED')throw Error('SWAP_NOTIFY_NOT_COMMITTED');
  var proposal=Swap20Store_read_(operationId);
  if(!proposal||proposal.operationId!==operationId||!String(proposal.ecasComment||'').trim())
    throw Error('SWAP_NOTIFY_PROPOSAL_MISSING');
  var canonical=Swap20EcasNotifications_canonical_(ss,history[0].payload,proposal);
  var children=canonical.map(function(item){
    var proof=Swap20EcasNotifications_prior_(queue,item.auditId,recipient),p=proof.payload;
    if(!Swap20EcasNotifications_equalBlocks_(p.blocks,item.oldBlocks))
      throw Error('SWAP_NOTIFY_PRIOR_ECAS_PLAN_MISMATCH');
    if(!String(p.company||'').trim()||!String(p.mpsNumber||'').trim()
       ||!(String(p.auditorName||p.auditorEmail||'').trim())||!(Number(p.plannedHours)>0))
      throw Error('SWAP_NOTIFY_PRIOR_ECAS_DATA_INCOMPLETE');
    NB_assertEcasSwapScopeOwnership_(p.scopes);
    if(typeof ECAS20_VerifyPersistedCommunication_!=='function')throw Error('SWAP_NOTIFY_PROVENANCE_VERIFIER_MISSING');
    var before={auditId:item.auditId,company:p.company,mpsNumber:p.mpsNumber,
      auditorUid:p.auditorUid||'',scopes:p.scopes,plannedHours:p.plannedHours,blocks:p.blocks,
      plannedDates:p.plannedDates||[],planningJson:p.planningJson||''};
    if(ECAS20_VerifyPersistedCommunication_(item.auditId,proof.receipt,before)!==true)
      throw Error('SWAP_NOTIFY_PRIOR_ECAS_PROOF_INVALID');
    return {eventType:SWAP20_ECAS_NOTIFY_EVENT_,auditId:item.auditId,company:p.company,
      mpsNumber:p.mpsNumber,auditorUid:p.auditorUid||'',auditorName:p.auditorName||'',
      auditorEmail:p.auditorEmail||'',scopes:p.scopes,plannedHours:p.plannedHours,
      previousBlocks:item.oldBlocks,previousPlannedDates:p.plannedDates||[],
      blocks:item.newBlocks,plannedDates:item.newBlocks.map(function(b){return b.date;}),
      ecasComment:String(proposal.ecasComment).trim(),skipAuditBriefing:true,
      originalEcasCommunicationId:proof.receipt};
  });
  if(children.length!==2||children[0].auditId===children[1].auditId)
    throw Error('SWAP_NOTIFY_PAIR_INVALID');
  return {eventType:SWAP20_ECAS_NOTIFY_EVENT_,auditId:'SWAP_'+operationId,
    operationId:operationId,company:children.map(function(x){return x.company;}).join(' / '),
    swapItems:children,ecasComment:String(proposal.ecasComment).trim(),skipAuditBriefing:true};
}
/**
 * No mail, no historical backfill. Returns detailed blockers for operator diagnostics.
 * When explicitly enabled and fully verified, adds one atomic queue item only.
 */
function Swap20_reconcileEcasIntentsLocked_(){
  var config=Swap20EcasNotifications_config_();
  if(!config.enabled)return {ok:true,readOnly:true,reason:config.reason,attempted:0,queued:0};
  var candidates=Swap20EcasNotifications_candidates_(config.ss,config.sinceMs);
  var queue=Swap20EcasNotifications_queue_(config.ss),recipient=String(StatusNotificationBridge_GetEcasRecipientEmail_()||'').trim().toLowerCase();
  if(!recipient)throw Error('SWAP_NOTIFY_RECIPIENT_MISSING');
  var result={ok:true,attempted:0,queued:0,skipped:0,errors:[]};
  for(var i=0;i<candidates.length;i++){
    var op=candidates[i].operationId;
    if(Swap20EcasNotifications_hasQueued_(queue,op)){result.skipped++;continue;}
    result.attempted++;
    try{
      var payload=Swap20EcasNotifications_prepare_(config.ss,op,queue,recipient);
      // Sender already holds the global ScriptLock; never reenter QueueWithLock_.
      var sent=NB_queueNotification_(recipient,SWAP20_ECAS_NOTIFY_EVENT_,payload);
      if(!sent||sent.success!==true||sent.skipped)throw Error('SWAP_NOTIFY_QUEUE_REJECTED');
      result.queued++;
      // Refresh to protect against duplicates within the current run.
      queue=Swap20EcasNotifications_queue_(config.ss);
    }catch(err){
      result.ok=false;
      result.errors.push({operationId:op,error:String(err&&err.message||err).slice(0,180)});
    }
  }
  return result;
}
/** Read-only diagnosis; deliberately never activates or queues. */
function RUN_SWAP20_ECAS_NOTIFICATION_DIAG_DEV_20261109(){
  var cfg=Swap20EcasNotifications_config_(),ss=cfg.ss;
  var journal=ss.getSheetByName('AMS_Swap_20_Journal');
  var rows=journal?journal.getRange(1,1,journal.getLastRow(),4).getValues():[];
  var committed=rows.slice(1).filter(function(r){return r[2]==='COMMITTED';}).length;
  var q=Swap20EcasNotifications_queue_(ss),queued=q.rows.filter(function(r){
    return String(r[q.cols['Audit ID']]||'').indexOf('SWAP_')===0;
  }).length;
  var output={readOnly:true,enabled:cfg.enabled,reason:cfg.reason||'',
    committedJournalRecords:committed,swapQueueRows:queued};
  Logger.log(JSON.stringify(output));return output;
}
