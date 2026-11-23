/** Explicit DEV-only rescue of one quarantined, already committed PLAN outbox.
 * No new planning command, no backfill and no unverified fence release.
 * A timeout after starting Sheets writes leaves RECOVERING locked for operator
 * investigation, rather than attempting a blind retry.
 */
export function createPlanningAtomicForwardRecovery20({store,gate,projector,appendProjector,recovery,availabilityService}={}){
 const funcs=[[store,'readOutbox'],[store,'readAudit'],[gate,'beginRecovery'],[gate,'finishRecovery'],
  [gate,'read'],[projector,'inspect'],[projector,'apply'],[appendProjector,'inspect'],
  [appendProjector,'apply'],[recovery,'recoverOne']];
 if(funcs.some(([obj,name])=>typeof obj?.[name]!=='function'))throw Error('ATOMIC_FORWARD_RECOVERY_CONFIG_INVALID');
 async function commit({operationId}={}){
  if(!/^[a-f0-9]{64}$/.test(String(operationId||'')))throw Error('ATOMIC_FORWARD_RECOVERY_ID_INVALID');
  const entry=await store.readOutbox(operationId);
  if(!entry||entry.operationId!==operationId||!['PLAN','EXT_APPLY','EXT_UNDO'].includes(entry.action)||
     !['UNCERTAIN','PENDING'].includes(entry.state)||entry.multi===true||
     !entry.auditId||!entry.snapshot||
     !Array.isArray(entry.snapshot.projectionWrites)||!entry.snapshot.projectionWrites.length||
     !Array.isArray(entry.snapshot.projectionPreconditions)||
     !Array.isArray(entry.snapshot.appendIntents)||!entry.snapshot.appendIntents.length)
   throw Error('ATOMIC_FORWARD_RECOVERY_OUTBOX_UNSUPPORTED');
  const audit=await store.readAudit(entry.auditId);
  if(!audit||audit.pendingOperationId!==operationId||audit.revision!==entry.revision)
   throw Error('ATOMIC_FORWARD_RECOVERY_FIRESTORE_CAS_FAILED');
  // Do not settle the global operation while the owning auditor lease is
  // still quarantined; a partial success must not masquerade as readiness.
  if(entry.auditorId){
   if(typeof availabilityService?.read!=='function')throw Error('ATOMIC_FORWARD_RECOVERY_LEASE_READER_REQUIRED');
   const doc=await availabilityService.read({role:'manager',id:'atomic-recovery'},entry.auditorId);
   const lease=doc?.planningLease;
   if(lease){
    if(lease.auditId!==entry.auditId||!lease.token||lease.state!=='UNCERTAIN')
     throw Error('ATOMIC_FORWARD_RECOVERY_LEASE_NOT_QUARANTINED');
    const since=Date.parse(lease.uncertainAt||'');
    if(!Number.isFinite(since)||Date.now()-since<30*60*1000)
     throw Error('ATOMIC_FORWARD_RECOVERY_LEASE_QUARANTINE_ACTIVE');
   }
  }
  const holder=await gate.beginRecovery({operationId});
  let mutationStarted=false,proofVerified=false,stage='CANONICAL_RECHECK';
  try{
   // Recheck the same durable Firestore identity AFTER taking exclusive CAS.
   const current=await store.readOutbox(operationId);
   const currentAudit=await store.readAudit(entry.auditId);
   if(current?.operationId!==operationId||current?.state!==entry.state||
      currentAudit?.pendingOperationId!==operationId||currentAudit?.revision!==entry.revision)
    throw Error('ATOMIC_FORWARD_RECOVERY_CHANGED_DURING_FENCE');
   stage='READ_ROWS_BEFORE';
   const plan=entry.action==='PLAN'?entry.snapshot:await projector.prepareExtensionDateRecovery(entry.snapshot);
   const first=await projector.inspect(plan,{allowMissingAvailabilityRows:entry.action==='PLAN'});
   stage='READ_APPEND_BEFORE';
   const appendBefore=await appendProjector.inspect(entry.snapshot.appendIntents);
   if(!['READY','MATCH'].includes(first.state)||!['MISSING','MATCH'].includes(appendBefore.state))
    throw Error('ATOMIC_FORWARD_RECOVERY_SOURCE_CONFLICT');
   mutationStarted=true;
   stage='APPLY_ROWS';
   await projector.apply({operationId,gateToken:holder.token,plan,allowMissingAvailabilityRows:entry.action==='PLAN'});
   stage='VERIFY_ROWS';
   const rowProof=await projector.inspect(entry.snapshot);
   if(rowProof.state!=='MATCH')throw Error('ATOMIC_FORWARD_RECOVERY_ROW_UNVERIFIED');
   stage='APPLY_NOTIFICATIONS';
   await appendProjector.apply({operationId,gateToken:holder.token,intents:entry.snapshot.appendIntents});
   stage='VERIFY_NOTIFICATIONS';
   const appProof=await appendProjector.inspect(entry.snapshot.appendIntents);
   if(appProof.state!=='MATCH')throw Error('ATOMIC_FORWARD_RECOVERY_APPEND_UNVERIFIED');
   proofVerified=true;
  }catch(error){
   if(!mutationStarted){
    await gate.finishRecovery({operationId,token:holder.token});
    throw error;
   }
   // No blind retry or unlock. Preserve the exact failure stage for operator
   // diagnosis without persisting business values or network error bodies.
   const errorCode=String(error?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,100);
   console.error('[AMS_ATOMIC_FORWARD_RECOVERY_FAILURE]',JSON.stringify({stage,errorCode,operationId}));
   try{await gate.recordRecoveryFailure({operationId,token:holder.token,stage,code:errorCode});}
   catch(recordError){console.error('[AMS_ATOMIC_FORWARD_RECOVERY_FAILURE_RECORD_ERROR]',String(recordError?.message||'UNKNOWN').slice(0,100));}
   throw Error('ATOMIC_FORWARD_RECOVERY_OUTCOME_UNCERTAIN_'+stage+'_'+errorCode);
  }
  if(!proofVerified)throw Error('ATOMIC_FORWARD_RECOVERY_PROOF_MISSING');
  await gate.finishRecovery({operationId,token:holder.token});
  const result=await recovery.recoverOne(entry);
  if(result.state!=='PROJECTED')throw Error('ATOMIC_FORWARD_RECOVERY_SETTLEMENT_INCOMPLETE');
  return {success:true,operationId,state:'PROJECTED',recovered:true};
 }
 return Object.freeze({commit});
}
