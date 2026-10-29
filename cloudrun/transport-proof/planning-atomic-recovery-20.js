/** New atomic-planning outbox recovery, read-only observation.
 * Only verified full Sheets row and append parity may settle an outbox.
 * Missing / contradictory evidence never causes a blind re-write.
 */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createPlanningAtomicRecovery({store,projector,appendProjector,gate,availabilityService}={}){
 if(typeof store?.listOutbox!=='function'||typeof store?.readAudit!=='function'||typeof store?.markProjected!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.inspect!=='function'||typeof gate?.read!=='function')throw Error('ATOMIC_RECOVERY_DEPENDENCY_INVALID');
 async function recoverOne(entry){
  if(!entry||!['PENDING','UNCERTAIN','PROJECTED'].includes(entry.state)||!entry.auditId||!entry.operationId||!entry.snapshot)return {state:'SKIPPED'};
  const settled=entry.state==='PROJECTED';
  if(settled){
   const gateBefore=await gate.read();
   // A settled outbox may have already released its global fence while its
   // auditor availability lease remains UNKNOWN after a second crash.
   if(gateBefore.holder?.operationId!==entry.operationId&&(!entry.auditorId||!availabilityService))return {state:'SKIPPED'};
  }
  const audit=await store.readAudit(entry.auditId);
  if(!audit||(settled?audit.lastProjectedOperationId!==entry.operationId:audit.pendingOperationId!==entry.operationId)||entry.multi!==true&&audit.revision!==entry.revision)throw Error('ATOMIC_RECOVERY_CANONICAL_MISMATCH');
  if(entry.multi===true){
   if(!Array.isArray(entry.entities)||!entry.entities.length||!entry.entities.some(e=>e.auditId===entry.auditId))throw Error('ATOMIC_RECOVERY_MULTI_INDEX_INVALID');
   for(const entity of entry.entities){
    const related=await store.readAudit(entity.auditId);
    if(!related||(settled?related.lastProjectedOperationId!==entry.operationId:related.pendingOperationId!==entry.operationId)||related.revision!==entity.revision)throw Error('ATOMIC_RECOVERY_MULTI_ENTITY_MISMATCH');
   }
  }
  const snapshot=entry.snapshot;
  if(!Array.isArray(snapshot.projectionWrites)||!Array.isArray(snapshot.projectionPreconditions)||!Array.isArray(snapshot.appendIntents))throw Error('ATOMIC_RECOVERY_SNAPSHOT_INCOMPLETE');
  const rowCheck=await projector.inspect(snapshot);
  const appendCheck=await appendProjector.inspect(snapshot.appendIntents);
  if(rowCheck.state!=='MATCH'||appendCheck.state!=='MATCH')return {state:'UNRESOLVED',rowState:rowCheck.state,appendState:appendCheck.state};
  const global=await gate.read();
  if(global.holder&&global.holder.operationId!==entry.operationId)throw Error('ATOMIC_RECOVERY_GATE_OWNERSHIP_MISMATCH');
  if(global.holder){
   // UNCONFIRMED request termination is not proof that Sheets can no longer
   // complete an in-flight HTTP mutation. Quarantine the fence for at least
   // 30 minutes from its transition to UNCERTAIN, not only its acquisition.
   const since=Date.parse(global.holder.state==='UNCERTAIN'
    ?global.holder.uncertainAt||global.holder.acquiredAt||''
    :global.holder.acquiredAt||'');
   // Even a very old ACTIVE gate could belong to an in-flight writer.
   // Only the writer may release ACTIVE, or a verified manual intervention may
   // mark it UNCERTAIN. Elapsed time alone never fences a still-active writer.
   if(global.holder.state!=='UNCERTAIN'||!Number.isFinite(since)||Date.now()-since<30*60*1000)
    throw Error('ATOMIC_RECOVERY_WRITER_QUARANTINE_ACTIVE');
  }
  const proof={verified:true,auditId:entry.auditId,rowHash:hash({rows:rowCheck.detail,appends:appendCheck.count})};
  if(!settled)await store.markProjected({auditId:entry.auditId,operationId:entry.operationId,proof});
  // A verified outbox is enough to unlock the global gate. An availability lease
  // is released only if the exact auditor/audit pair and token are observed.
  if(global.holder&&global.holder.operationId===entry.operationId){
   // The same quarantined gate was already independently checked above.
   const current=await gate.read();
   if(current.holder?.token!==global.holder.token)throw Error('ATOMIC_RECOVERY_GATE_MOVED');
   await gate.release({token:global.holder.token,verified:true,proof:'CANONICAL_FIRESTORE_SHEETS_OUTBOX_MATCH'});
  }
  let leaseRecovered=false;
  if(availabilityService&&entry.auditorId&&typeof availabilityService.read==='function'&&typeof availabilityService.reconcilePlanningLease==='function'){
   const actor={role:'manager',id:'atomic-recovery'};
   const doc=await availabilityService.read(actor,entry.auditorId);
   const lease=doc.planningLease;
   if((lease?.state==='UNCERTAIN'||lease?.state==='ACTIVE'||lease&&lease.state===undefined)&&lease.auditId===entry.auditId){
    const leaseSince=Date.parse(lease.state==='UNCERTAIN'?lease.uncertainAt||lease.acquiredAt||'':lease.acquiredAt||'');
    if(!Number.isFinite(leaseSince)||Date.now()-leaseSince<30*60*1000)
     return {state:'UNRESOLVED',reason:'AVAILABILITY_LEASE_QUARANTINE'};
    await availabilityService.reconcilePlanningLease({actor,auditorId:entry.auditorId,token:lease.token,verifiedAuditId:entry.auditId,verifiedProjectionProof:proof.rowHash});
    leaseRecovered=true;
   }
  }
  if(settled&&!global.holder&&!leaseRecovered)return {state:'SKIPPED'};
  return {state:'PROJECTED'};
 }
 let nextScanPageToken='';
 async function scan({limit=100}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('ATOMIC_RECOVERY_LIMIT_INVALID');
  let token=nextScanPageToken,scanned=0,recovered=0,unresolved=0,errors=0,pages=0;
  do{
   const result=await store.listOutbox({pageSize:Math.min(100,limit-scanned),pageToken:token});
   pages++;if(!Array.isArray(result.entries)||pages>limit+1)throw Error('ATOMIC_RECOVERY_SCAN_INVALID');
   for(const entry of result.entries){
    scanned++;
    if(!['PENDING','UNCERTAIN','PROJECTED'].includes(entry.state))continue;
    try{const outcome=await recoverOne(entry);if(outcome.state==='PROJECTED')recovered++;else unresolved++;}
    catch{errors++;unresolved++;}
   }
   token=result.nextPageToken||'';
   if(scanned>=limit)break;
  }while(token);
  // Resume subsequent scans from the next page; otherwise a large history
  // of already PROJECTED operations can permanently starve newer outbox work.
  nextScanPageToken=token||'';
  return {scanned,recovered,unresolved,errors,truncated:!!token};
 }
 return Object.freeze({scan,recoverOne});
}
