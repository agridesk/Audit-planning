// DEV-only read-only SWAP / ECAS 2.0 acceptance gate.
// Does not send mail, change configuration, or write audits.
function RUN_DIAG_SWAP_ECAS20_DEV_READY_20261022(){
 var props=PropertiesService.getScriptProperties();
 var dev='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV_ENV_REQUIRED');
 if(String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==dev)throw Error('DEV_SSOT_ID_MISMATCH');
 var ss=SpreadsheetApp.openById(dev),issues=[],counts={};
 function checkSheet(name,headers){
  var sh=ss.getSheetByName(name);
  if(!sh){issues.push('MISSING_'+name);return null;}
  if(headers){
   var row=sh.getRange(1,1,1,headers.length).getValues()[0].map(String);
   if(JSON.stringify(row)!==JSON.stringify(headers))issues.push('HEADER_MISMATCH_'+name);
  }
  return sh;
 }
 var canonical=checkSheet('Audit planning');
 var availability=checkSheet('Auditor Availability');
 var journal=checkSheet('AMS_Swap_20_Journal',['Operation_ID','Sequence','Stage','Recorded_At','Payload_JSON']);
 var receipts=checkSheet('AMS_ECAS_Communication_Receipts',['Audit_ID','Communication_ID','Planning_Digest','Delivery_Status','Delivered_At']);
 var queue=checkSheet(NotificationConfig_GetQueueSheetName());
 counts.auditRows=canonical?Math.max(0,canonical.getLastRow()-1):0;
 counts.availabilityRows=availability?Math.max(0,availability.getLastRow()-1):0;
 counts.journalEvents=journal?Math.max(0,journal.getLastRow()-1):0;
 counts.receipts=receipts?Math.max(0,receipts.getLastRow()-1):0;
 counts.queueRows=queue?Math.max(0,queue.getLastRow()-1):0;
 if(queue&&queue.getLastColumn()<13)issues.push('QUEUE_SCHEMA_INCOMPLETE');
 if(typeof Swap20_tryQueueCombinedEcasLocked_!=='function')issues.push('SWAP_DISPATCH_UNAVAILABLE');
 if(typeof ECAS20_findConfirmedReceipt_!=='function')issues.push('ECAS_RECEIPT_LOOKUP_UNAVAILABLE');
 if(typeof RUN_RECONCILE_ECAS20_RESEND_DELIVERY_DEV_20261022!=='function')issues.push('RESEND_DELIVERY_RECONCILER_UNAVAILABLE');
 if(typeof Swap20ManagerCommit!=='function')issues.push('SWAP_COMMIT_UNAVAILABLE');
 var result={ok:issues.length===0,readOnly:true,environment:'DEV',
  commitEnabled:String(props.getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true',
  ecasChangeEnabled:String(props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')||'').toUpperCase()==='YES',
  counts:counts,issues:issues,requiredNextStep:'DEV transaction and delivered ECAS acceptance with isolated test audits'};
 Logger.log(JSON.stringify(result));return result;
}


// Read-only acceptance of a confirmed DEV swap before enabling final writes.
// No feature flag, journal, planning, reservation or notification is changed.
function RUN_DIAG_SWAP20_CONFIRMED_COMMIT_DEV_20261023(){
 var props=PropertiesService.getScriptProperties(),expected='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(String(props.getProperty('AMS_ENV')||'')!=='DEV'||String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==expected)throw Error('DEV_ENV_REQUIRED');
 var ss=SpreadsheetApp.openById(expected),keys=Object.keys(props.getProperties()).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;});
 var result={ok:true,readOnly:true,commitEnabled:props.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true',ecasEnabled:props.getProperty('ECAS20_CHANGE_CANCEL_ENABLED')==='YES',proposals:[],issues:[]};
 keys.forEach(function(key){
  var p;try{p=JSON.parse(props.getProperty(key));}catch(e){result.issues.push('UNREADABLE_PROPOSAL');return;}
  if(!p||p.status!=='CONFIRMED')return;
  var item={status:p.status,auditA:p.auditA,auditB:p.auditB,checks:[],ready:false};
  function check(label,fn){try{var v=fn();item.checks.push({name:label,ok:v===true});if(v!==true)result.ok=false;}catch(e){item.checks.push({name:label,ok:false,reason:String(e.message||e).slice(0,150)});result.ok=false;}}
  check('AUDITOR_CONFIRMATIONS',function(){return p.requiredAuditorUids.length>0&&p.requiredAuditorUids.every(function(uid){return p.acknowledgedAuditorUids.indexOf(uid)>=0;});});
  check('NO_EXISTING_TRANSACTION',function(){return Swap20Journal_history_(p.operationId).length===0;});
  check('CANONICAL_REVISIONS_AND_DURATIONS',function(){return Swap20CanonicalCommitGuard({auditA:p.auditA,auditB:p.auditB,expectedRevisions:p.originalRevisions,blocksA:p.blocksA,blocksB:p.blocksB}).ok===true;});
  var before=null,availability=null,plan=null,owners={};
  check('READ_CANONICAL_BEFORE_IMAGES',function(){before=Swap20_captureCanonicalBeforeImages_(p);return before&&before.rows.length===2;});
  check('READ_AVAILABILITY_BEFORE_IMAGES',function(){availability=Swap20_captureAvailabilityBeforeImages_();return !!availability;});
  if(before&&availability){
   check('AUDITOR_OWNER_RESOLUTION',function(){
    before.rows.forEach(function(image){var d=PlanningWorkspacePlannedAuditReadService_get({auditId:image.auditId});if(!d||!d.auditorEmail)throw Error('AUDITOR_EMAIL_MISSING');owners[image.auditId]=String(d.auditorEmail).toLowerCase();});return Object.keys(owners).length===2;
   });
   if(Object.keys(owners).length===2)check('AVAILABILITY_NO_CONFLICT',function(){plan=Swap20_availabilityPlan_(availability,p,owners);return !!plan;});
   check('ROLLBACK_JOURNAL_CAPACITY',function(){return Swap20Journal_encodePayload_({canonical:before,availability:availability}).length<=40000;});
  }
  item.ready=item.checks.length>=7&&item.checks.every(function(c){return c.ok;});result.proposals.push(item);
 });
 if(!result.proposals.length){result.ok=false;result.issues.push('NO_CONFIRMED_PROPOSALS');}
 if(result.proposals.some(function(p){return !p.ready;}))result.ok=false;
 Logger.log(JSON.stringify(result));return result;
}

