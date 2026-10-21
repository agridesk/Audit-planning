// Combined SWAP 2.0 ECAS change envelope. Pure, deterministic and queue-free.
// Both Accepted audits remain unchanged in lifecycle. This contract explicitly
// forbids two separate changed events or Cancel/Reaccept.
function Swap20_buildCombinedEcasChange_(proposal, previousA, previousB){
 var errors=[];
 if(!proposal||!proposal.operationId||!proposal.auditA||!proposal.auditB||
    proposal.auditA===proposal.auditB)errors.push('INVALID_SWAP_PAIR');
 if(!proposal||!proposal.ecasComment||!String(proposal.ecasComment).trim())
   errors.push('EXTERNAL_REASON_REQUIRED');
 if(!proposal||!Array.isArray(proposal.blocksA)||!proposal.blocksA.length||
    !Array.isArray(proposal.blocksB)||!proposal.blocksB.length)
   errors.push('BOTH_NEW_SCHEDULES_REQUIRED');
 var before=[previousA,previousB];
 var audits=proposal?[proposal.auditA,proposal.auditB]:[];
 for(var i=0;i<2;i++){
  var item=before[i];
  if(!item||String(item.auditId||'')!==String(audits[i]||''))errors.push('ORIGINAL_AUDIT_ID_MISMATCH_'+i);
  if(!item||!Array.isArray(item.blocks)||!item.blocks.length)errors.push('ORIGINAL_SCHEDULE_MISSING_'+i);
  if(!item||!item.communicationId||!item.planningDigest||item.communicatedToEcas!==true)
   errors.push('ORIGINAL_ECAS_RECEIPT_MISSING_'+i);
  if(!item||!item.company||!item.mpsNumber||!item.auditorName)
   errors.push('ORIGINAL_AUDIT_METADATA_MISSING_'+i);
 }
 if(errors.length)return {ok:false,errors:errors};
 var snapshots=[{auditId:proposal.auditA,previous:previousA,nextBlocks:proposal.blocksA},
                {auditId:proposal.auditB,previous:previousB,nextBlocks:proposal.blocksB}];
 var same=snapshots.every(function(x){return JSON.stringify(x.previous.blocks)===JSON.stringify(x.nextBlocks);});
 if(same)return {ok:false,errors:['SCHEDULE_UNCHANGED']};
 var envelope={
  eventKey:'ECAS_AUDIT_CHANGED_DIGEST',
  operationId:String(proposal.operationId),
  auditId:String(proposal.operationId),
  combined:true,
  count:2,
  lifecycle:'Accepted',
  action:'SWAP_COMMITTED',
  ecasComment:String(proposal.ecasComment).trim(),
  auditChanges:snapshots.map(function(x){
   return {
    auditId:String(x.auditId),
    company:String(x.previous.company),
    mpsNumber:String(x.previous.mpsNumber),
    auditorName:String(x.previous.auditorName),
    auditorUid:String(x.previous.auditorUid||''),
    scopes:x.previous.scopes||[],
    previousBlocks:x.previous.blocks,
    blocks:x.nextBlocks,
    priorCommunicationId:String(x.previous.communicationId),
    priorPlanningDigest:String(x.previous.planningDigest)
   };
  })
 };
 return {ok:true,queueAllowed:false,payload:envelope,
  queueBlockedReason:'COMBINED_RENDERER_AND_LEDGER_NOT_ACCEPTED'};
}
// Verifies two independent prior communication receipts, one for each audit.
function Swap20_verifyCombinedEcasProofs_(envelope){
 if(!envelope||envelope.combined!==true||!Array.isArray(envelope.auditChanges)||
    envelope.auditChanges.length!==2||envelope.eventKey!=='ECAS_AUDIT_CHANGED_DIGEST')
  return false;
 if(typeof ECAS20_VerifyPersistedCommunication_!=='function')return false;
 for(var i=0;i<2;i++){
  var a=envelope.auditChanges[i];
  if(!a||!a.auditId||!a.priorCommunicationId||!a.priorPlanningDigest)return false;
  var v=ECAS20_VerifyPersistedCommunication_(a.auditId,a.priorCommunicationId,
   {planningDigest:a.priorPlanningDigest});
  if(v!==true)return false;
 }
 return true;
}
