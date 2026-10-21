// SWAP 2.0: prepare exactly one logical ECAS digest from two Accepted audits.
// No writes or sends. The dispatcher must not accept unverified prior receipts.
function Swap20_prepareCombinedEcasDigest_(operation, changes) {
 if(!operation||!operation.operationId||!operation.ecasComment)throw Error('Invalid SWAP ECAS intent');
 if(!Array.isArray(changes)||changes.length!==2)throw Error('Exactly two SWAP audit changes required');
 var seen={},items=[];
 for(var i=0;i<changes.length;i++){
  var change=changes[i]||{},before=change.before||{},after=change.after||{};
  var auditId=String(before.auditId||'');
  if(!auditId||auditId!==String(after.auditId||'')||seen[auditId])throw Error('Invalid SWAP audit change identity');
  seen[auditId]=true;
  if(!before.communicationId||!before.planningDigest||before.communicatedToEcas!==true)throw Error('Previous ECAS receipt required');
  if(!ECAS20_VerifyPersistedCommunication_(auditId,before.communicationId,before))throw Error('Previous ECAS receipt unverified');
  if(!Array.isArray(before.blocks)||!before.blocks.length||!Array.isArray(after.blocks)||!after.blocks.length)throw Error('SWAP schedules incomplete');
  if(JSON.stringify(before.blocks)===JSON.stringify(after.blocks))throw Error('SWAP schedule unchanged');
  var prepared=StatusNotificationBridge_PrepareEcasChangeCancel_('ECAS_AUDIT_CHANGED_DIGEST',before,after,operation.ecasComment);
  if(!prepared||prepared.ok!==true)throw Error('ECAS item missing required fields');
  items.push(prepared.payload);
 }
 if(!seen[String(operation.auditA)]||!seen[String(operation.auditB)])throw Error('SWAP pair mismatch');
 return {ok:true,operationId:operation.operationId,eventKey:'ECAS_AUDIT_CHANGED_DIGEST',
  combined:true,items:items,recipientRole:'PLANNING',lifecycleUnchanged:true,
  queueAllowed:false};
}
