/** Explicit DEV-only forward completion of one already committed separate-composition operation. */
export function createVisitCompositionForwardRecovery20({store,gate,projector,appendProjector,recovery,availabilityService}={}){
 for(const [obj,method] of [[store,'readOutbox'],[store,'readAudit'],[gate,'read'],[gate,'beginRecovery'],[gate,'resumeRecovery'],[gate,'finishRecovery'],[gate,'recordRecoveryFailure'],[projector,'normalizeLegacySourceHours'],[projector,'normalizeCommittedTargetHours'],[projector,'apply'],[projector,'inspect'],[appendProjector,'inspect'],[appendProjector,'apply'],[recovery,'recoverOne'],[availabilityService,'read']])
  if(typeof obj?.[method]!=='function')throw Error('COMPOSITION_FORWARD_RECOVERY_CONFIG_INVALID');
 async function commit({operationId}={}){
  if(!/^[a-f0-9]{64}$/.test(String(operationId||'')))throw Error('COMPOSITION_FORWARD_RECOVERY_ID_INVALID');
  const entry=await store.readOutbox(operationId);
  if(entry?.operationId!==operationId||entry.action!=='VISIT_COMPOSITION_SEPARATELY'||
     !['UNCERTAIN','PROJECTED'].includes(entry.state)||entry.multi!==true||!entry.snapshot||
     !Array.isArray(entry.entities)||entry.entities.length<2)
   throw Error('COMPOSITION_FORWARD_RECOVERY_OUTBOX_INVALID');
  // A crash after Firestore settlement but before auditor-lease reconciliation
  // must be recoverable without replaying any Sheets mutation or receipt.
  if(entry.state==='PROJECTED'){
   const holder=(await gate.read()).holder;
   if(!holder||holder.operationId!==operationId||holder.state!=='UNCERTAIN')
    throw Error('COMPOSITION_SETTLEMENT_GATE_NOT_QUARANTINED');
   const since=Date.parse(holder.uncertainAt||'');
   if(!Number.isFinite(since)||Date.now()-since<30*60*1000)
    throw Error('COMPOSITION_SETTLEMENT_QUARANTINE_ACTIVE');
   const plan=await projector.normalizeCommittedTargetHours(entry.snapshot);
   if((await appendProjector.inspect(entry.snapshot.appendIntents)).state!=='MATCH')
    throw Error('COMPOSITION_SETTLEMENT_APPENDS_MISSING');
   const result=await recovery.recoverOne(entry,{normalizedPlan:plan});
   if(result.state!=='PROJECTED')throw Error('COMPOSITION_SETTLEMENT_INCOMPLETE');
   return {success:true,operationId,state:'PROJECTED',settlementOnly:true};
  }
  const source=await store.readAudit(entry.auditId);
  if(source?.pendingOperationId!==operationId)throw Error('COMPOSITION_FORWARD_RECOVERY_SOURCE_CAS');
  for(const entity of entry.entities){
   const audit=await store.readAudit(entity.auditId);
   if(audit?.pendingOperationId!==operationId||audit.revision!==entity.revision)
    throw Error('COMPOSITION_FORWARD_RECOVERY_ENTITY_CAS');
  }
  const auditors=entry.snapshot.availabilityLeaseAuditors;
  if(!Array.isArray(auditors)||!auditors.length||new Set(auditors).size!==auditors.length)
   throw Error('COMPOSITION_FORWARD_RECOVERY_AUDITORS_INVALID');
  for(const auditorId of auditors){
   const doc=await availabilityService.read({role:'manager',id:'atomic-recovery'},auditorId);
   const lease=doc?.planningLease;
   if(lease){
    if(lease.auditId!==entry.auditId||lease.state!=='UNCERTAIN'||!lease.token)
     throw Error('COMPOSITION_FORWARD_RECOVERY_LEASE_CONFLICT');
    const age=Date.now()-Date.parse(lease.uncertainAt||'');
    if(!Number.isFinite(age)||age<30*60*1000)
     throw Error('COMPOSITION_FORWARD_RECOVERY_LEASE_QUARANTINE');
   }
  }
  // Resume a failed ROWS phase only after the previous recovery writer has
  // been isolated by the gate's own 30-minute quarantine and rotated token.
  // No original business action is re-executed and no existing row is rewritten.
  const currentGate=await gate.read();
  if(currentGate.holder?.operationId===operationId&&currentGate.holder.state==='RECOVERING'){
   const plan=await projector.normalizeCommittedTargetHours(entry.snapshot);
   const app=await appendProjector.inspect(entry.snapshot.appendIntents);
   if(!['MISSING','MATCH'].includes(app.state))
    throw Error('COMPOSITION_FORWARD_RESUME_APPEND_CONFLICT');
   const holder=await gate.resumeRecovery({operationId});
   let stage='RECHECK',mutation=false;
   try{
    const fresh=await store.readOutbox(operationId);
    if(fresh?.state!=='UNCERTAIN'||fresh.operationId!==operationId||
       JSON.stringify(fresh.snapshot.projectionWrites)!==JSON.stringify(entry.snapshot.projectionWrites)||
       JSON.stringify(fresh.snapshot.appendIntents)!==JSON.stringify(entry.snapshot.appendIntents))
     throw Error('COMPOSITION_FORWARD_RESUME_OUTBOX_MOVED');
    const verified=await projector.normalizeCommittedTargetHours(fresh.snapshot);
    if((await projector.inspect(verified)).state!=='MATCH')
     throw Error('COMPOSITION_FORWARD_RESUME_ROWS_MOVED');
    stage='APPENDS';mutation=true;
    await appendProjector.apply({operationId,gateToken:holder.token,intents:entry.snapshot.appendIntents});
    stage='VERIFY_APPENDS';
    if((await appendProjector.inspect(entry.snapshot.appendIntents)).state!=='MATCH')
     throw Error('COMPOSITION_FORWARD_RESUME_APPENDS_UNVERIFIED');
    if((await projector.inspect(verified)).state!=='MATCH')
     throw Error('COMPOSITION_FORWARD_RESUME_ROWS_CHANGED');
   }catch(e){
    if(!mutation){await gate.finishRecovery({operationId,token:holder.token});throw e;}
    await gate.recordRecoveryFailure({operationId,token:holder.token,stage,
     code:String(e.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,100)});
    throw Error('COMPOSITION_FORWARD_RECOVERY_UNCERTAIN_'+stage);
   }
   await gate.finishRecovery({operationId,token:holder.token});
   const result=await recovery.recoverOne(entry,{normalizedPlan:plan});
   if(result.state!=='PROJECTED')throw Error('COMPOSITION_FORWARD_RECOVERY_SETTLEMENT_INCOMPLETE');
   return {success:true,operationId,state:'PROJECTED',resumed:true};
  }
  // Read-only checks precede exclusive recovery ownership.
  const plan=await projector.normalizeLegacySourceHours(entry.snapshot);
  const first=await projector.inspect(plan),app=await appendProjector.inspect(entry.snapshot.appendIntents);
  if(!['READY','MATCH'].includes(first.state)||!['MISSING','MATCH'].includes(app.state))
   throw Error('COMPOSITION_FORWARD_RECOVERY_SOURCE_CONFLICT');
  const holder=await gate.beginRecovery({operationId});
  let mutation=false,stage='RECHECK';
  try{
   const fresh=await store.readOutbox(operationId);
   if(fresh?.state!==entry.state||fresh?.operationId!==operationId)
    throw Error('COMPOSITION_FORWARD_RECOVERY_OUTBOX_MOVED');
   const again=await projector.normalizeLegacySourceHours(fresh.snapshot);
   if(JSON.stringify(again.projectionWrites)!==JSON.stringify(plan.projectionWrites))
    throw Error('COMPOSITION_FORWARD_RECOVERY_SOURCE_MOVED');
   stage='ROWS';mutation=true;
   await projector.apply({operationId,gateToken:holder.token,plan});
   stage='VERIFY_ROWS';
   if((await projector.inspect(plan)).state!=='MATCH')throw Error('COMPOSITION_FORWARD_RECOVERY_ROWS_UNVERIFIED');
   stage='APPENDS';
   await appendProjector.apply({operationId,gateToken:holder.token,intents:entry.snapshot.appendIntents});
   stage='VERIFY_APPENDS';
   if((await appendProjector.inspect(entry.snapshot.appendIntents)).state!=='MATCH')
    throw Error('COMPOSITION_FORWARD_RECOVERY_APPENDS_UNVERIFIED');
  }catch(e){
   if(!mutation){await gate.finishRecovery({operationId,token:holder.token});throw e;}
   await gate.recordRecoveryFailure({operationId,token:holder.token,stage,
    code:String(e.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,100)});
   throw Error('COMPOSITION_FORWARD_RECOVERY_UNCERTAIN_'+stage);
  }
  await gate.finishRecovery({operationId,token:holder.token});
  // Canonical reconciliation must see the same normalized hour value.
  // Inject only a read-only projector view; never rewrite the durable outbox.
  const result=await recovery.recoverOne(entry,{normalizedPlan:plan});
  if(result.state!=='PROJECTED')throw Error('COMPOSITION_FORWARD_RECOVERY_SETTLEMENT_INCOMPLETE');
  return {success:true,operationId,state:'PROJECTED'};
 }
 return Object.freeze({commit});
}
