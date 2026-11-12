/** Issue #87: EXT/Undo through the *same* Firestore planning owner.
 * Audit snapshot, outbox and complete Sheets projection are gated together.
 * Legacy direct EXT remains the fallback only while atomic mode is disabled.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createAtomicExtensionService20({store,gate,preflight,projector,appendProjector}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.readOutbox!=='function'||
    typeof store?.commit!=='function'||typeof store?.markProjected!=='function'||
    typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||
    typeof gate?.uncertain!=='function'||typeof preflight!=='function'||
    typeof projector?.apply!=='function'||typeof projector?.inspect!=='function'||
    typeof appendProjector?.apply!=='function'||typeof appendProjector?.inspect!=='function')
  throw Error('EXT_ATOMIC_SERVICE_CONFIG_INVALID');
 async function commit({actor,body}={}){
  const auditId=str(body?.auditId),obligationId=str(body?.obligationId),
   actorId=str(actor?.auditorId||actor?.uid),requestId=str(body?.requestId),
   command=str(body?.command);
  if(actor?.role!=='manager'||!actorId||!auditId||!str(body?.companyUid)||
     !obligationId||!requestId||requestId.length>180||
     !['apply','undo'].includes(command))
   throw Error('EXT_ATOMIC_INPUT_INVALID');
  const operationId=hash({kind:'MODEL_C_EXT',auditId,obligationId,command,requestId,actorId});
  const old=await store.readOutbox(operationId);
  if(old){
   if(old.auditId!==auditId||old.actorId!==actorId)throw Error('EXT_ATOMIC_REPLAY_IDENTITY_CONFLICT');
   if(old.state!=='PROJECTED')throw Error('EXT_ATOMIC_OUTBOX_RECOVERY_REQUIRED');
   return {ok:true,success:true,direct:true,auditId,obligationId,command,operationId,
    patch:old.snapshot?.scopeExtension?.patch,
    cbNotification:old.snapshot?.scopeExtension?.cbNotification,
    authority:'FIRESTORE',projection:'PROJECTED',idempotent:true};
  }
  let lock=null,attempted=false,projected=false;
  try{
   lock=await gate.acquire({operationId,actorId,kind:'ATOMIC_MODEL_C_EXT'});
   const previous=await store.readAudit(auditId);
   if(!previous||!Number.isSafeInteger(previous.revision)||previous.pendingOperationId||
      previous.removed||previous.snapshot?.status!=='Pending Planning'||
      !Array.isArray(previous.snapshot?.row)||!Array.isArray(previous.snapshot?.headers)||
      !Array.isArray(previous.blocks)||previous.blocks.length||
      !Array.isArray(previous.claimIds)||previous.claimIds.length)
    throw Error('EXT_ATOMIC_BACKFILL_OR_PARITY_REQUIRED');
   const proof=await preflight({actor,body:{...body,authorityPreflight:true}});
   if(proof?.success!==true||proof?.authorityPreflight!==true||
      proof.auditId!==auditId||proof.obligationId!==obligationId||
      proof.command!==command||proof.requestId!==requestId||
      proof.expectedSourceRevision!==previous.snapshot.sourceRevision||
      proof.canonicalSnapshot?.auditId!==auditId||
      proof.canonicalSnapshot?.status!=='Pending Planning'||
      !Array.isArray(proof.projectionWrites)||proof.projectionWrites.length!==9||
      !Array.isArray(proof.projectionPreconditions)||proof.projectionPreconditions.length!==9||
      !Array.isArray(proof.appendIntents)||proof.appendIntents.length!==1||
      proof.appendIntents[0]?.range!=='CB_Extension_Outbox!A:P'||
      JSON.stringify(proof.sourceRowBefore)!==JSON.stringify(previous.snapshot.row)||
      JSON.stringify(proof.canonicalSnapshot.headers)!==JSON.stringify(previous.snapshot.headers))
    throw Error('EXT_ATOMIC_PREFLIGHT_NOT_AUTHORITATIVE');
   const snapshot={...previous.snapshot,...proof.canonicalSnapshot,
    scopeExtension:{...proof.canonicalSnapshot.scopeExtension,patch:proof.patch,
     cbNotification:proof.cbNotification},
    projectionWrites:proof.projectionWrites,
    projectionPreconditions:proof.projectionPreconditions,
    appendIntents:proof.appendIntents};
   attempted=true;
   const receipt=await store.commit({auditId,operationId,actorId,expectedRevision:previous.revision,
    nextSnapshot:snapshot,auditorId:null,blocks:[],action:command==='apply'?'EXT_APPLY':'EXT_UNDO'});
   if(receipt.replayed)throw Error('EXT_ATOMIC_UNEXPECTED_REPLAY');
   await projector.apply({operationId,gateToken:lock.token,plan:snapshot});
   await appendProjector.apply({operationId,gateToken:lock.token,intents:snapshot.appendIntents});
   const rows=await projector.inspect(snapshot),
    appends=await appendProjector.inspect(snapshot.appendIntents);
   if(rows.state!=='MATCH'||appends.state!=='MATCH')
    throw Error('EXT_ATOMIC_PROJECTION_NOT_VERIFIED');
   await store.markProjected({auditId,operationId,proof:{
    verified:true,auditId,rowHash:hash({rows:rows.detail,appendCount:appends.count})}});
   projected=true;
   await gate.release({token:lock.token,verified:true,proof:'EXT_FIRESTORE_MODEL_C_CB_OUTBOX_VERIFIED'});lock=null;
   return {ok:true,success:true,direct:true,auditId,obligationId,command,operationId,
    patch:proof.patch,cbNotification:proof.cbNotification,
    authority:'FIRESTORE',projection:'PROJECTED',revision:receipt.revision};
  }finally{
   if(lock){
    if(!attempted)await gate.release({token:lock.token,verified:true,proof:'EXT_PREFLIGHT_REJECTED'});
    else if(projected)await gate.release({token:lock.token,verified:true,proof:'EXT_PROJECTED'});
    else{
     if(typeof store.markUncertain==='function')
      await store.markUncertain({auditId,operationId,reason:'EXT_PROJECTION_OR_OUTBOX_UNVERIFIED'}).catch(()=>{});
     await gate.uncertain({token:lock.token,reason:'EXT_ATOMIC_COMMIT_OR_PROJECTION_UNKNOWN'});
    }
   }
  }
 }
 return Object.freeze({commit});
}
