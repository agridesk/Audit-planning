/**
 * Swap transaction coordinator. Runs only on DEV; caller must hold script lock.
 * All before-images are journaled before any write.
 */
function Swap20_executeLocked_(proposal){
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('Swap writes restricted to DEV');
 if(!proposal||proposal.status!=='CONFIRMED')throw Error('Confirmed proposal required');
 if(proposal.dateChanged===true&&(!Array.isArray(proposal.requiredAuditorUids)||!proposal.requiredAuditorUids.length||!Array.isArray(proposal.acknowledgedAuditorUids)||proposal.requiredAuditorUids.some(function(uid){return proposal.acknowledgedAuditorUids.indexOf(uid)<0;})))throw Error('Swap auditor acknowledgements incomplete');
 if(!proposal.operationId||!proposal.auditA||!proposal.auditB||proposal.auditA===proposal.auditB)throw Error('Invalid swap operation identity');
 var persisted=Swap20Store_read_(proposal.operationId);
 if(!persisted||persisted.status!=='CONFIRMED'||JSON.stringify(persisted)!==JSON.stringify(proposal))throw Error('Proposal changed before commit');
 var history=Swap20Journal_history_(proposal.operationId);
 if(history.length)throw Error('Existing journal requires recovery');
 var guard=Swap20CanonicalCommitGuard({auditA:proposal.auditA,auditB:proposal.auditB,expectedRevisions:proposal.originalRevisions,blocksA:proposal.blocksA,blocksB:proposal.blocksB});
 if(!guard||guard.ok!==true)throw Error('Swap canonical preflight failed');
 var canonical=Swap20_captureCanonicalBeforeImages_(proposal);
 var availability=Swap20_captureAvailabilityBeforeImages_();
 var owners={};
 canonical.rows.forEach(function(image){
  var index=canonical.headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('assignedto');
  if(index<0)throw Error('Canonical auditor owner missing');
  var detail=PlanningWorkspacePlannedAuditReadService_get({auditId:image.auditId});
  if(!detail||!detail.auditorEmail||String(detail.assignedTo||'').trim()!==String(image.values[index]||'').trim())throw Error('Auditor identity mismatch');
  owners[image.auditId]=String(detail.auditorEmail).trim().toLowerCase();
 });
 var plan=Swap20_availabilityPlan_(availability,proposal,owners);
 if(!plan||!Array.isArray(plan.values)||plan.sheetName!==availability.sheetName||plan.width!==availability.width||plan.originalHeight!==availability.height)throw Error('Invalid paired reservation plan');
 if(plan.values.length<availability.height||plan.values.length>2000)throw Error('Availability plan exceeds safe row limit');
 var before={canonical:canonical,availability:availability};
 if(Swap20Journal_encodePayload_(before).length>40000)throw Error('Swap compressed before-images exceed journal capacity');
 if(!Array.isArray(canonical.rows)||canonical.rows.length!==2)throw Error('Canonical pair snapshot incomplete');
 if(String(canonical.rows[0].auditId)!==String(proposal.auditA)||String(canonical.rows[1].auditId)!==String(proposal.auditB))throw Error('Canonical pair order mismatch');
 Swap20Journal_appendLocked_(proposal.operationId,0,'PREPARED',before);
 var writingStarted=false;
 try{
  Swap20_verifyCanonicalBeforeImages_(canonical);
  if(JSON.stringify(Swap20Store_read_(proposal.operationId))!==JSON.stringify(proposal))throw Error('Proposal changed before writing');
  Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'WRITING',{auditA:proposal.auditA,auditB:proposal.auditB});
  writingStarted=true;
  Swap20_writeAvailabilityPlanLocked_(plan,availability);
  Swap20_writeCanonicalPairLocked_(canonical,proposal);
  Swap20_verifyAppliedPairLocked_(canonical,proposal,plan);
  Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'COMMITTED',{auditA:proposal.auditA,auditB:proposal.auditB});
  return {success:true,operationId:proposal.operationId,committed:true};
 }catch(err){
  if(!writingStarted){Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'CONFLICT',{reason:String(err),noWrites:true});throw Error('Swap stopped before data writes: '+String(err));}
  var failures=[];
  try{Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'ROLLING_BACK',{reason:String(err)});}catch(e){failures.push(String(e));}
  canonical.rollbackExpectedBlocksA=proposal.blocksA;
  canonical.rollbackExpectedBlocksB=proposal.blocksB;
  try{Swap20_restoreCanonicalBeforeImages_(canonical);}catch(e){failures.push(String(e));}
  try{Swap20_restoreAvailabilityBeforeImages_(availability,plan);}catch(e){failures.push(String(e));}
  try{Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,failures.length?'FAILED':'ROLLED_BACK',{reason:String(err),failures:failures});}catch(e){failures.push(String(e));}
  throw Error('Swap transaction aborted: '+String(err)+(failures.length?'; recovery required: '+failures.join('; '):''));
 }
}
