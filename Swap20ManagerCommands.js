/**
 * Manager-authorized swap proposal creation. No canonical writes.
 * Required auditor UUIDs are supplied by a trusted identity resolver.
 */
function Swap20ManagerCreateProposal(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Manager authentication required');
 return Swap20ManagerCreateProposalAuthorized_(input,auth);
}
function Swap20ManagerCreateProposalAuthorized_(input,auth){
 Swap20_assertGasWriteAuthority_();
 input=input||{};
 if(!auth||auth.ok!==true||!auth.email||auth.role&&String(auth.role).toLowerCase()!=='manager')throw Error('Manager authentication required');
 var a=String(input.auditA||'').trim(),b=String(input.auditB||'').trim();
 var pair=Swap20_readCanonicalPair({auditA:a,auditB:b});
 if(!pair.eligible)throw Error('Swap pair not eligible');
 var schedule=Swap20_scheduleExchange_(pair);
 Swap20CanonicalCommitGuard({auditA:a,auditB:b,expectedRevisions:(function(){var v={};v[a]=pair.auditA.revision;v[b]=pair.auditB.revision;return v;})(),blocksA:schedule.blocksA,blocksB:schedule.blocksB,canonicalPair:pair});
 var uids=input.requiredAuditorUids;
 if(!Array.isArray(uids)||!uids.length||uids.some(function(x){return !/^[A-Za-z0-9_-]{8,128}$/.test(String(x||''));})||new Set(uids).size!==uids.length)throw Error('Valid auditor UUIDs required');
 if(typeof Swap20_resolveAuditorUidForAudit_!=='function')throw Error('Canonical auditor UID resolver unavailable');
 var canonicalUids=[Swap20_resolveAuditorUidForAudit_(a),Swap20_resolveAuditorUidForAudit_(b)].filter(Boolean);
 canonicalUids=canonicalUids.filter(function(x,i){return canonicalUids.indexOf(x)===i;});
 if(canonicalUids.length!==uids.length||canonicalUids.some(function(x){return uids.indexOf(x)<0;}))throw Error('Auditor UUID identity mismatch');
 var id=String(input.operationId||'').trim();
 var reason=String(input.internalReason||'').trim(),comment=String(input.ecasComment||'').trim();
 if(!reason||!comment)throw Error('Internal reason and ECAS explanation required');
 var proposal={operationId:id,auditA:a,auditB:b,requiredAuditorUids:canonicalUids,acknowledgedAuditorUids:[],createdBy:String(auth.email).trim().toLowerCase(),createdAt:new Date().toISOString(),status:schedule.dateChanged?'AWAITING_ACKNOWLEDGEMENT':'CONFIRMED',reminderSentAt:null,escalatedAt:null,originalRevisions:{},internalReason:reason,ecasComment:comment,blocksA:schedule.blocksA,blocksB:schedule.blocksB,dateChanged:schedule.dateChanged};
 proposal.originalRevisions[a]=pair.auditA.revision;
 proposal.originalRevisions[b]=pair.auditB.revision;
 return Swap20Store_create_(proposal);
}

/** Manager withdrawal. Does not change canonical Accepted audits. */
function Swap20ManagerWithdrawProposal(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Manager authentication required');
 return Swap20ManagerWithdrawProposalAuthorized_(input,auth);
}
function Swap20ManagerWithdrawProposalAuthorized_(input,auth){
 Swap20_assertGasWriteAuthority_();
 input=input||{};
 if(!auth||auth.ok!==true||!auth.email||auth.role&&String(auth.role).toLowerCase()!=='manager')throw Error('Manager authentication required');
 var id=String(input.operationId||'').trim(),old=Swap20Store_read_(id);
 if(!old)throw Error('Swap proposal not found');
 if(old.status!=='AWAITING_ACKNOWLEDGEMENT'&&old.status!=='ESCALATED'&&old.status!=='CONFIRMED')throw Error('Proposal cannot be withdrawn');
 // A journaled transaction may be withdrawn only if no canonical writes began,
 // or if a verified rollback completed. Never conceal an uncertain write state.
 var journal=Swap20Journal_history_(id);
 if(journal.length){
  var terminal=journal[journal.length-1];
  if(terminal.stage==='CONFLICT'){
   if(terminal.payload&&terminal.payload.noWrites!==true)throw Error('SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY');
   if(journal.some(function(event){return event.stage==='WRITING'||event.stage==='COMMITTED'||event.stage==='ROLLING_BACK'||event.stage==='FAILED';}))throw Error('SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY');
  }else if(terminal.stage!=='ROLLED_BACK')throw Error('SWAP_WITHDRAW_REQUIRES_MANUAL_RECOVERY');
 }
 var next=JSON.parse(JSON.stringify(old));
 next.status='WITHDRAWN';
 next.withdrawnAt=new Date().toISOString();
 next.withdrawnBy=auth.email;
 return Swap20Store_transition_(id,old.status,next,old);
}
