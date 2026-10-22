// Cloud Run authenticated manager bridge for SWAP 2.0.
// DEV only. The shared bridge key is verified by EntryV5 before this service.
// Preview and proposal creation do not alter canonical audit planning.
function Swap20Bridge20_actor_(email,expectedRole) {
 var props=PropertiesService.getScriptProperties();
 var id='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs';
 if(String(props.getProperty('AMS_ENV')||'').toUpperCase()!=='DEV'||
    String(props.getProperty('V5_SSOT_SPREADSHEET_ID')||'')!==id)
  throw Error('SWAP_DEV_ENV_OR_SSOT_MISMATCH');
 email=String(email||'').trim().toLowerCase();
 if(!email||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('SWAP_ACTOR_EMAIL_INVALID');
 var sh=SpreadsheetApp.openById(id).getSheetByName('Auditors');
 if(!sh)throw Error('SWAP_AUDITOR_ROSTER_MISSING');
 var data=sh.getDataRange().getValues();
 if(data.length<2)throw Error('SWAP_MANAGER_ROSTER_EMPTY');
 var head=data[0].map(function(h){return String(h||'').toLowerCase().replace(/[ _-]/g,'');});
 function ix(names){for(var n=0;n<names.length;n++){var c=head.indexOf(names[n]);if(c>=0)return c;}return -1;}
 var e=ix(['email','emailaddress']),role=ix(['role','function']),active=ix(['active']);
 if(e<0||role<0||active<0)throw Error('SWAP_MANAGER_ROSTER_SCHEMA');
 var matches=data.slice(1).filter(function(row){return String(row[e]||'').trim().toLowerCase()===email;});
 if(matches.length!==1||String(matches[0][role]||'').trim().toLowerCase()!==expectedRole||
    !['YES','TRUE','1','ACTIVE'].includes(String(matches[0][active]||'').trim().toUpperCase()))
  throw Error('SWAP_MANAGER_IDENTITY_NOT_AUTHORIZED');
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
 var pair=Swap20_readCanonicalPair({auditA:a,auditB:b});
 if(!pair||pair.eligible!==true)
  return {ok:true,readOnly:true,eligible:false,reason:'PAIR_NOT_ELIGIBLE'};
 var proposed;
 try{proposed=Swap20_scheduleExchange_(pair);}
 catch(err){return {ok:true,readOnly:true,eligible:false,reason:String(err&&err.message||err).slice(0,180)};}
 Swap20CanonicalCommitGuard({auditA:a,auditB:b,expectedRevisions:(function(){
  var v={};v[a]=pair.auditA.revision;v[b]=pair.auditB.revision;return v;
 })(),blocksA:proposed.blocksA,blocksB:proposed.blocksB});
 function display(item){return {auditId:String(item.auditId||''),assignedTo:String(item.assignedTo||''),
  blocks:item.blocks,revision:item.revision};}
 return {ok:true,readOnly:true,eligible:true,
  beforeA:display(pair.auditA),beforeB:display(pair.auditB),
  afterA:proposed.blocksA,afterB:proposed.blocksB,
  dateChanged:proposed.dateChanged,requiresAcknowledgement:proposed.requiresAcknowledgement,
  commitEnabled:String(PropertiesService.getScriptProperties().getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true'};
}
function Swap20Bridge20_mirrorEvent_(result,id){
 if(!result||result.ok!==true)return result;
 var p=Swap20Store_read_(id);
 if(!p)throw Error('SWAP_MIRROR_SOURCE_MISSING');
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
 var manager=Swap20Bridge20_manager_(body.actorEmail);
 var operation=String(body.operation||'').trim();
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
    attentionCount:items.filter(function(p){return p.status==='CONFIRMED'||p.status==='DECLINED';}).length};
 }
 if(operation==='getProposal') {
  var id=String(body.operationId||'').trim(),p=Swap20Store_read_(id);
  if(!p)return {ok:false,error:'SWAP_PROPOSAL_NOT_FOUND'};
  return {ok:true,readOnly:true,operationId:id,status:p.status,
   auditA:p.auditA,auditB:p.auditB,dateChanged:p.dateChanged,
   acknowledgedCount:(p.acknowledgedAuditorUids||[]).length,
   requiredCount:(p.requiredAuditorUids||[]).length,
   commitEnabled:String(PropertiesService.getScriptProperties().getProperty('AMS_SWAP20_COMMIT_ENABLED')||'')==='true'};
 }
 if(operation==='withdraw') {
  var withdrawn=Swap20ManagerWithdrawProposalAuthorized_({operationId:body.operationId},manager);
  return Swap20Bridge20_mirrorEvent_({ok:withdrawn.success===true,operationId:withdrawn.operationId,status:withdrawn.status},withdrawn.operationId);
 }
 if(operation==='commit') {
  var committed=Swap20ManagerCommitAuthorized_({operationId:body.operationId},manager);
  return {ok:committed.success===true,operationId:committed.operationId,
   status:committed.status||committed.code||'',committed:committed.committed===true,
   notificationPending:committed.notificationPending===true,
   notificationQueued:committed.notificationQueued===true,readOnly:committed.readOnly===true};
 }
 if(operation!=='preview'&&operation!=='propose')
  return {ok:false,error:'SWAP_OPERATION_NOT_SUPPORTED'};
 var a=Swap20Bridge20_auditId_(body.auditA),b=Swap20Bridge20_auditId_(body.auditB);
 if(a===b)throw Error('SWAP_PAIR_NOT_DISTINCT');
 var preview=Swap20Bridge20_preview_(a,b);
 if(operation==='preview'||preview.eligible!==true)return preview;
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
  return {ok:true,idempotent:true,operationId:op,status:prior.status,
   requiresAcknowledgement:prior.dateChanged===true,canonicalChanged:false};
 }
 var uids=[Swap20_resolveAuditorUidForAudit_(a),Swap20_resolveAuditorUidForAudit_(b)];
 uids=uids.filter(function(v,i){return uids.indexOf(v)===i;});
 var out=Swap20ManagerCreateProposalAuthorized_({
  operationId:op,auditA:a,auditB:b,requiredAuditorUids:uids,
  internalReason:internalReason,ecasComment:ecasComment
 },manager);
 return Swap20Bridge20_mirrorEvent_({ok:out.success===true,operationId:out.operationId,status:out.status,
  requiresAcknowledgement:preview.requiresAcknowledgement===true,canonicalChanged:false},out.operationId);
}

// Auditor portal SWAP inbox, restricted to the authenticated canonical UID.
// No manager-only internal reasons are exposed to auditors.
function Swap20Bridge20_handleAuditor_(body) {
 body=body||{};
 var actor=Swap20Bridge20_auditor_(body.actorEmail);
 var uid=Swap20_resolveAuditorUidByEmail_(actor.email);
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
  return {ok:true,readOnly:true,items:items.slice(0,50),
   attentionCount:items.filter(function(p){return !p.acknowledged;}).length};
 }
 if(operation==='respond') {
  var op=String(body.operationId||'').trim(),decision=String(body.decision||'').toUpperCase();
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(op)||['ACKNOWLEDGE','DECLINE'].indexOf(decision)<0)
   return {ok:false,error:'SWAP_AUDITOR_RESPONSE_INVALID'};
  var result=Swap20AuditorRespondAuthorized_({operationId:op,decision:decision},actor);
  return {ok:result.success===true,status:result.status,operationId:result.operationId,
   idempotent:result.idempotent===true};
 }
 return {ok:false,error:'SWAP_AUDITOR_OPERATION_UNSUPPORTED'};
}
