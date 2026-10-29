/** Multi-audit transactional lifecycle authority for destructive completion/rejection.
 * Firestore commits tombstone + successors + slot changes in one transaction;
 * Sheets keeps source row as a terminal-status tombstone instead of unsafe
 * physical row deletion. All append effects are durable in the same outbox.
 */
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const str=x=>String(x??'').trim();
const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
export function createPlanningMultiLifecycleService({atomicStore,gate,projector,appendProjector,preflight}={}){
 if(typeof atomicStore?.commitMulti!=='function'||typeof atomicStore?.readAudit!=='function'||typeof atomicStore?.readOutbox!=='function'||typeof atomicStore?.markProjected!=='function'||typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||typeof gate?.uncertain!=='function'||typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function'||typeof preflight!=='function')throw Error('PLANNING_MULTI_SERVICE_CONFIG_INVALID');
 async function commit({actor,body,action}){
  action=norm(action);
  if(actor?.role!=='manager'&&actor?.role!=='auditor'||action!=='COMPLETE'&&action!=='REJECT'||actor.role==='auditor'&&action!=='COMPLETE'||!str(actor.auditorId)||!str(body?.auditId))throw Error('PLANNING_MULTI_ACTION_FORBIDDEN');
  const auditId=str(body.auditId),operationId=digest({auditId,action,body,actorId:actor.auditorId});
  const prior=await atomicStore.readOutbox(operationId);
  if(prior){
   if(prior.auditId!==auditId||prior.action!==action||prior.actorId!==actor.auditorId)throw Error('PLANNING_MULTI_REPLAY_IDENTITY_CONFLICT');
   if(prior.state==='PROJECTED')return {success:true,replayed:true,action,auditId,operationId};
   throw Error('PLANNING_MULTI_RECOVERY_REQUIRED');
  }
  let lock=null,attempted=false,committed=false,verified=false;
  try{
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'ATOMIC_MULTI_'+action});
   const preview=await preflight({actor,body:{...body,authorityPreflight:true},action});
   if(preview?.success!==true||preview?.authorityPreflight!==true||preview?.auditId!==auditId||!Array.isArray(preview.removedSourceRows)||preview.removedSourceRows.length!==1||!Array.isArray(preview.successorSnapshots)||!Array.isArray(preview.projectionWrites)||!preview.projectionWrites.length||!Array.isArray(preview.projectionPreconditions)||!Array.isArray(preview.appendIntents))throw Error('PLANNING_MULTI_PREFLIGHT_INCOMPLETE');
   const parent=await atomicStore.readAudit(auditId);
   if(!parent||parent.pendingOperationId||parent.snapshot?.sourceRevision!==preview.expectedSourceRevision||parent.snapshot?.legacyUnverified)throw Error('PLANNING_MULTI_PARENT_REVISION_INVALID');
   if(actor.role==='auditor'&&(norm(parent.snapshot?.status)!=='ACCEPTED'||parent.auditorId!==actor.auditorId))throw Error('PLANNING_MULTI_AUDITOR_OWNERSHIP_INVALID');
   const expectedStatus=action==='COMPLETE'?'COMPLETED':'REJECTED';
   if(norm(preview.canonicalSnapshot?.status)!==expectedStatus)throw Error('PLANNING_MULTI_TOMBSTONE_STATUS_INVALID');
   const snapshots=preview.successorSnapshots;
   if(action==='REJECT'&&snapshots.length)throw Error('PLANNING_MULTI_REJECT_UNEXPECTED_SUCCESSORS');
   if(new Set(snapshots.map(x=>x.auditId)).size!==snapshots.length||snapshots.some(x=>!x.auditId||x.auditId===auditId||norm(x.status)!=='PENDING_PLANNING'||str(x.assignedTo)))throw Error('PLANNING_MULTI_SUCCESSOR_INVALID');
   const plan={...preview.canonicalSnapshot,projectionWrites:preview.projectionWrites,projectionPreconditions:preview.projectionPreconditions,appendIntents:preview.appendIntents,successorSnapshots:snapshots};
   const entities=[
    {auditId,expectedRevision:parent.revision,remove:true,auditorId:null,blocks:[],nextSnapshot:plan},
    ...snapshots.map(x=>({auditId:x.auditId,expectedRevision:null,remove:false,auditorId:null,blocks:[],nextSnapshot:x}))
   ];
   attempted=true;
   const accepted=await atomicStore.commitMulti({operationId,actorId:actor.auditorId,action,entities,projectionPlan:plan});
   committed=true;
   if(accepted.replayed)throw Error('PLANNING_MULTI_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:plan.appendIntents});
   const rows=await projector.inspect(plan),appends=await appendProjector.inspect(plan.appendIntents);
   if(rows.state!=='MATCH'||appends.state!=='MATCH')throw Error('PLANNING_MULTI_PROJECTION_NOT_VERIFIED');
   await atomicStore.markProjected({auditId,operationId,proof:{verified:true,auditId,rowHash:digest({rows:rows.detail,appends:appends.count})}});
   verified=true;
   await gate.release({token:lock.token,verified:true,proof:'MULTI_ENTITIES_FIRESTORE_SHEETS_VERIFIED'});
   lock=null;
   return {success:true,authority:'FIRESTORE',projection:'PROJECTED',auditId,action,operationId,successorAuditIds:snapshots.map(x=>x.auditId),entities:accepted.entities};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'MULTI_PREFLIGHT_FAILED_BEFORE_WRITE'});
    else if(verified)await gate.release({token:lock.token,verified:true,proof:'MULTI_PROJECTED_RELEASE_FAILED'});
    else{
     if(committed)await atomicStore.markUncertain({auditId,operationId,reason:'MULTI_PROJECTION_OUTCOME_UNKNOWN'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'MULTI_COMMIT_OR_PROJECTOR_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
