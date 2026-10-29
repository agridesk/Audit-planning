/** DEV Firestore-authoritative audit transfer.
 * Reuses the legacy manager's eligibility/qualification/rotation checks in a
 * read-only preflight. Atomically revokes old auditor occupancy and stages
 * the transfer row + notification in the durable Firestore outbox.
 */
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const txt=x=>String(x??'').trim();
export function createPlanningAtomicTransferService({store,gate,projector,appendProjector,preflight}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.readOutbox!=='function'||typeof store?.commitMulti!=='function'||typeof store?.markProjected!=='function'||typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||typeof gate?.uncertain!=='function'||typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function'||typeof preflight!=='function')throw Error('TRANSFER_ATOMIC_CONFIG_INVALID');
 async function commit({actor,body}){
  if(actor?.role!=='manager'||!txt(actor.auditorId)||!txt(body?.auditId)||!txt(body?.fromEmail)||!txt(body?.toEmail)||txt(body.fromEmail).toLowerCase()===txt(body.toEmail).toLowerCase())throw Error('TRANSFER_ATOMIC_REQUEST_FORBIDDEN');
  const auditId=txt(body.auditId),operationId=sha({auditId,body,actorId:actor.auditorId,action:'TRANSFER'});
  const replay=await store.readOutbox(operationId);
  if(replay){
   if(replay.actorId!==actor.auditorId||replay.auditId!==auditId||replay.action!=='TRANSFER')throw Error('TRANSFER_ATOMIC_REPLAY_CONFLICT');
   if(replay.state==='PROJECTED')return {ok:true,success:true,idempotent:true,operationId,auditId,authority:'FIRESTORE'};
   throw Error('TRANSFER_ATOMIC_RECONCILIATION_REQUIRED');
  }
  let lock=null,attempted=false,committed=false,projected=false;
  try{
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'ATOMIC_TRANSFER'});
   const preview=await preflight({actor,body:{...body,authorityPreflight:true}});
   if(preview?.success!==true||preview?.authorityPreflight!==true||preview?.auditId!==auditId||preview?.action!=='TRANSFER'||preview?.toEmail!==txt(body.toEmail).toLowerCase()||preview?.fromEmail!==txt(body.fromEmail).toLowerCase()||!preview.canonicalSnapshot||!Array.isArray(preview.projectionWrites)||!preview.projectionWrites.length||!Array.isArray(preview.projectionPreconditions)||!Array.isArray(preview.appendIntents)||!preview.appendIntents.length)throw Error('TRANSFER_ATOMIC_PREFLIGHT_INVALID');
   const old=await store.readAudit(auditId);
   if(!old||!Number.isSafeInteger(old.revision)||old.pendingOperationId||old.snapshot?.sourceRevision!==preview.expectedSourceRevision||old.snapshot?.legacyUnverified)throw Error('TRANSFER_ATOMIC_CANONICAL_REVISION_CONFLICT');
   const status=String(preview.canonicalSnapshot.status||'').toUpperCase().replace(/[\s-]/g,'_');
   if(status!=='PENDING_APPROVAL'||txt(preview.canonicalSnapshot.assignedTo))throw Error('TRANSFER_ATOMIC_TARGET_STATE_INVALID');
   const plan={...preview.canonicalSnapshot,projectionWrites:preview.projectionWrites,projectionPreconditions:preview.projectionPreconditions,appendIntents:preview.appendIntents};
   attempted=true;
   const receipt=await store.commitMulti({operationId,actorId:actor.auditorId,action:'TRANSFER',entities:[{auditId,expectedRevision:old.revision,remove:false,auditorId:null,blocks:[],nextSnapshot:plan}],projectionPlan:plan});
   committed=true;
   if(receipt.replayed)throw Error('TRANSFER_ATOMIC_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:plan.appendIntents});
   const rows=await projector.inspect(plan),appends=await appendProjector.inspect(plan.appendIntents);
   if(rows.state!=='MATCH'||appends.state!=='MATCH')throw Error('TRANSFER_ATOMIC_PROJECTION_UNVERIFIED');
   await store.markProjected({auditId,operationId,proof:{verified:true,auditId,rowHash:sha({rows:rows.detail,appends:appends.count})}});
   projected=true;
   await gate.release({token:lock.token,verified:true,proof:'TRANSFER_FIRESTORE_SHEETS_VERIFIED'});
   lock=null;
   return {ok:true,success:true,auditId,operationId,status:'Pending Approval',toEmail:preview.toEmail,authority:'FIRESTORE',projection:'PROJECTED',availabilityWarning:true};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'TRANSFER_VALIDATION_FAILED_BEFORE_WRITE'});
    else if(projected)await gate.release({token:lock.token,verified:true,proof:'TRANSFER_VERIFIED_RELEASE_FAILED'});
    else{
     if(committed)await store.markUncertain({auditId,operationId,reason:'TRANSFER_PROJECTOR_UNKNOWN'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'TRANSFER_FIRESTORE_OR_SHEETS_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
