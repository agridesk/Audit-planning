// Cloud Run authenticated manager bridge for SWAP 2.0.
// DEV only. The shared bridge key is verified by EntryV5 before this service.
// Preview and proposal creation do not alter canonical audit planning.
function Swap20Bridge20_manager_(email) {
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
 if(matches.length!==1||String(matches[0][role]||'').trim().toLowerCase()!=='manager'||
    !['YES','TRUE','1','ACTIVE'].includes(String(matches[0][active]||'').trim().toUpperCase()))
  throw Error('SWAP_MANAGER_IDENTITY_NOT_AUTHORIZED');
 return {ok:true,email:email,role:'Manager'};
}
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
function Swap20Bridge20_handle_(body) {
 body=body||{};
 var manager=Swap20Bridge20_manager_(body.actorEmail);
 var operation=String(body.operation||'').trim();
 if(operation==='getProposal') {
  var id=String(body.operationId||'').trim(),p=Swap20Store_read_(id);
  if(!p)return {ok:false,error:'SWAP_PROPOSAL_NOT_FOUND'};
  return {ok:true,readOnly:true,operationId:id,status:p.status,
   auditA:p.auditA,auditB:p.auditB,dateChanged:p.dateChanged,
   acknowledgedCount:(p.acknowledgedAuditorUids||[]).length,
   requiredCount:(p.requiredAuditorUids||[]).length};
 }
 if(operation==='withdraw') {
  return Swap20ManagerWithdrawProposalAuthorized_({operationId:body.operationId},manager);
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
 return {ok:out.success===true,operationId:out.operationId,status:out.status,
  requiresAcknowledgement:preview.requiresAcknowledgement===true,canonicalChanged:false};
}
