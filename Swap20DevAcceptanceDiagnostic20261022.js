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
