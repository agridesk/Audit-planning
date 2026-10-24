/**
 * Swap transaction coordinator. Runs only on DEV; caller must hold script lock.
 * All before-images are journaled before any write.
 */
function Swap20_executeLocked_(proposal){
 if(String(PropertiesService.getScriptProperties().getProperty('AMS_ENV')||'').toUpperCase()!=='DEV')throw Error('Swap writes restricted to DEV');
 if(!proposal||proposal.status!=='CONFIRMED')throw Error('Confirmed proposal required');
 if(proposal.dateChanged===true&&(!Array.isArray(proposal.requiredAuditorUids)||!proposal.requiredAuditorUids.length||!Array.isArray(proposal.acknowledgedAuditorUids)||proposal.requiredAuditorUids.some(function(uid){return proposal.acknowledgedAuditorUids.indexOf(uid)<0;})))throw Error('Swap auditor acknowledgements incomplete');
 if(!proposal.operationId||!proposal.auditA||!proposal.auditB||proposal.auditA===proposal.auditB)throw Error('Invalid swap operation identity');
 var entryStarted=Date.now();
 var persisted=Swap20Store_read_(proposal.operationId);
 if(!persisted||persisted.status!=='CONFIRMED'||JSON.stringify(persisted)!==JSON.stringify(proposal))throw Error('Proposal changed before commit');
 var persistedReadMs=Date.now()-entryStarted;
 var history=Swap20Journal_history_(proposal.operationId);
 if(history.length&&(history.length!==1||history[0].stage!=='PREPARED'))throw Error('Existing journal requires recovery');
 var journalHistoryMs=Date.now()-entryStarted-persistedReadMs;
 console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,phase:'entryReads',persistedReadMs:persistedReadMs,journalHistoryMs:journalHistoryMs,elapsedMs:Date.now()-entryStarted}));
 var perfStarted=Date.now();
 var guard=Swap20CanonicalCommitGuard({auditA:proposal.auditA,auditB:proposal.auditB,expectedRevisions:proposal.originalRevisions,blocksA:proposal.blocksA,blocksB:proposal.blocksB});
 if(!guard||guard.ok!==true)throw Error('Swap canonical preflight failed');
 var perfGuardMs=Date.now()-perfStarted;
 var canonical=Swap20_captureCanonicalBeforeImages_(proposal);
 var perfCanonicalMs=Date.now()-perfStarted-perfGuardMs;
 var availability=Swap20_captureAvailabilityBeforeImages_();
 var perfAvailabilityMs=Date.now()-perfStarted-perfGuardMs-perfCanonicalMs;
 console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,guardMs:perfGuardMs,canonicalSnapshotMs:perfCanonicalMs,availabilitySnapshotMs:perfAvailabilityMs,elapsedMs:Date.now()-perfStarted}));
 var ownersStarted=Date.now();
 var owners={};
 canonical.rows.forEach(function(image){
  var index=canonical.headers.map(function(x){return String(x||'').toLowerCase().replace(/[ _-]/g,'');}).indexOf('assignedto');
  if(index<0)throw Error('Canonical auditor owner missing');
  var detail=PlanningWorkspacePlannedAuditReadService_get({auditId:image.auditId});
  if(!detail||!detail.auditorEmail||String(detail.assignedTo||'').trim()!==String(image.values[index]||'').trim())throw Error('Auditor identity mismatch');
  owners[image.auditId]=String(detail.auditorEmail).trim().toLowerCase();
 });
 console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,phase:'ownerResolution',ms:Date.now()-ownersStarted}));
 var plan=Swap20_availabilityPlan_(availability,proposal,owners);
 if(!plan||!Array.isArray(plan.values)||plan.sheetName!==availability.sheetName||plan.width!==availability.width||plan.originalHeight!==availability.height)throw Error('Invalid paired reservation plan');
 if(plan.values.length<availability.height||plan.values.length>2000)throw Error('Availability plan exceeds safe row limit');
 var before={canonical:canonical,availability:availability};
 if(history.length){
  var saved=history[0].payload;
  if(!saved||JSON.stringify(Swap20Journal_markDates_(saved))!==JSON.stringify(Swap20Journal_markDates_(before)))throw Error('PREPARED before-image changed; manual review required');
 }
 if(Swap20Journal_encodePayload_(before).length>40000)throw Error('Swap compressed before-images exceed journal capacity');
 if(!Array.isArray(canonical.rows)||canonical.rows.length!==2)throw Error('Canonical pair snapshot incomplete');
 if(String(canonical.rows[0].auditId)!==String(proposal.auditA)||String(canonical.rows[1].auditId)!==String(proposal.auditB))throw Error('Canonical pair order mismatch');
 var journalStarted=Date.now();
 if(!history.length)Swap20Journal_appendLocked_(proposal.operationId,0,'PREPARED',before);
 console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,phase:'preparedJournal',ms:Date.now()-journalStarted}));
 var writingStarted=false;
 try{
  Swap20_verifyCanonicalBeforeImages_(canonical);
  if(JSON.stringify(Swap20Store_read_(proposal.operationId))!==JSON.stringify(proposal))throw Error('Proposal changed before writing');
  Swap20Journal_appendLocked_(proposal.operationId,history.length+1,'WRITING',{auditA:proposal.auditA,auditB:proposal.auditB});
  writingStarted=true;
  var writesStarted=Date.now();
  Swap20_writeAvailabilityPlanLocked_(plan,availability);
  var availabilityWriteMs=Date.now()-writesStarted;
  Swap20_writeCanonicalPairLocked_(canonical,proposal);
  var canonicalWriteMs=Date.now()-writesStarted-availabilityWriteMs;
  Swap20_verifyAppliedPairLocked_(canonical,proposal,plan);
  console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,phase:'writeAndVerify',availabilityWriteMs:availabilityWriteMs,canonicalWriteMs:canonicalWriteMs,verificationMs:Date.now()-writesStarted-availabilityWriteMs-canonicalWriteMs}));
  Swap20Journal_appendLocked_(proposal.operationId,history.length+2,'COMMITTED',{auditA:proposal.auditA,auditB:proposal.auditB});
  console.info('[SWAP20_COMMIT_PHASE_PERF] '+JSON.stringify({operationId:proposal.operationId,phase:'committed',totalMs:Date.now()-perfStarted}));
  return {success:true,operationId:proposal.operationId,committed:true};
 }catch(err){
  if(!writingStarted){Swap20Journal_appendLocked_(proposal.operationId,Swap20Journal_history_(proposal.operationId).length,'CONFLICT',{reason:String(err),noWrites:true,revisionConflict:err&&err.swapConflict||null});throw Error('Swap stopped before data writes: '+String(err));}
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
