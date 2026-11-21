/** Issue #87: DEV-only canonical Self planning toggle.
 * One Firestore audit transaction + fenced projection of the toggle cell.
 * Existing legacy route remains unchanged whenever atomic authority is off.
 */
import {createHash} from 'node:crypto';
const clean=x=>String(x??'').trim();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalizedRow=value=>{const row=(value||[]).map(x=>String(x??''));while(row.length&&row.at(-1)==='')row.pop();return row;};
const sameRow=(a,b)=>JSON.stringify(normalizedRow(a))===JSON.stringify(normalizedRow(b));
const normalizedHeaders=value=>{const headers=(value||[]).map(clean);while(headers.length&&headers.at(-1)==='')headers.pop();return headers;};
export function createAtomicSelfPlanningService20({store,gate,preflight,projector}={}){
 if(typeof store?.readAudit!=='function'||typeof store?.readOutbox!=='function'||
    typeof store?.commit!=='function'||typeof store?.markProjected!=='function'||
    typeof gate?.acquire!=='function'||typeof gate?.release!=='function'||
    typeof gate?.uncertain!=='function'||typeof preflight!=='function'||
    typeof projector?.apply!=='function'||typeof projector?.inspect!=='function')
  throw Error('SELF_PLANNING_ATOMIC_CONFIG_INVALID');
 async function commit({actor,body,onCommitted}={}){
  const auditId=clean(body?.auditId),actorId=clean(actor?.auditorId||actor?.uid);
  if(actor?.role!=='manager'||!actorId||!auditId||!clean(body?.expectedRevision)||
     typeof body.allowSelfPlanning!=='boolean'||typeof body.expectedAllowSelfPlanning!=='boolean')
   throw Error('SELF_PLANNING_ATOMIC_INPUT_INVALID');
  const requestId=body.requestId;
  if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-f0-9-]{36}$/i.test(requestId)))
   throw Error('SELF_PLANNING_ATOMIC_REQUEST_ID_INVALID');
  const operationId=digest({kind:'SELF_PLANNING',auditId,actorId,
   sourceRevision:body.expectedRevision,from:body.expectedAllowSelfPlanning,to:body.allowSelfPlanning,...(requestId?{requestId}:{})});
  const prior=await store.readOutbox(operationId);
  if(prior){
   if(prior.auditId!==auditId||prior.actorId!==actorId)throw Error('SELF_PLANNING_ATOMIC_REPLAY_IDENTITY_CONFLICT');
   if(prior.state==='PROJECTED')return {success:true,auditId,allowSelfPlanning:body.allowSelfPlanning,
    idempotent:true,authority:'FIRESTORE',projection:'PROJECTED'};
   throw Error('SELF_PLANNING_ATOMIC_RECOVERY_REQUIRED');
  }
  const started=Date.now(),timings={};
  const measure=async(name,run)=>{
   const start=Date.now();
   try{return await run();}finally{timings[name]=Date.now()-start;}
  };
  let lock=null,attempted=false,committed=false,projected=false;
  try{
   lock=await measure('gateMs',()=>gate.acquire({operationId,actorId,kind:'ATOMIC_SELF_PLANNING'}));
   const previous=await measure('auditMs',()=>store.readAudit(auditId));
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
   const proof=await measure('preflightMs',()=>preflight({actor,body:{...body,authorityPreflight:true}}));
   if(proof?.success!==true||proof?.authorityPreflight!==true||proof.auditId!==auditId||
      proof.expectedSourceRevision!==body.expectedRevision||proof.allowSelfPlanning!==body.allowSelfPlanning||
      proof.canonicalSnapshot?.auditId!==auditId||proof.canonicalSnapshot.status!=='Pending Planning')
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_IDENTITY_OR_STATUS_INVALID');
   if(!Array.isArray(proof.projectionWrites)||proof.projectionWrites.length!==1||
      !Array.isArray(proof.projectionPreconditions)||proof.projectionPreconditions.length!==1||
      proof.appendIntents?.length)
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_WRITESET_INVALID');
   // A Self planning mutation may write only its own toggle cell.
   // Independently compare the entire source row to the canonical snapshot,
   // without submitting unrelated hour/date fields to Sheets for rewriting.
   const column=proof.canonicalSnapshot.headers.findIndex(x=>/^allow self planning$/i.test(clean(x)));
   const sourceRow=Number(proof.canonicalSnapshot.sourceRow);
   const cellRange='Audit planning!AD'+sourceRow;
   const beforeCell=proof.projectionPreconditions[0];
   const afterCell=proof.projectionWrites[0];
   if(column!==29||!Number.isSafeInteger(sourceRow)||sourceRow<2||
      beforeCell.range!==cellRange||afterCell.range!==cellRange||
      beforeCell.before?.length!==1||afterCell.values?.length!==1||
      afterCell.values[0]?.length!==1||
      clean(beforeCell.before[0])!==clean(previous.snapshot.row[column])||
      clean(afterCell.values[0][0])!==(body.allowSelfPlanning?'Yes':'No')||
      !Array.isArray(proof.canonicalSnapshot.row))
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_CELL_CONTRACT_INVALID');
   const untouched=proof.canonicalSnapshot.row.slice();
   untouched[column]=beforeCell.before[0];
   const previousRow=previous.snapshot.row;
   const unformatted=proof.sourceUnformattedRow;
   if(!sameRow(untouched,previousRow)&&(!Array.isArray(unformatted)||!sameRow(unformatted,previousRow))){
    const old=normalizedRow(previousRow),formatted=normalizedRow(untouched);
    const differingColumns=Array.from({length:Math.max(old.length,formatted.length)},(_,i)=>i)
     .filter(i=>(old[i]??'')!==(formatted[i]??'')).map(i=>i+1);
    console.warn('[AMS_SELF_PLANNING_SOURCE_PARITY]',JSON.stringify({differingColumns:differingColumns.slice(0,12),
     differingColumnCount:differingColumns.length,unformattedAvailable:Array.isArray(unformatted)}));
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_SOURCE_ROW_MISMATCH');
   }
   if(JSON.stringify(normalizedHeaders(proof.canonicalSnapshot.headers))!==JSON.stringify(normalizedHeaders(previous.snapshot.headers)))
    throw Error('SELF_PLANNING_ATOMIC_PREFLIGHT_HEADER_MISMATCH');
   const row=previousRow.slice();
   row[column]=afterCell.values[0][0];
   const snapshot={...previous.snapshot,...proof.canonicalSnapshot,row,
    projectionWrites:proof.projectionWrites,projectionPreconditions:proof.projectionPreconditions,
    appendIntents:[]};
   attempted=true;
   const receipt=await measure('commitMs',()=>store.commit({auditId,operationId,actorId,expectedRevision:previous.revision,
    nextSnapshot:snapshot,auditorId:null,blocks:[],action:'SELF_PLANNING'}));
   committed=true;
   if(receipt.replayed)throw Error('SELF_PLANNING_ATOMIC_UNEXPECTED_REPLAY');
   if(onCommitted){
    try{onCommitted({auditId,operationId,action:'SELF_PLANNING',
     allowSelfPlanning:body.allowSelfPlanning,sourceRevision:snapshot.sourceRevision});}
    catch{console.warn('[AMS_SELF_PLANNING_RECEIPT_FAILED]');}
   }
   await measure('projectionMs',()=>projector.apply({operationId,gateToken:lock.token,plan:snapshot}));
   const verified=await measure('verifyMs',()=>projector.inspect(snapshot));
   if(verified.state!=='MATCH')throw Error('SELF_PLANNING_ATOMIC_PROJECTION_NOT_VERIFIED');
   await store.markProjected({auditId,operationId,
    proof:{verified:true,auditId,rowHash:digest({rows:verified.detail,kind:'SELF_PLANNING'})}});
   projected=true;
   await gate.release({token:lock.token,verified:true,proof:'SELF_PLANNING_FIRESTORE_AND_SHEETS_VERIFIED'});lock=null;
   return {success:true,auditId,allowSelfPlanning:body.allowSelfPlanning,
    sourceRevision:snapshot.sourceRevision,authority:'FIRESTORE',projection:'PROJECTED',revision:receipt.revision};
  }catch(error){
   error.operationId=operationId;
   error.writeOutcome=projected?'PROJECTED':committed?'COMMITTED':attempted?'UNKNOWN':'NOT_COMMITTED';
   throw error;
  }finally{
   console.info('[AMS_SELF_PLANNING_TIMING]',JSON.stringify({operationId,...timings,totalMs:Date.now()-started,projected}));
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
