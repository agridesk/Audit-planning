/** Firestore-first DEV lifecycle coordinator.
 * Existing R4 business rules run in a read-only preview. The complete row
 * change, occupancy claims, and outbox are then committed atomically.
 * Fail closed for multi-audit effects or side effects not captured in preview.
 */
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const str=x=>String(x??'').trim();
const statuses=new Set(['PENDING_APPROVAL','APPROVED','ACCEPTED']);
const norm=x=>str(x).toUpperCase().replace(/[\s-]+/g,'_');
const actions=new Set(['APPROVE','ACCEPT','REJECT','CANCEL','COMPLETE']);
export function createPlanningLifecycleAtomicService({atomicStore,gate,projector,appendProjector,preflight,roster}={}){
 if(typeof atomicStore?.commit!=='function'||typeof atomicStore?.readAudit!=='function'||typeof atomicStore?.markProjected!=='function'||typeof atomicStore?.readOutbox!=='function'||typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||typeof gate?.uncertain!=='function'||typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function'||typeof preflight!=='function'||typeof roster!=='function')throw Error('LIFECYCLE_ATOMIC_CONFIG_INVALID');
 async function commit({actor,body,action}){
  action=norm(action);
  if(!['manager','auditor'].includes(actor?.role)||!str(actor?.auditorId)||!actions.has(action)||!body||!str(body.auditId)||actor.role==='auditor'&&!['ACCEPT','CANCEL','COMPLETE'].includes(action))throw Error('LIFECYCLE_ATOMIC_FORBIDDEN');
  const auditId=str(body.auditId),operationId=hash({auditId,actorId:actor.auditorId,action,body});
  const replay=await atomicStore.readOutbox(operationId);
  if(replay){
   if(replay.auditId!==auditId||replay.actorId!==actor.auditorId||replay.action!==action)throw Error('LIFECYCLE_ATOMIC_REPLAY_IDENTITY_CONFLICT');
   if(replay.state==='PROJECTED')return {success:true,idempotent:true,operationId,auditId,action,authority:'FIRESTORE',projection:'PROJECTED'};
   throw Error('LIFECYCLE_ATOMIC_RECOVERY_REQUIRED');
  }
  let lock=null,attempted=false,committed=false,projected=false;
  try{
   lock=await gate.acquire({operationId,actorId:actor.auditorId,kind:'ATOMIC_LIFECYCLE_'+action});
   const preview=await preflight({actor,body:{...body,authorityPreflight:true},action});
   if(preview?.authorityPreflight!==true||preview?.success!==true||preview?.auditId!==auditId)throw Error('LIFECYCLE_ATOMIC_PREFLIGHT_INVALID');
   if(preview.idempotent===true)throw Error('LIFECYCLE_ATOMIC_LEGACY_REPLAY_UNVERIFIED');
   if(!Array.isArray(preview.projectionWrites)||!preview.projectionWrites.length||!Array.isArray(preview.projectionPreconditions)||!preview.canonicalSnapshot||!Array.isArray(preview.appendIntents))throw Error('LIFECYCLE_ATOMIC_PREFLIGHT_INCOMPLETE');
   const old=await atomicStore.readAudit(auditId);
   if(!old||!Number.isSafeInteger(old.revision)||old.pendingOperationId||old.snapshot?.sourceRevision!==preview.expectedSourceRevision)throw Error('LIFECYCLE_ATOMIC_CANONICAL_PARITY_CONFLICT');
   if(old.snapshot?.legacyUnverified===true)throw Error('LIFECYCLE_LEGACY_UNVERIFIED_BLOCKED');
   if(actor.role==='auditor'){
    const before=norm(old.snapshot?.status);
    const required={ACCEPT:'APPROVED',CANCEL:'PENDING_APPROVAL',COMPLETE:'ACCEPTED'}[action];
    if(!required||before!==required||old.auditorId!==actor.auditorId)throw Error('LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED');
   }
   const snapshot={...preview.canonicalSnapshot,projectionWrites:preview.projectionWrites,projectionPreconditions:preview.projectionPreconditions,appendIntents:preview.appendIntents};
   const status=norm(snapshot.status);
   let auditorId=null,blocks=[];
   if(statuses.has(status)){
    const email=str(snapshot.assignedTo).toLowerCase();
    const matching=(await roster()).filter(x=>x.role==='auditor'&&x.active!==false&&str(x.email).toLowerCase()===email);
    if(matching.length!==1||!str(matching[0].auditorId))throw Error('LIFECYCLE_ATOMIC_AUDITOR_IDENTITY_UNRESOLVED');
    auditorId=matching[0].auditorId;
    const head=snapshot.headers||[],row=snapshot.row||[];
    const jsonIndex=head.findIndex(x=>str(x).toLowerCase().replace(/[^a-z0-9]/g,'')==='planningjson');
    if(jsonIndex<0)throw Error('LIFECYCLE_ATOMIC_PLANNING_JSON_MISSING');
    let parsed;try{parsed=JSON.parse(str(row[jsonIndex]));}catch{throw Error('LIFECYCLE_ATOMIC_PLANNING_JSON_INVALID');}
    const raw=Array.isArray(parsed)?parsed:parsed?.blocks;
    if(!Array.isArray(raw)||!raw.length)throw Error('LIFECYCLE_ATOMIC_PLANNING_BLOCKS_MISSING');
    blocks=raw.map(x=>({date:str(x.date),start:str(x.start),end:str(x.end)}));
   }
   if(actor.role==='auditor'&&action==='ACCEPT'&&auditorId!==actor.auditorId)throw Error('LIFECYCLE_ATOMIC_AUDITOR_OWNERSHIP_DENIED');
   attempted=true;
   const receipt=await atomicStore.commit({auditId,operationId,actorId:actor.auditorId,action,expectedRevision:old.revision,nextSnapshot:snapshot,auditorId,blocks});
   committed=true;
   if(receipt.replayed)throw Error('LIFECYCLE_ATOMIC_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan:snapshot});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:snapshot.appendIntents});
   const rows=await projector.inspect(snapshot),appends=await appendProjector.inspect(snapshot.appendIntents);
   if(rows.state!=='MATCH'||appends.state!=='MATCH')throw Error('LIFECYCLE_ATOMIC_PROJECTION_UNVERIFIED');
   const proof={verified:true,auditId,rowHash:hash({rows:rows.detail,appends:appends.count})};
   await atomicStore.markProjected({auditId,operationId,proof});
   projected=true;
   await gate.release({token:lock.token,verified:true,proof:'LIFECYCLE_FIRESTORE_AND_SHEETS_VERIFIED'});
   lock=null;
   return {success:true,action,auditId,operationId,revision:receipt.revision,authority:'FIRESTORE',projection:'PROJECTED'};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'LIFECYCLE_PREFLIGHT_FAILED_BEFORE_WRITE'});
    else if(projected)await gate.release({token:lock.token,verified:true,proof:'LIFECYCLE_PROJECTED_RELEASE_FAILED'});
    else{
     if(committed)await atomicStore.markUncertain({auditId,operationId,reason:'LIFECYCLE_PROJECTOR_OUTCOME_UNKNOWN'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'LIFECYCLE_COMMIT_OR_PROJECTION_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
