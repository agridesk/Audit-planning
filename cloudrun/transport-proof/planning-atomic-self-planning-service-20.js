/** Issue #87: DEV-only canonical Self planning toggle.
 * One Firestore audit transaction + fenced full-row Sheets projection.
 * Existing legacy route remains unchanged whenever atomic authority is off.
 */
import {createHash} from 'node:crypto';
const clean=x=>String(x??'').trim();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createAtomicSelfPlanningService20({store,gate,preflight,projector}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.readOutbox!=='function'||
    typeof store?.commit!=='function'||typeof store?.markProjected!=='function'||
    typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||
    typeof gate?.uncertain!=='function'||typeof preflight!=='function'||
    typeof projector?.apply!=='function'||typeof projector?.inspect!=='function')
  throw Error('SELF_PLANNING_ATOMIC_CONFIG_INVALID');
 async function commit({actor,body}={}){
  const auditId=clean(body?.auditId),actorId=clean(actor?.auditorId||actor?.uid);
  if(actor?.role!=='manager'||!actorId||!auditId||!clean(body?.expectedRevision)||
     typeof body.allowSelfPlanning!=='boolean'||typeof body.expectedAllowSelfPlanning!=='boolean')
   throw Error('SELF_PLANNING_ATOMIC_INPUT_INVALID');
  const operationId=digest({kind:'SELF_PLANNING',auditId,actorId,
   sourceRevision:body.expectedRevision,from:body.expectedAllowSelfPlanning,to:body.allowSelfPlanning});
  const prior=await store.readOutbox(operationId);
  if(prior){
   if(prior.auditId!==auditId||prior.actorId!==actorId)throw Error('SELF_PLANNING_ATOMIC_REPLAY_IDENTITY_CONFLICT');
   if(prior.state==='PROJECTED')return {success:true,auditId,allowSelfPlanning:body.allowSelfPlanning,
    idempotent:true,authority:'FIRESTORE',projection:'PROJECTED'};
   throw Error('SELF_PLANNING_ATOMIC_RECOVERY_REQUIRED');
  }
  let lock=null,attempted=false,projected=false;
  try{
   lock=await gate.acquire({operationId,actorId,kind:'ATOMIC_SELF_PLANNING'});
   const previous=await store.readAudit(auditId);
   if(!previous||!Number.isSafeInteger(previous.revision)||previous.pendingOperationId||
      previous.removed||previous.snapshot?.status!=='Pending Planning'||
      previous.snapshot?.sourceRevision!==body.expectedRevision||
      !Array.isArray(previous.snapshot?.row)||!Array.isArray(previous.snapshot?.headers)||
      !Array.isArray(previous.claimIds)||previous.claimIds.length||
      !Array.isArray(previous.blocks)||previous.blocks.length)
    throw Error('SELF_PLANNING_ATOMIC_BACKFILL_OR_PARITY_REQUIRED');
   if(body.allowSelfPlanning===body.expectedAllowSelfPlanning){
    const index=previous.snapshot.headers.findIndex(x=>/^allow self planning$/i.test(clean(x)));
    if(index<0||!['yes','true','1'].includes(clean(previous.snapshot.row[index]).toLowerCase())!==!body.allowSelfPlanning)
     throw Error('SELF_PLANNING_ATOMIC_NOOP_PARITY_UNVERIFIED');
    await gate.release({token:lock.token,verified:true,proof:'SELF_PLANNING_NO_CHANGE'});lock=null;
    return {success:true,auditId,allowSelfPlanning:body.allowSelfPlanning,unchanged:true,
     sourceRevision:body.expectedRevision,authority:'FIRESTORE'};
   }
   const proof=await preflight({actor,body:{...body,authorityPreflight:true}});
   if(proof?.success!==true||proof?.authorityPreflight!==true||
      proof.auditId!==auditId||proof.expectedSourceRevision!==body.expectedRevision||
      proof.allowSelfPlanning!==body.allowSelfPlanning||
      proof.canonicalSnapshot?.auditId!==auditId||proof.canonicalSnapshot.status!=='Pending Planning'||
      !Array.isArray(proof.projectionWrites)||proof.projectionWrites.length!==1||
      !Array.isArray(proof.projectionPreconditions)||proof.projectionPreconditions.length!==1||
      JSON.stringify(proof.projectionPreconditions[0].before)!==JSON.stringify(previous.snapshot.row)||
      JSON.stringify(proof.canonicalSnapshot.headers)!==JSON.stringify(previous.snapshot.headers)||
      proof.appendIntents?.length)
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_NOT_AUTHORITATIVE');
   const snapshot={...proof.canonicalSnapshot,
    projectionWrites:proof.projectionWrites,projectionPreconditions:proof.projectionPreconditions,
    appendIntents:[]};
   attempted=true;
   const receipt=await store.commit({auditId,operationId,actorId,expectedRevision:previous.revision,
    nextSnapshot:snapshot,auditorId:null,blocks:[],action:'SELF_PLANNING'});
   if(receipt.replayed)throw Error('SELF_PLANNING_ATOMIC_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan:snapshot});
   const verified=await projector.inspect(snapshot);
   if(verified.state!=='MATCH')throw Error('SELF_PLANNING_ATOMIC_PROJECTION_NOT_VERIFIED');
   await store.markProjected({auditId,operationId,
    proof:{verified:true,auditId,rowHash:digest({rows:verified.detail,kind:'SELF_PLANNING'})}});
   projected=true;
   await gate.release({token:lock.token,verified:true,proof:'SELF_PLANNING_FIRESTORE_AND_SHEETS_VERIFIED'});lock=null;
   return {success:true,auditId,allowSelfPlanning:body.allowSelfPlanning,
    sourceRevision:snapshot.sourceRevision,authority:'FIRESTORE',projection:'PROJECTED',revision:receipt.revision};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'SELF_PLANNING_PREFLIGHT_REJECTED'});
    else if(projected)await gate.release({token:lock.token,verified:true,proof:'SELF_PLANNING_PROJECTED'});
    else{
     if(typeof store.markUncertain==='function')
      await store.markUncertain({auditId,operationId,reason:'SELF_PLANNING_PROJECTION_UNVERIFIED'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'SELF_PLANNING_COMMIT_OR_PROJECTION_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