// DEV-only configuration verification. Does not modify audits or notifications.
function RUN_CHECK_SWAP20_COMMIT_PROPERTY_DEV_20261023(){
 var props=PropertiesService.getScriptProperties();
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('DEV_ONLY');
 var key='AMS_SWAP20_COMMIT_ENABLED';
 var out={environment:'DEV',propertyPresent:Object.prototype.hasOwnProperty.call(props.getProperties(),key),currentValue:props.getProperty(key),commitEnabled:props.getProperty(key)==='true'};
 Logger.log(JSON.stringify(out));return out;
}

function RUN_SET_SWAP20_DEV_FLAG_20261023(){
 var properties=PropertiesService.getScriptProperties();
 if(properties.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_ONLY');
 if(properties.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('WRONG_SSOT');
 var result=RUN_DIAG_SWAP20_CONFIRMED_COMMIT_DEV_20261023();
 if(!result.ok||!result.proposals.some(function(p){return p.ready;}))throw Error('PREFLIGHT_FAILED');
 properties.setProperty('AMS_SWAP20_COMMIT_ENABLED','true');
 var check={ok:properties.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true',commitEnabled:properties.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true'};
 Logger.log(JSON.stringify(check));return check;
}

// Read-only comparison of stored proposal revisions with live audit revisions.
function RUN_DIAG_SWAP20_STALE_REVISIONS_DEV_20261023(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_ONLY');
 var result=[];
 Object.keys(props.getProperties()).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).forEach(function(key){
  var p=JSON.parse(props.getProperty(key));
  if(!p||p.status!=='CONFIRMED')return;
  var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
  result.push({operationId:p.operationId,eligible:pair.eligible,auditA:{id:p.auditA,changed:String(pair.auditA.revision)!==String(p.originalRevisions[p.auditA])},auditB:{id:p.auditB,changed:String(pair.auditB.revision)!==String(p.originalRevisions[p.auditB])}});
 });
 Logger.log(JSON.stringify({readOnly:true,proposals:result}));return result;
}

function RUN_SET_SWAP20_COMMIT_FLAG_DEV_20261023(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_REQUIRED');
 if(p.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_SHEET_REQUIRED');
 var check=RUN_DIAG_SWAP20_CONFIRMED_COMMIT_DEV_20261023();
 if(!check.ok)throw Error('PREFLIGHT_FAILED');
 p.setProperty('AMS_SWAP20_COMMIT_ENABLED','true');
 var result={ok:p.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true'};
 Logger.log(JSON.stringify(result));return result;
}


// Read-only DEV triage for stale confirmed SWAP. Never updates the proposal or audit rows.
function RUN_DIAG_SWAP20_STALE_DETAIL_DEV_20261023(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('AMS_ENV')!=='DEV'||props.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var result=[];
 Object.keys(props.getProperties()).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).forEach(function(k){
  var p=JSON.parse(props.getProperty(k));if(!p||p.status!=='CONFIRMED')return;
  var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
  var history=Swap20Journal_history_(p.operationId);
  result.push({operationId:p.operationId,status:p.status,journalStage:history.length?history[history.length-1].stage:'NOT_STARTED',
   auditA:{changed:String(pair.auditA.revision)!==String(p.originalRevisions[p.auditA]),currentBlocks:pair.auditA.blocks||null,proposedBlocks:p.blocksA},
   auditB:{changed:String(pair.auditB.revision)!==String(p.originalRevisions[p.auditB]),currentBlocks:pair.auditB.blocks||null,proposedBlocks:p.blocksB}});
 });
 Logger.log(JSON.stringify({ok:true,readOnly:true,proposals:result}));return result;
}

// Read-only DEV diagnostics for stale proposal revision tokens.
function RUN_DIAG_SWAP20_REVISION_TOKENS_DEV_20261024(){
 var p=PropertiesService.getScriptProperties();
 if(p.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_ONLY');
 var out=[];
 Object.keys(p.getProperties()).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).forEach(function(k){
  var proposal=JSON.parse(p.getProperty(k));if(proposal.status!=='CONFIRMED')return;
  var pair=Swap20_readCanonicalPair({auditA:proposal.auditA,auditB:proposal.auditB});
  out.push({operationId:proposal.operationId,auditA:{expected:proposal.originalRevisions[proposal.auditA],current:pair.auditA.revision},auditB:{expected:proposal.originalRevisions[proposal.auditB],current:pair.auditB.revision}});
 });
 Logger.log(JSON.stringify({readOnly:true,proposals:out}));return out;
}

function RUN_DIAG_SWAP20_CANONICAL_FIELDS_DEV_20261024(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_ONLY');
 var output=[];
 Object.keys(props.getProperties()).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).forEach(function(k){
 var p=JSON.parse(props.getProperty(k));if(p.status!=='CONFIRMED')return;
 var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
 var audits=[p.auditA,p.auditB].map(function(id){
 var row=PRT_readCanonicalRow_(id);var fields={};
 row.headers.forEach(function(h,i){var n=String(h).toLowerCase().replace(/[^a-z0-9]/g,'');if(['status','assignedto','dateplanned','planningjson','dateapproved','statussince'].indexOf(n)>=0){var v=row.row[i];fields[String(h)]=Object.prototype.toString.call(v)==='[object Date]'?v.toISOString():String(v==null?'':v).slice(0,1200);}});
 var actual=id===p.auditA?pair.auditA:pair.auditB;
 return {id:id,expected:p.originalRevisions[id],current:actual.revision,fields:fields,blocks:actual.blocks};
 });
 output.push({operationId:p.operationId,audits:audits});
 });
 Logger.log(JSON.stringify({readOnly:true,proposals:output}));return output;
}

 
// DEV-only guarded revision refresh; preserves manager's final Confirm/Withdraw decision.
function RUN_REPAIR_SWAP20_CONFIRMED_REVISION_DEV_20261024(){
 var props=PropertiesService.getScriptProperties();
 if(props.getProperty('AMS_ENV')!=='DEV'||props.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 if(props.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true')throw Error('COMMIT_GATE_MUST_BE_OFF');
 var id='SWAP20_75c82baa8f8248dc93690667df7a6c07';
 var lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw Error('LOCK_BUSY');
 try{
  var key=Swap20Store_key_(id),raw=props.getProperty(key);
  if(!raw)throw Error('PROPOSAL_MISSING');
  var p=JSON.parse(raw);
  if(p.status!=='CONFIRMED')throw Error('NOT_CONFIRMED');
  if(Swap20Journal_history_(id).length)throw Error('TRANSACTION_ALREADY_STARTED');
  var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
  if(!pair.eligible)throw Error('PAIR_NOT_ELIGIBLE');
  if(String(pair.auditB.revision)!==String(p.originalRevisions[p.auditB]))throw Error('AUDIT_B_CHANGED');
  function slot(b){return JSON.stringify((b||[]).map(function(x){return [x.date,x.start,x.end];}));}
  if(slot(pair.auditA.blocks)!==JSON.stringify([['2026-11-18','09:00','14:00']]))throw Error('AUDIT_A_SCHEDULE_CHANGED');
  if(slot(pair.auditB.blocks)!==JSON.stringify([['2026-10-26','09:00','15:00']]))throw Error('AUDIT_B_SCHEDULE_CHANGED');
  if(String(pair.auditA.assignedTo||'').toLowerCase()!=='info@agridesk.com'||String(pair.auditB.assignedTo||'').toLowerCase()!=='info@agridesk.com')throw Error('AUDITOR_CHANGED');
  var row=PRT_readCanonicalRow_(p.auditA);
  var index=row.headers.map(function(h){return String(h).toLowerCase().replace(/[^a-z0-9]/g,'');});
  function val(n){var i=index.indexOf(n);if(i<0)throw Error('MISSING_'+n);return row.row[i];}
  if(String(val('status')).toLowerCase()!=='accepted')throw Error('STATUS_CHANGED');
  var plan=JSON.parse(String(val('planningjson')));
  if(slot(plan.blocks)!==slot(pair.auditA.blocks)||Number(plan.formalHours)!==5||String(plan.auditorEmail||'').toLowerCase()!=='info@agridesk.com')throw Error('CANONICAL_DETAILS_CHANGED');
  var next=JSON.parse(raw);next.originalRevisions[p.auditA]=pair.auditA.revision;
  Swap20CanonicalCommitGuard({auditA:next.auditA,auditB:next.auditB,expectedRevisions:next.originalRevisions,blocksA:next.blocksA,blocksB:next.blocksB});
  if(Swap20_captureCanonicalBeforeImages_(next).rows.length!==2)throw Error('SNAPSHOT_FAILED');
  if(props.getProperty(key)!==raw)throw Error('PROPOSAL_CONCURRENT_CHANGE');
  props.setProperty(key,JSON.stringify(next));
  var result={ok:true,operationId:id,status:next.status,revisionRefreshed:true,canonicalChanged:false,managerDecisionPending:true};
  Logger.log(JSON.stringify(result));return result;
 }finally{lock.releaseLock();}
}

function RUN_DIAG_SWAP20_LIVE_PAIR_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_75c82baa8f8248dc93690667df7a6c07',p=Swap20Store_read_(id);
 if(!p)throw Error('NOT_FOUND');
 var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
 var out={operationId:id,status:p.status,journalEntries:Swap20Journal_history_(id).length,eligible:pair.eligible,audits:[]};
 [p.auditA,p.auditB].forEach(function(a,i){
  var item=i?pair.auditB:pair.auditA,row=PRT_readCanonicalRow_(a);
  var fresh=PRT_result_(a,row.headers,row.row,'swap snapshot',row.rowNumber);
  out.audits.push({auditId:a,storedRevision:p.originalRevisions[a],pairRevision:item.revision,freshRevision:fresh.revision,blocks:item.blocks,keys:Object.keys(item),status:item.status,assignedTo:item.assignedTo});
 });
 Logger.log(JSON.stringify(out));return out;
}

function RUN_REFRESH_SWAP20_A_REVISION_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs'||sp.getProperty('AMS_SWAP20_COMMIT_ENABLED')==='true')throw Error('DEV_GATE_REQUIRED');
 var id='SWAP20_75c82baa8f8248dc93690667df7a6c07',lock=LockService.getScriptLock();
 if(!lock.tryLock(20000))throw Error('LOCK_BUSY');
 try{
  var key=Swap20Store_key_(id),raw=sp.getProperty(key),p=JSON.parse(raw);
  if(p.status!=='CONFIRMED'||Swap20Journal_history_(id).length)throw Error('NOT_READY');
  var pair=Swap20_readCanonicalPair({auditA:p.auditA,auditB:p.auditB});
  if(!pair.eligible||pair.auditA.status!=='Accepted'||pair.auditB.status!=='Accepted')throw Error('NOT_ELIGIBLE');
  if(pair.auditB.revision!==p.originalRevisions[p.auditB])throw Error('B_REVISION_CHANGED');
  function match(x,d,s,e,h){return x.length===1&&x[0].date===d&&x[0].start===s&&x[0].end===e&&Number(x[0].hours)===h&&x[0].executionType==='ONSITE'&&x[0].execLoc==='HQ';}
  if(!match(pair.auditA.blocks,'2026-11-18','09:00','14:00',5)||!match(pair.auditB.blocks,'2026-10-26','09:00','15:00',6))throw Error('ORIGINAL_SCHEDULE_CHANGED');
  if(pair.auditA.assignedTo!=='info@agridesk.com'||pair.auditB.assignedTo!=='info@agridesk.com')throw Error('AUDITOR_CHANGED');
  var row=PRT_readCanonicalRow_(p.auditA),fresh=PRT_result_(p.auditA,row.headers,row.row,'swap snapshot',row.rowNumber);
  if(fresh.revision!==pair.auditA.revision)throw Error('REVISION_READ_CONFLICT');
  p.originalRevisions[p.auditA]=fresh.revision;
  Swap20CanonicalCommitGuard({auditA:p.auditA,auditB:p.auditB,expectedRevisions:p.originalRevisions,blocksA:p.blocksA,blocksB:p.blocksB});
  Swap20_captureCanonicalBeforeImages_(p);
  if(sp.getProperty(key)!==raw)throw Error('CONCURRENT_UPDATE');
  sp.setProperty(key,JSON.stringify(p));
  var out={ok:true,status:p.status,updatedAudit:'A',canonicalWrites:0,managerDecisionPending:true};Logger.log(JSON.stringify(out));return out;
 }finally{lock.releaseLock();}
}

function RUN_DIAG_SWAP20_COMMIT_FAILURE_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_75c82baa8f8248dc93690667df7a6c07',p=Swap20Store_read_(id);
 var history=Swap20Journal_history_(id),out={operationId:id,status:p&&p.status,commitFlag:sp.getProperty('AMS_SWAP20_COMMIT_ENABLED'),journalStages:history.map(function(x){return x.stage;})};
 try{var g=Swap20CanonicalCommitGuard({auditA:p.auditA,auditB:p.auditB,expectedRevisions:p.originalRevisions,blocksA:p.blocksA,blocksB:p.blocksB});out.guard={ok:g.ok};}catch(e){out.guard={ok:false,error:String(e.message||e)};}
 try{var c=Swap20_captureCanonicalBeforeImages_(p);out.canonical={ok:!!c,rows:c.rows.length};}catch(e){out.canonical={ok:false,error:String(e.message||e)};}
 try{var a=Swap20_captureAvailabilityBeforeImages_();out.availability={ok:!!a};}catch(e){out.availability={ok:false,error:String(e.message||e)};}
 Logger.log(JSON.stringify(out));return out;
}

