/** Explicit DEV-only rescue of one quarantined, already committed PLAN outbox.
 * No new planning command, no backfill and no unverified fence release.
 * A timeout after starting Sheets writes leaves RECOVERING locked for operator
 * investigation, rather than attempting a blind retry.
 */
export function createPlanningAtomicForwardRecovery20({store,gate,projector,appendProjector,recovery}={}){
 const funcs=[[store,'readOutbox'],[store,'readAudit'],[gate,'beginRecovery'],[gate,'finishRecovery'],
  [gate,'read'],[projector,'inspect'],[projector,'apply'],[appendProjector,'inspect'],
  [appendProjector,'apply'],[recovery,'recoverOne']];
 if(funcs.some(([obj,name])=>typeof obj?.[name]!=='function'))throw Error('ATOMIC_FORWARD_RECOVERY_CONFIG_INVALID');
 async function commit({operationId}={}){
  if(!/^[a-f0-9]{64}$/.test(String(operationId||'')))throw Error('ATOMIC_FORWARD_RECOVERY_ID_INVALID');
  const entry=await store.readOutbox(operationId);
  if(!entry||entry.operationId!==operationId||entry.action!=='PLAN'||
     !['UNCERTAIN','PENDING'].includes(entry.state)||entry.multi===true||
     !entry.auditId||!entry.snapshot||
     !Array.isArray(entry.snapshot.projectionWrites)||!entry.snapshot.projectionWrites.length||
     !Array.isArray(entry.snapshot.projectionPreconditions)||
     !Array.isArray(entry.snapshot.appendIntents)||!entry.snapshot.appendIntents.length)
   throw Error('ATOMIC_FORWARD_RECOVERY_OUTBOX_UNSUPPORTED');
  const audit=await store.readAudit(entry.auditId);
  if(!audit||audit.pendingOperationId!==operationId||audit.revision!==entry.revision)
   throw Error('ATOMIC_FORWARD_RECOVERY_FIRESTORE_CAS_FAILED');
  const holder=await gate.beginRecovery({operationId});
  let mutationStarted=false,proofVerified=false;
  try{
   // Recheck the same durable Firestore identity AFTER taking exclusive CAS.
   const current=await store.readOutbox(operationId);
   const currentAudit=await store.readAudit(entry.auditId);
   if(current?.operationId!==operationId||current?.state!==entry.state||
      currentAudit?.pendingOperationId!==operationId||currentAudit?.revision!==entry.revision)
    throw Error('ATOMIC_FORWARD_RECOVERY_CHANGED_DURING_FENCE');
   const first=await projector.inspect(entry.snapshot);
   const appendBefore=await appendProjector.inspect(entry.snapshot.appendIntents);
   if(!['READY','MATCH'].includes(first.state)||!['MISSING','MATCH'].includes(appendBefore.state))
    throw Error('ATOMIC_FORWARD_RECOVERY_SOURCE_CONFLICT');
   mutationStarted=true;
   await projector.apply({operationId,gateToken:holder.token,plan:entry.snapshot});
   const rowProof=await projector.inspect(entry.snapshot);
   if(rowProof.state!=='MATCH')throw Error('ATOMIC_FORWARD_RECOVERY_ROW_UNVERIFIED');
   await appendProjector.apply({operationId,gateToken:holder.token,intents:entry.snapshot.appendIntents});
   const appProof=await appendProjector.inspect(entry.snapshot.appendIntents);
   if(appProof.state!=='MATCH')throw Error('ATOMIC_FORWARD_RECOVERY_APPEND_UNVERIFIED');
   proofVerified=true;
  }catch(error){
   if(!mutationStarted){
    await gate.finishRecovery({operationId,token:holder.token});
    throw error;
   }
   // Do not unlock after a possibly in-flight Sheets request.
   throw Error('ATOMIC_FORWARD_RECOVERY_OUTCOME_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED');
  }
  if(!proofVerified)throw Error('ATOMIC_FORWARD_RECOVERY_PROOF_MISSING');
  await gate.finishRecovery({operationId,token:holder.token});
  const result=await recovery.recoverOne(entry);
  if(result.state!=='PROJECTED')throw Error('ATOMIC_FORWARD_RECOVERY_SETTLEMENT_INCOMPLETE');
  return {success:true,operationId,state:'PROJECTED',recovered:true};
 }
 return Object.freeze({commit});
}
