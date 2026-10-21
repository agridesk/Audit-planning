/**
 * Swap transaction coordinator. Runs only on DEV; caller must hold script lock.
 * All before-images are journaled before any write.
 */
function Swap20_executeLocked_(proposal){
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('Swap writes restricted to DEV');
 if(!proposal||proposal.status!=='CONFIRMED')throw Error('Confirmed proposal required');
 var history=Swap20Journal_history_(proposal.operationId);
 if(history.length)throw Error('Existing journal requires recovery');
 var canonical=Swap20_captureCanonicalBeforeImages_(proposal);
 var availability=Swap20_captureAvailabilityBeforeImages_();
 var owners={};
 canonical.rows.forEach(function(image){
  var index=canonical.headers.indexOf('Assigned to');
  if(index<0)throw Error('Canonical auditor owner missing');
  owners[image.auditId]=String(image.values[index]||'').trim();
 });
 var plan=Swap20_availabilityPlan_(availability,proposal,owners);
 var before={canonical:canonical,availability:availability};
 if(JSON.stringify(before).length>35000)throw Error('Swap before-images exceed journal capacity');
 Swap20Journal_appendLocked_(proposal.operationId,0,'PREPARED',before);
 try{
  Swap20_verifyCanonicalBeforeImages_(canonical);
  Swap20Journal_appendLocked_(proposal.operationId,1,'WRITING',{auditA:proposal.auditA,auditB:proposal.auditB});
  Swap20_writeAvailabilityPlanLocked_(plan,availability);
  Swap20_writeCanonicalPairLocked_(canonical,proposal);
  Swap20_verifyAppliedPairLocked_(canonical,proposal,plan);
  Swap20Journal_appendLocked_(proposal.operationId,2,'COMMITTED',{auditA:proposal.auditA,auditB:proposal.auditB});
  return {success:true,operationId:proposal.operationId,committed:true};
 }catch(err){
  var failures=[];
  try{Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'ROLLING_BACK',{reason:String(err)});}catch(e){failures.push(String(e));}
  try{Swap20_restoreCanonicalBeforeImages_(canonical);}catch(e){failures.push(String(e));}
  try{Swap20_restoreAvailabilityBeforeImages_(availability);}catch(e){failures.push(String(e));}
  try{Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,failures.length?'FAILED':'ROLLED_BACK',{reason:String(err),failures:failures});}catch(e){failures.push(String(e));}
  throw Error('Swap transaction aborted: '+String(err)+(failures.length?'; recovery required: '+failures.join('; '):''));
 }
}