function RUN_DIAG_SWAP20_LATEST_MANAGER_FAILURE_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var all=sp.getProperties(),list=Object.keys(all).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).map(function(k){return JSON.parse(all[k]);});
 list.sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
 var out={commitEnabled:sp.getProperty('AMS_SWAP20_COMMIT_ENABLED'),latest:[]};
 list.slice(0,8).forEach(function(p){
  var x={id:p.operationId,status:p.status,createdAt:p.createdAt,auditA:p.auditA,auditB:p.auditB,ack:(p.acknowledgedAuditorUids||[]).length,required:(p.requiredAuditorUids||[]).length};
  try{x.journal=Swap20Journal_history_(p.operationId).map(function(e){return {stage:e.stage,recordedAt:e.recordedAt,reason:e.payload&&e.payload.reason||null};});}catch(e){x.journalError=String(e.message||e);}
  out.latest.push(x);
 });
 Logger.log(JSON.stringify(out));return out;
}

function RUN_DIAG_SWAP20_PREPARED_CAUSE_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_aded19c574a940b398b8c1ded84ff9e9',p=Swap20Store_read_(id),h=Swap20Journal_history_(id);
 if(!p||h.length!==1||h[0].stage!=='PREPARED')throw Error('NOT_PREPARED');
 var before=h[0].payload&&h[0].payload.canonical;
 var out={id:id,status:p.status,journalStage:'PREPARED',snapshotRows:before&&before.rows&&before.rows.length};
 try{out.canonicalVerified=Swap20_verifyCanonicalBeforeImages_(before);}catch(e){out.canonicalError=String(e.message||e);}
 try{out.proposalUnchanged=JSON.stringify(Swap20Store_read_(id))===JSON.stringify(p);}catch(e){out.proposalError=String(e.message||e);}
 try{var a=Swap20_captureAvailabilityBeforeImages_();out.availabilityHeight=a.height;}catch(e){out.availabilityError=String(e.message||e);}
 Logger.log(JSON.stringify(out));return out;
}

