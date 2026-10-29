/** AMS DEV planning command orchestrator: transaction first, projection second.
 * Never sends a successful planning receipt until Firestore authoritative
 * commit and independent Sheets evidence both exist. Crash/timeout after
 * Firestore commit preserves the durable outbox plus global fencing.
 */
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const trim=x=>String(x??'').trim();
export function createPlanningAtomicCommandService({atomicStore,gate,availabilityService,hardGate,preflight,projector,appendProjector,roster}={}){
 if(!atomicStore||typeof atomicStore.commit!=='function'||typeof atomicStore.readAudit!=='function'||typeof atomicStore.readOutbox!=='function'||typeof atomicStore.markProjected!=='function'||typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||typeof gate?.uncertain!=='function'||typeof availabilityService?.acquirePlanningLease!=='function'||typeof availabilityService?.releasePlanningLease!=='function'||typeof availabilityService?.markPlanningLeaseUncertain!=='function'||typeof hardGate!=='function'||typeof preflight!=='function'||typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function'||typeof roster!=='function')throw Error('PLANNING_ATOMIC_SERVICE_CONFIG_INVALID');
 async function commit({actor,body}){
  if(!['manager','auditor'].includes(actor?.role)||!trim(actor?.auditorId)||!body||typeof body!=='object'||!trim(body.auditId)||!trim(body.auditorEmail)||!trim(body.sourceRevision)||!Array.isArray(body.blocks)||!body.blocks.length)throw Error('PLANNING_ATOMIC_INPUT_INVALID');
  const auditId=trim(body.auditId),auditorEmail=trim(body.auditorEmail).toLowerCase();
  const matches=(await roster()).filter(x=>x.role==='auditor'&&x.email===auditorEmail&&x.active!==false);
  if(matches.length!==1||!trim(matches[0].auditorId))throw Error('PLANNING_ATOMIC_AUDITOR_UID_UNRESOLVED');
  const auditorId=matches[0].auditorId;
  if(actor.role==='auditor'&&actor.auditorId!==auditorId)throw Error('PLANNING_ATOMIC_AUDITOR_OWNERSHIP_DENIED');
  const operationId=hash(JSON.stringify({auditId,auditorId,actorId:actor.auditorId,sourceRevision:body.sourceRevision,body}));
  const replay=await atomicStore.readOutbox(operationId);
  if(replay){
   if(replay.auditId!==auditId||replay.actorId!==actor.auditorId)throw Error('PLANNING_ATOMIC_REPLAY_IDENTITY_CONFLICT');
   if(replay.state==='PROJECTED')return {success:true,idempotent:true,auditId,operationId,authority:'FIRESTORE',projection:'PROJECTED'};
   throw Error('PLANNING_ATOMIC_OUTBOX_RECOVERY_REQUIRED');
  }
  const leaseActor={role:actor.role,id:actor.auditorId};
  let lease=null,lock=null,transactionAttempted=false,committed=false,projected=false;
  try{
   lease=await availabilityService.acquirePlanningLease({actor:leaseActor,auditorId,auditId,auditorEmail,plannedBlocks:body.blocks});
   hardGate({document:lease.document,blocks:body.blocks});
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'ATOMIC_PLANNING'});
   const preview=await preflight({actor,body:{...body,authorityPreflight:true}});
   if(preview?.authorityPreflight!==true||preview?.success!==true||preview.auditId!==auditId||!preview.canonicalSnapshot||!Array.isArray(preview.projectionWrites)||!Array.isArray(preview.projectionPreconditions))throw Error('PLANNING_ATOMIC_PREFLIGHT_NOT_AUTHORITATIVE');
   if(preview.expectedSourceRevision!==trim(body.sourceRevision))throw Error('PLANNING_ATOMIC_SOURCE_REVISION_CONFLICT');
   const previous=await atomicStore.readAudit(auditId);
   if(!previous||!Number.isSafeInteger(previous.revision)||previous.pendingOperationId)throw Error('PLANNING_ATOMIC_BACKFILL_OR_PROJECTION_REQUIRED');
   if(previous.snapshot?.sourceRevision!==preview.expectedSourceRevision)throw Error('PLANNING_ATOMIC_CANONICAL_PARITY_CONFLICT');
   const notificationIntents=preview.notificationIntents||[];
   if(!Array.isArray(notificationIntents)||!notificationIntents.length)throw Error('PLANNING_NOTIFICATION_OUTBOX_REQUIRED');
   const appendIntents=[{range:'Notification Queue!A:M',values:notificationIntents}];
   const nextSnapshot={...preview.canonicalSnapshot,projectionWrites:preview.projectionWrites,projectionPreconditions:preview.projectionPreconditions,appendIntents};
   transactionAttempted=true;
   const accepted=await atomicStore.commit({auditId,operationId,actorId:actor.auditorId,expectedRevision:previous.revision,nextSnapshot,auditorId,blocks:body.blocks,action:'PLAN'});
   committed=true;
   if(accepted.replayed)throw Error('PLANNING_ATOMIC_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan:nextSnapshot});
   const inspection=await projector.inspect(nextSnapshot);
   if(inspection.state!=='MATCH')throw Error('PLANNING_ATOMIC_PROJECTION_NOT_VERIFIED');
   await appendProjector.apply({operationId,gateToken:lock.token,intents:appendIntents});
   const appendEvidence=await appendProjector.inspect(appendIntents);
   if(appendEvidence.state!=='MATCH')throw Error('PLANNING_ATOMIC_APPEND_UNVERIFIED');
   const proof={verified:true,auditId,rowHash:hash(JSON.stringify({rows:inspection.detail,appendCount:appendEvidence.count}))};
   await atomicStore.markProjected({auditId,operationId,proof});
   projected=true;
   await availabilityService.releasePlanningLease({actor:leaseActor,auditorId,token:lease.token});
   lease=null;
   await gate.release({token:lock.token,verified:true,proof:'VERIFIED_FIRESTORE_AND_SHEETS'});
   lock=null;
   return {success:true,auditId,operationId,authority:'FIRESTORE',projection:'PROJECTED',revision:accepted.revision};
  }finally{
   // Cleanup is evidence-aware: a timeout during or after Firestore commit may
   // have succeeded. No lock can be released on guessed outcome.
   try{
    if(lease){
     if(!transactionAttempted)await availabilityService.releasePlanningLease({actor:leaseActor,auditorId,token:lease.token});
     else await availabilityService.markPlanningLeaseUncertain({actor:leaseActor,auditorId,token:lease.token,reason:projected?'LEASE_RELEASE_FAILED':'ATOMIC_WRITE_OUTCOME_UNCERTAIN'});
    }
   }finally{
    if(lock){
     if(!transactionAttempted)await gate.release({token:lock.token,verified:true,proof:'VALIDATION_FAILED_BEFORE_WRITE'});
     else if(projected)await gate.release({token:lock.token,verified:true,proof:'PROJECTED_WITH_LEASE_ERROR'});
     else{
      if(committed)await atomicStore.markUncertain({auditId,operationId,reason:'PROJECTION_OUTCOME_UNCERTAIN'}).catch(()=>{});
      await gate.uncertain({token:lock.token,reason:'FIRESTORE_OR_SHEETS_OUTCOME_UNKNOWN'});
     }
    }
   }
  }
 }
 return Object.freeze({commit});
}
