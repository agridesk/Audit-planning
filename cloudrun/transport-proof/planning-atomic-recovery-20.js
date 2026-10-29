/** New atomic-planning outbox recovery, read-only observation.
 * Only verified full Sheets row and append parity may settle an outbox.
 * Missing / contradictory evidence never causes a blind re-write.
 */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createPlanningAtomicRecovery({store,projector,appendProjector,gate,availabilityService}={}){
 if(typeof store?.listOutbox!=='function'||typeof store?.readAudit!=='function'||typeof store?.markProjected!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.inspect!=='function'||typeof gate?.read!=='function')throw Error('ATOMIC_RECOVERY_DEPENDENCY_INVALID');
 async function recoverOne(entry){
  if(!entry||!['PENDING','UNCERTAIN'].includes(entry.state)||!entry.auditId||!entry.operationId||!entry.snapshot)return {state:'SKIPPED'};
  const audit=await store.readAudit(entry.auditId);
  if(!audit||audit.pendingOperationId!==entry.operationId||audit.revision!==entry.revision)throw Error('ATOMIC_RECOVERY_CANONICAL_MISMATCH');
  const snapshot=entry.snapshot;
  if(!Array.isArray(snapshot.projectionWrites)||!Array.isArray(snapshot.projectionPreconditions)||!Array.isArray(snapshot.appendIntents))throw Error('ATOMIC_RECOVERY_SNAPSHOT_INCOMPLETE');
  const rowCheck=await projector.inspect(snapshot);
  const appendCheck=await appendProjector.inspect(snapshot.appendIntents);
  if(rowCheck.state!=='MATCH'||appendCheck.state!=='MATCH')return {state:'UNRESOLVED',rowState:rowCheck.state,appendState:appendCheck.state};
  const global=await gate.read();
  if(global.holder&&global.holder.operationId!==entry.operationId)throw Error('ATOMIC_RECOVERY_GATE_OWNERSHIP_MISMATCH');
  if(global.holder&&global.holder.state!=='UNCERTAIN'){
   const acquired=Date.parse(global.holder.acquiredAt||'');
   if(global.holder.state!=='ACTIVE'||!Number.isFinite(acquired)||Date.now()-acquired<30*60*1000)throw Error('ATOMIC_RECOVERY_ACTIVE_WRITER_MUST_FINISH');
  }
  const proof={verified:true,auditId:entry.auditId,rowHash:hash({rows:rowCheck.detail,appends:appendCheck.count})};
  await store.markProjected({auditId:entry.auditId,operationId:entry.operationId,proof});
  // A verified outbox is enough to unlock the global gate. An availability lease
  // is released only if the exact auditor/audit pair and token are observed.
  if(global.holder&&global.holder.operationId===entry.operationId){
   if(global.holder.state==='ACTIVE'&&Date.now()-Date.parse(global.holder.acquiredAt||'')<30*60*1000)throw Error('ATOMIC_RECOVERY_ACTIVE_WRITER_MUST_FINISH');
   const current=await gate.read();
   if(current.holder?.token!==global.holder.token)throw Error('ATOMIC_RECOVERY_GATE_MOVED');
   await gate.release({token:global.holder.token,verified:true,proof:'CANONICAL_FIRESTORE_SHEETS_OUTBOX_MATCH'});
  }
  if(availabilityService&&entry.auditorId&&typeof availabilityService.read==='function'&&typeof availabilityService.reconcilePlanningLease==='function'){
   const actor={role:'manager',id:'atomic-recovery'};
   const doc=await availabilityService.read(actor,entry.auditorId);
   const lease=doc.planningLease;
   if(lease?.state==='UNCERTAIN'&&lease.auditId===entry.auditId){
    await availabilityService.reconcilePlanningLease({actor,auditorId:entry.auditorId,token:lease.token,verifiedAuditId:entry.auditId});
   }
  }
  return {state:'PROJECTED'};
 }
 async function scan({limit=100}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('ATOMIC_RECOVERY_LIMIT_INVALID');
  let token='',scanned=0,recovered=0,unresolved=0,errors=0,pages=0;
  do{
   const result=await store.listOutbox({pageSize:Math.min(100,limit-scanned),pageToken:token});
   pages++;if(!Array.isArray(result.entries)||pages>limit+1)throw Error('ATOMIC_RECOVERY_SCAN_INVALID');
   for(const entry of result.entries){
    scanned++;
    if(!['PENDING','UNCERTAIN'].includes(entry.state))continue;
    try{const outcome=await recoverOne(entry);if(outcome.state==='PROJECTED')recovered++;else unresolved++;}
    catch{errors++;unresolved++;}
   }
   token=result.nextPageToken||'';
   if(scanned>=limit)break;
  }while(token);
  return {scanned,recovered,unresolved,errors,truncated:!!token};
 }
 return Object.freeze({scan,recoverOne});
}