function RUN_VERIFY_SWAP20_LAST_COMMIT_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_aded19c574a940b398b8c1ded84ff9e9',p=Swap20Store_read_(id),h=Swap20Journal_history_(id);
 if(!p)throw Error('PROPOSAL_MISSING');
 var out={operationId:id,status:p.status,canonicalCommitVerified:p.canonicalCommitVerified===true,stages:h.map(function(x){return x.stage;}),audits:[]};
 [p.auditA,p.auditB].forEach(function(a,i){
  var row=PRT_readCanonicalRow_(a),n=row.headers.map(function(x){return String(x).toLowerCase().replace(/[^a-z0-9]/g,'');}),ix=n.indexOf('planningjson');
  if(ix<0)throw Error('PLANNING_JSON_MISSING');
  var actual=JSON.parse(String(row.row[ix]||'{}')).blocks||[],expected=i===0?p.blocksA:p.blocksB;
  out.audits.push({auditId:a,expected:expected.map(function(b){return [b.date,b.start,b.end];}),actual:actual.map(function(b){return [b.date,b.start,b.end];}),matches:JSON.stringify(actual.map(function(b){return [b.date,b.start,b.end];}))===JSON.stringify(expected.map(function(b){return [b.date,b.start,b.end];}))});
 });
 out.applied=h.length>0&&h[h.length-1].stage==='COMMITTED'&&p.status==='APPLIED'&&out.audits.every(function(x){return x.matches;});
 Logger.log(JSON.stringify(out));return out;
}

