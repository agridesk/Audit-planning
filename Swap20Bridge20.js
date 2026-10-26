// Cloud Run authenticated manager bridge for SWAP 2.0.
// DEV only. The shared bridge key is verified by EntryV5 before this service.
// Preview and proposal creation do not alter canonical audit planning.
function Swap20Bridge20_actor_(email,expectedRole) {
 var authPerfStarted=Date.now();
 function authPhase(phase){if(expectedRole==='manager'&&typeof console!=='undefined'&&console&&typeof console.info==='function')console.info('[SWAP20_AUTH_PHASE_PERF] '+JSON.stringify({phase:phase,ms:Date.now()-authPerfStarted}));}
 var props=PropertiesService.getScriptProperties();
 var id='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
    String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==id)
  throw Error('SWAP_DEV_ENV_OR_SSOT_MISMATCH');
 email=String(email||'').trim().toLowerCase();
 if(!email||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('SWAP_ACTOR_EMAIL_INVALID');
 var sh=SpreadsheetApp.openById(id).getSheetByName('Auditors');
 authPhase('auditorSheetOpened');
 if(!sh)throw Error('SWAP_AUDITOR_ROSTER_MISSING');
 var data=sh.getDataRange().getValues();
 authPhase('auditorRosterRead');
 if(data.length<2)throw Error('SWAP_MANAGER_ROSTER_EMPTY');
 var head=data[0].map(function(h){return String(h||'').toLowerCase().replace(/[ _-]/g,'');});
 function ix(names){for(var n=0;n<names.length;n++){var c=head.indexOf(names[n]);if(c>=0)return c;}return -1;}
 var e=ix(['email','emailaddress']),role=ix(['role','function']),active=ix(['active']);
 if(e<0||role<0||active<0)throw Error('SWAP_MANAGER_ROSTER_SCHEMA');
 var matches=data.slice(1).filter(function(row){return String(row[e]||'').trim().toLowerCase()===email;});
 if(matches.length!==1||String(matches[0][role]||'').trim().toLowerCase()!==expectedRole||
    !['YES','TRUE','1','ACTIVE'].includes(String(matches[0][active]||'').trim().toUpperCase()))
  throw Error('SWAP_MANAGER_IDENTITY_NOT_AUTHORIZED');
 authPhase('auditorIdentityVerified');
 return {ok:true,email:email,role:expectedRole==='manager'?'Manager':'Auditor'};
}
function Swap20Bridge20_manager_(email){return Swap20Bridge20_actor_(email,'manager');}
function Swap20Bridge20_auditor_(email){return Swap20Bridge20_actor_(email,'auditor');}
function Swap20Bridge20_auditId_(value) {
 var id=String(value||'').trim();
 if(!id||id.length>140||/[\u0000-\u001f<>]/.test(id))throw Error('SWAP_AUDIT_ID_INVALID');
 return id;
}
function Swap20Bridge20_preview_(a,b) {
 var perfStart=Date.now();
 var pair=Swap20_readCanonicalPair({auditA:a,auditB:b});
 if(typeof console!=='undefined')console.info('[SWAP20_PREVIEW_PHASE_PERF] '+JSON.stringify({phase:'canonicalPair',ms:Date.now()-perfStart}));
 if(!pair||pair.eligible!==true)
  return {ok:true,readOnly:true,eligible:false,reason:'PAIR_NOT_ELIGIBLE'};
 var proposed;
 try{proposed=Swap20_scheduleExchange_(pair);if(typeof console!=='undefined')console.info('[SWAP20_PREVIEW_PHASE_PERF] '+JSON.stringify({phase:'scheduleExchange',ms:Date.now()-perfStart}));}
 catch(err){return {ok:true,readOnly:true,eligible:false,reason:String(err&&err.message||err).slice(0,180)};}
 Swap20CanonicalCommitGuard({canonicalPair:pair,auditA:a,auditB:b,expectedRevisions:(function(){
  var v={};v[a]=pair.auditA.revision;v[b]=pair.auditB.revision;return v;
 })(),blocksA:proposed.blocksA,blocksB:proposed.blocksB});
 if(typeof console!=='undefined')console.info('[SWAP20_PREVIEW_PHASE_PERF] '+JSON.stringify({phase:'commitGuard',ms:Date.now()-perfStart}));
 function display(item){return {auditId:String(item.auditId||''),assignedTo:String(item.assignedTo||''),
  blocks:item.blocks,revision:item.revision};}
 if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_PERF] '+JSON.stringify({step:'managerPreview',ms:Date.now()-perfStart}));
 return {ok:true,readOnly:true,eligible:true,
  beforeA:display(pair.auditA),beforeB:display(pair.auditB),
  afterA:proposed.blocksA,afterB:proposed.blocksB,
  dateChanged:proposed.dateChanged,requiresAcknowledgement:proposed.requiresAcknowledgement,
  commitEnabled:String(PropertiesService.getScriptProperties().getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true'};
}
function Swap20Bridge20_mirrorEvent_(result,id){
 if(!result||result.ok!==true)return result;
 var p=Swap20Store_read_(id);
 if(!p)return result;
 result._mirrorEvent={
  operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,
  status:p.status,createdAt:p.createdAt||'',createdBy:p.createdBy||'',
  blocksA:p.blocksA||[],blocksB:p.blocksB||[],
  requiredAuditorUids:p.requiredAuditorUids||[],
  acknowledgedAuditorUids:p.acknowledgedAuditorUids||[],
  internalReason:p.internalReason||'',ecasComment:p.ecasComment||'',
  dateChanged:p.dateChanged===true
 };
 return result;
}
function Swap20Bridge20_handle_(body) {
 body=body||{};
 var operation=String(body.operation||'').trim();
 var manager;
 var bridgeAuthStarted=Date.now();
 try{manager=Swap20Bridge20_manager_(body.actorEmail);}
 catch(e){
  if(operation==='commit'){
   var msg=String(e&&e.message||e).slice(0,500);
   if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_MANAGER_AUTH_ERROR] '+msg);
   try{PropertiesService.getScriptProperties().setProperty('AMS_SWAP20_LAST_COMMIT_ERROR_'+String(body.operationId||''),JSON.stringify({at:new Date().toISOString(),phase:'managerIdentity',error:msg}))}catch(diagnosticError){/* Diagnostics must never mask the original failure. */}
  }
  throw e;
 }
 if(operation==='preview')console.info('[SWAP20_PREVIEW_PHASE_PERF] '+JSON.stringify({phase:'managerAuthorized',ms:Date.now()-bridgeAuthStarted}));
 if(operation==='commit')console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:String(body.operationId||''),phase:'bridgeActorAuthorized',authMs:Date.now()-bridgeAuthStarted}));
 if(operation==='listIndexSeed'){
  var properties=PropertiesService.getScriptProperties().getProperties();
  var ids=Object.keys(properties).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).sort();
  if(ids.length>300)throw Error('SWAP_INDEX_SEED_LIMIT');
  var records=ids.map(function(k){return JSON.parse(properties[k]);});
  if(records.some(function(p){return !p||!p.operationId||!p.status||!p.auditA||!p.auditB||!Array.isArray(p.requiredAuditorUids)||!Array.isArray(p.acknowledgedAuditorUids);}))
   throw Error('SWAP_INDEX_SEED_CORRUPT');
  return {ok:true,readOnly:true,records:records};
 }
 if(operation==='listPending'){
  var raw=PropertiesService.getScriptProperties().getProperties(),keys=Object.keys(raw).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).sort();
  if(keys.length>300)throw Error('SWAP_MANAGER_INBOX_SIZE_REQUIRES_REVIEW');
  var items=[];
  keys.forEach(function(k){
   var p;try{p=JSON.parse(raw[k]);}catch(e){return;}
   if(!p||!p.operationId||['AWAITING_ACKNOWLEDGEMENT','ESCALATED','CONFIRMED','DECLINED'].indexOf(p.status)<0)return;
   var needed=Array.isArray(p.requiredAuditorUids)?p.requiredAuditorUids:[];
   var ack=Array.isArray(p.acknowledgedAuditorUids)?p.acknowledgedAuditorUids:[];
   items.push({operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,status:p.status,
    createdAt:p.createdAt||'',createdBy:p.createdBy||'',blocksA:p.blocksA||[],blocksB:p.blocksB||[],
    acknowledgedCount:ack.length,requiredCount:needed.length,acknowledgedAuditorUids:ack,
    requiredAuditorUids:needed,internalReason:p.internalReason||'',ecasComment:p.ecasComment||'',
    commitEnabled:String(PropertiesService.getScriptProperties().getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true'});
  });
  items.sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});
  return {ok:true,readOnly:true,items:items.slice(0,100),
    attentionCount:items.length};
 }
 if(operation==='getProposal') {
  var id=String(body.operationId||'').trim(),p=Swap20Store_read_(id);
  if(!p)return {ok:false,error:'SWAP_PROPOSAL_NOT_FOUND'};
  var journal=Swap20_recoveryStatus_(id);
  return {ok:true,readOnly:true,operationId:id,status:p.status,
   journalStage:journal.stage,journalSequence:journal.sequence,journalRequiresManualReview:journal.requiresManualReview,
   auditA:p.auditA,auditB:p.auditB,dateChanged:p.dateChanged,
   acknowledgedCount:(p.acknowledgedAuditorUids||[]).length,
   requiredCount:(p.requiredAuditorUids||[]).length,
   commitEnabled:p.status==='CONFIRMED'&&!journal.requiresManualReview&&journal.stage==='NOT_STARTED'&&String(PropertiesService.getScriptProperties().getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true'};
 }
 if(operation==='withdraw') {
  var withdrawn=Swap20ManagerWithdrawProposalAuthorized_({operationId:body.operationId},manager);
  return Swap20Bridge20_mirrorEvent_({ok:withdrawn.success===true,operationId:withdrawn.operationId,status:withdrawn.status},withdrawn.operationId);
 }
 if(operation==='commit') {
  var committed;
  try{
   committed=Swap20ManagerCommitAuthorized_({operationId:body.operationId},manager);
  }catch(err){
   var msg=String(err&&err.message||err).slice(0,600);
   if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_MANAGER_COMMIT_ERROR] '+JSON.stringify({operationId:body.operationId,error:msg,stack:String(err&&err.stack||'').slice(0,1200)}));
   try{PropertiesService.getScriptProperties().setProperty('AMS_SWAP20_LAST_COMMIT_ERROR_'+String(body.operationId),JSON.stringify({at:new Date().toISOString(),error:msg}))}catch(diagnosticError){/* Diagnostics must never mask the original failure. */}
   throw err;
  }
  return Swap20Bridge20_mirrorEvent_({ok:committed.success===true,error:committed.success===true?undefined:String(committed.code||'SWAP_COMMIT_NOT_AVAILABLE'),operationId:committed.operationId,
   status:committed.status||committed.code||'',committed:committed.committed===true,
   notificationPending:committed.notificationPending===true,
   notificationQueued:committed.notificationQueued===true,readOnly:committed.readOnly===true},committed.operationId);
 }
 if(operation!=='preview'&&operation!=='propose')
  return {ok:false,error:'SWAP_OPERATION_NOT_SUPPORTED'};
 var a=Swap20Bridge20_auditId_(body.auditA),b=Swap20Bridge20_auditId_(body.auditB);
 if(a===b)throw Error('SWAP_PAIR_NOT_DISTINCT');
 if(operation==='preview')return Swap20Bridge20_preview_(a,b);
 var internalReason=String(body.internalReason||'').trim(),ecasComment=String(body.ecasComment||'').trim();
 if(!internalReason||!ecasComment||internalReason.length>500||ecasComment.length>1000)
  return {ok:false,error:'SWAP_REASONS_REQUIRED'};
 var op=String(body.operationId||'').trim();
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(op))return {ok:false,error:'SWAP_OPERATION_ID_INVALID'};
 var prior=Swap20Store_read_(op);
 if(prior) {
  if(prior.auditA!==a||prior.auditB!==b||prior.createdBy!==manager.email||
     prior.internalReason!==internalReason||prior.ecasComment!==ecasComment)
   return {ok:false,error:'SWAP_OPERATION_ID_CONFLICT'};
  return Swap20Bridge20_mirrorEvent_({ok:true,idempotent:true,operationId:op,status:prior.status,
   requiresAcknowledgement:prior.dateChanged===true,canonicalChanged:false},op);
 }
 var uids=[Swap20_resolveAuditorUidForAudit_(a),Swap20_resolveAuditorUidForAudit_(b)];
 uids=uids.filter(function(v,i){return uids.indexOf(v)===i;});
 var out=Swap20ManagerCreateProposalAuthorized_({
  operationId:op,auditA:a,auditB:b,requiredAuditorUids:uids,
  internalReason:internalReason,ecasComment:ecasComment
 },manager);
 return Swap20Bridge20_mirrorEvent_({ok:out.success===true,operationId:out.operationId,status:out.status,
  requiresAcknowledgement:out.status==='AWAITING_ACKNOWLEDGEMENT',canonicalChanged:false},out.operationId);
}

