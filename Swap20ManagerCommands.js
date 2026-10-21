/**
 * Manager-authorized swap proposal creation. No canonical writes.
 * Required auditor UUIDs are supplied by a trusted identity resolver.
 */
function Swap20ManagerCreateProposal(input){
 input=input||{};
 var auth=V5_AUTH.validateTrustedTokenByRole(input.trustedToken||input.token,'Manager',input.deviceFingerprint||input.deviceId);
 if(!auth||auth.ok!==true||!auth.email)throw Error('Manager authentication required');
 var a=String(input.auditA||'').trim(),b=String(input.auditB||'').trim();
 var pair=Swap20_readCanonicalPair({auditA:a,auditB:b});
 if(!pair.eligible)throw Error('Swap pair not eligible');
 var uids=input.requiredAuditorUids;
 if(!Array.isArray(uids)||!uids.length||uids.some(function(x){return !/^[A-Za-z0-9_-]{8,128}$/.test(String(x||''));})||new Set(uids).size!==uids.length)throw Error('Valid auditor UUIDs required');
 if(typeof Swap20_resolveAuditorUidForAudit_!=='function')throw Error('Canonical auditor UID resolver unavailable');
 var canonicalUids=[Swap20_resolveAuditorUidForAudit_(a),Swap20_resolveAuditorUidForAudit_(b)].filter(Boolean);
 canonicalUids=canonicalUids.filter(function(x,i){return canonicalUids.indexOf(x)===i;});
 if(canonicalUids.length!==uids.length||canonicalUids.some(function(x){return uids.indexOf(x)<0;}))throw Error('Auditor UUID identity mismatch');
 var id=String(input.operationId||'').trim();
 var reason=String(input.internalReason||'').trim(),comment=String(input.ecasComment||'').trim();
 if(!reason||!comment)throw Error('Internal reason and ECAS explanation required');
 var proposal={operationId:id,auditA:a,auditB:b,requiredAuditorUids:canonicalUids,acknowledgedAuditorUids:[],createdAt:new Date().toISOString(),status:'AWAITING_ACKNOWLEDGEMENT',reminderSentAt:null,escalatedAt:null,originalRevisions:{},internalReason:reason,ecasComment:comment};
 proposal.originalRevisions[a]=pair.auditA.revision;
 proposal.originalRevisions[b]=pair.auditB.revision;
 return Swap20Store_create_(proposal);
}