function RUN_DIAG_SWAP20_PREPARED_RESUME_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_aded19c574a940b398b8c1ded84ff9e9',p=Swap20Store_read_(id),h=Swap20Journal_history_(id);
 if(h.length!==1||h[0].stage!=='PREPARED')throw Error('NOT_PREPARED');
 var c=Swap20_captureCanonicalBeforeImages_(p),a=Swap20_captureAvailabilityBeforeImages_(),saved=h[0].payload;
 var x=Swap20Journal_markDates_(saved),y=Swap20Journal_markDates_({canonical:c,availability:a});
 var out={stage:'PREPARED',canonicalEqual:JSON.stringify(x.canonical)===JSON.stringify(y.canonical),availabilityEqual:JSON.stringify(x.availability)===JSON.stringify(y.availability),savedAvailabilityRows:x.availability.values.length,currentAvailabilityRows:y.availability.values.length,firstChangedRow:-1};
 if(!out.availabilityEqual){for(var i=0;i<Math.min(x.availability.values.length,y.availability.values.length);i++){if(JSON.stringify(x.availability.values[i])!==JSON.stringify(y.availability.values[i])){out.firstChangedRow=i+1;break;}}}
 Logger.log(JSON.stringify(out));return out;
}

function RUN_DIAG_SWAP20_RESUME_STAGES_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV'||sp.getProperty('V5_SSOT_SPREADSHEET_ID')!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')throw Error('DEV_ONLY');
 var id='SWAP20_aded19c574a940b398b8c1ded84ff9e9',p=Swap20Store_read_(id),h=Swap20Journal_history_(id);
 if(h.length!==1||h[0].stage!=='PREPARED'||p.status!=='CONFIRMED')throw Error('NOT_READY');
 var out={id:id,stages:[],ok:true};
 function check(name,fn){try{var v=fn();out.stages.push({name:name,ok:true,value:v===true?true:undefined});}catch(e){out.ok=false;out.stages.push({name:name,ok:false,error:String(e.message||e)});}}
 var c,a,owners={},plan;
 check('guard',function(){return Swap20CanonicalCommitGuard({auditA:p.auditA,auditB:p.auditB,expectedRevisions:p.originalRevisions,blocksA:p.blocksA,blocksB:p.blocksB}).ok;});
 check('canonical',function(){c=Swap20_captureCanonicalBeforeImages_(p);return c.rows.length===2;});
 check('availability',function(){a=Swap20_captureAvailabilityBeforeImages_();return a.height>0;});
 if(c)check('owners',function(){c.rows.forEach(function(image){var index=c.headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('assignedto');var detail=PlanningWorkspacePlannedAuditReadService_get({auditId:image.auditId});if(!detail||!detail.auditorEmail||String(detail.assignedTo||'').trim()!==String(image.values[index]||'').trim())throw Error('Auditor identity mismatch');owners[image.auditId]=String(detail.auditorEmail).trim().toLowerCase();});return true;});
 if(a&&Object.keys(owners).length===2)check('plan',function(){plan=Swap20_availabilityPlan_(a,p,owners);return plan.values.length;});
 if(c&&a)check('snapshotMatch',function(){return JSON.stringify(Swap20Journal_markDates_(h[0].payload))===JSON.stringify(Swap20Journal_markDates_({canonical:c,availability:a}));});
 if(c)check('canonicalVerify',function(){return Swap20_verifyCanonicalBeforeImages_(c);});
 Logger.log(JSON.stringify(out));return out;
}

function RUN_READ_SWAP20_MANAGER_COMMIT_ERROR_DEV_20261024(){
 var sp=PropertiesService.getScriptProperties();
 if(sp.getProperty('AMS_ENV')!=='DEV')throw Error('DEV_ONLY');
 var id='SWAP20_aded19c574a940b398b8c1ded84ff9e9';
 var p=Swap20Store_read_(id),h=Swap20Journal_history_(id);
 var raw=sp.getProperty('AMS_SWAP20_LAST_COMMIT_ERROR_'+id);
 var entry=sp.getProperty('AMS_SWAP20_LAST_COMMIT_ENTRY_'+id);var out={operationId:id,status:p&&p.status,journalStages:h.map(function(x){return x.stage;}),lastError:raw?JSON.parse(raw):null,entryTrace:entry?JSON.parse(entry):null};
 Logger.log(JSON.stringify(out));return out;
}