// Auditor portal SWAP inbox, restricted to the authenticated canonical UID.
// No manager-only internal reasons are exposed to auditors.
function Swap20Bridge20_handleAuditor_(body) {
 var swapPerfStarted=Date.now();
 body=body||{};
 var actor=Swap20Bridge20_auditor_(body.actorEmail);
 var uid=Swap20_resolveAuditorUidByEmail_(actor.email);
 if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_PERF] '+JSON.stringify({step:'auditorIdentity',ms:Date.now()-swapPerfStarted}));
 var operation=String(body.operation||'').trim();
 if(operation==='listPending') {
  var props=PropertiesService.getScriptProperties().getProperties();
  var keys=Object.keys(props).filter(function(k){return k.indexOf('AMS_SWAP20_PROPOSAL_')===0;}).sort();
  if(keys.length>300)throw Error('SWAP_INBOX_SIZE_REQUIRES_REVIEW');
  var items=[];
  keys.forEach(function(key){
   var p;try{p=JSON.parse(props[key]);}catch(e){return;}
   if(!p||!Array.isArray(p.requiredAuditorUids)||p.requiredAuditorUids.indexOf(uid)<0)return;
   if(['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].indexOf(p.status)<0)return;
   items.push({operationId:String(p.operationId||''),status:p.status,
    auditA:String(p.auditA||''),auditB:String(p.auditB||''),
    afterA:p.blocksA||[],afterB:p.blocksB||[],createdAt:String(p.createdAt||''),
    ecasComment:String(p.ecasComment||''),dateChanged:p.dateChanged===true,
    acknowledged:(p.acknowledgedAuditorUids||[]).indexOf(uid)>=0});
  });
  items.sort(function(a,b){return b.createdAt.localeCompare(a.createdAt);});
  if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_PERF] '+JSON.stringify({step:'auditorList',ms:Date.now()-swapPerfStarted,items:items.length}));
  return {ok:true,readOnly:true,items:items.slice(0,50),
   attentionCount:items.filter(function(p){return !p.acknowledged;}).length};
 }
 if(operation==='respond') {
  var op=String(body.operationId||'').trim(),decision=String(body.decision||'').toUpperCase();
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(op)||['ACKNOWLEDGE','DECLINE'].indexOf(decision)<0)
   return {ok:false,error:'SWAP_AUDITOR_RESPONSE_INVALID'};
  var respondStart=Date.now();
  console.info('[SWAP20_RESPOND_PHASE_PERF] '+JSON.stringify({phase:'bridgeActorAndUid',ms:Date.now()-swapPerfStarted}));
 var result=Swap20AuditorRespondAuthorized_({operationId:op,decision:decision},actor);
 console.info('[SWAP20_RESPOND_PHASE_PERF] '+JSON.stringify({phase:'authorizedMutation',ms:Date.now()-respondStart}));
  if(typeof Logger!=='undefined'&&Logger&&typeof Logger.log==='function')Logger.log('[SWAP20_PERF] '+JSON.stringify({step:'auditorRespond',ms:Date.now()-respondStart,decision:decision}));
  return Swap20Bridge20_mirrorEvent_({ok:result.success===true,status:result.status,operationId:result.operationId,
   idempotent:result.idempotent===true},op);
 }
 return {ok:false,error:'SWAP_AUDITOR_OPERATION_UNSUPPORTED'};
}
