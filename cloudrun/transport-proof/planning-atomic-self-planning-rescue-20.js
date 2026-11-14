/** Single-op DEV rescue of a blocked Self planning toggle.
 * Safely projects ONLY Audit planning!AD7, never hours in S7 or another cell.
 * All external mutation is fenced and read-back verified.
 */
import {createHash} from 'node:crypto';
const OP='fa914e8c46ad1ded6d364868f7154059b48af2c36ba51609a6cae1838f35dec4';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clean=x=>String(x??'').trim();
const errorCode=e=>String(e?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,90);
export function createAtomicSelfPlanningRescue20({store,gate,projector,readHeaders,readHour,writeToggle}={}){
 if([store?.readOutbox,store?.readAudit,store?.markProjected,gate?.beginRecovery,
 gate?.finishRecovery,gate?.release,gate?.read,projector?.inspect,
 projector?.inspectDiff,readHeaders,readHour,writeToggle].some(fn=>typeof fn!=='function'))
  throw Error('SELF_PLANNING_RESCUE_CONFIG_INVALID');
 const expectedRow='Audit planning!A7:BS7';
 const cell='Audit planning!AD7';
 async function commit({operationId}={}){
  if(operationId!==OP)throw Error('SELF_PLANNING_RESCUE_OPERATION_DENIED');
  const entry=await store.readOutbox(operationId);
  const snapshot=entry?.snapshot,audit=await store.readAudit(entry?.auditId);
  if(entry?.state!=='UNCERTAIN'||entry.action!=='SELF_PLANNING'||entry.multi===true||
     !snapshot||snapshot.projectionWrites?.length!==1||
     snapshot.projectionPreconditions?.length!==1||snapshot.appendIntents?.length!==0||
     snapshot.projectionWrites[0]?.range!==expectedRow||
     snapshot.projectionPreconditions[0]?.range!==expectedRow||
     !Array.isArray(snapshot.projectionWrites[0]?.values?.[0])||
     !Array.isArray(snapshot.projectionPreconditions[0]?.before)||
     !audit||audit.pendingOperationId!==operationId||audit.revision!==entry.revision)
   throw Error('SELF_PLANNING_RESCUE_CANONICAL_INVALID');
  const target=snapshot.projectionWrites[0].values[0];
  const before=snapshot.projectionPreconditions[0].before;
  if(target.length<30||before.length<30||target.length!==before.length||
     !['Yes','No'].includes(clean(target[29]))||!['Yes','No'].includes(clean(before[29]))||
     clean(target[29])===clean(before[29])||
     target.some((v,i)=>i!==29&&String(v??'')!==String(before[i]??'')))
   throw Error('SELF_PLANNING_RESCUE_NOT_SINGLE_CELL');
  const h=await readHeaders();
  if(h?.S!=='Total audit time in hours'||h.AD!=='Allow self planning')
   throw Error('SELF_PLANNING_RESCUE_SCHEMA_CHANGED');
  const first=await projector.inspectDiff(snapshot);
  if(first.length!==1||first[0].range!==expectedRow||
     first[0].differingCount!==2||
     first[0].differing?.length!==2||
     first[0].differing[0].column!==19||
     first[0].differing[0].actualType!=='number'||
     first[0].differing[1].column!==30||
     first[0].differing[1].matchesBefore!==true)
   throw Error('SELF_PLANNING_RESCUE_UNEXPECTED_ROW_DIFFERENCE');
  const narrow={projectionWrites:[{range:cell,values:[[target[29]]]}],
   projectionPreconditions:[{range:cell,before:[before[29]]}]};
  if((await projector.inspect(narrow)).state!=='READY')
   throw Error('SELF_PLANNING_RESCUE_TOGGLE_CHANGED');
  const hour=await readHour();
  if(typeof hour!=='number'||!Number.isFinite(hour))
   throw Error('SELF_PLANNING_RESCUE_HOUR_NOT_NUMERIC');
  const gateBefore=await gate.read();
  if(gateBefore.holder?.operationId!==operationId||gateBefore.holder.state!=='UNCERTAIN')
   throw Error('SELF_PLANNING_RESCUE_GATE_NOT_UNCERTAIN');
  const holder=await gate.beginRecovery({operationId});
  let stage='RECHECK';
  try{
   const recent=await store.readOutbox(operationId),current=await store.readAudit(entry.auditId);
   if(recent?.state!=='UNCERTAIN'||current?.pendingOperationId!==operationId||
      current.revision!==entry.revision)throw Error('SELF_PLANNING_RESCUE_CAS_CHANGED');
   if((await projector.inspect(narrow)).state!=='READY'||(await readHour())!==hour)
    throw Error('SELF_PLANNING_RESCUE_SOURCE_CHANGED');
   stage='WRITE_TOGGLE';
   await writeToggle({operationId,token:holder.token,cell,value:target[29]});
   stage='VERIFY';
   if((await projector.inspect(narrow)).state!=='MATCH'||(await readHour())!==hour)
    throw Error('SELF_PLANNING_RESCUE_VERIFY_FAILED');
   const finalDiff=await projector.inspectDiff(snapshot);
   if(finalDiff.length!==1||finalDiff[0].differingCount!==1||
      finalDiff[0].differing?.[0]?.column!==19||
      finalDiff[0].differing?.[0]?.actualType!=='number')
    throw Error('SELF_PLANNING_RESCUE_OTHER_CELLS_CHANGED');
   stage='SETTLE';
   const lock=await gate.read();
   if(lock.holder?.token!==holder.token||lock.holder.state!=='RECOVERING'||
      lock.holder.operationId!==operationId)throw Error('SELF_PLANNING_RESCUE_FENCE_LOST');
   await store.markProjected({auditId:entry.auditId,operationId,proof:{
    verified:true,auditId:entry.auditId,
    rowHash:hash({operationId,projection:'ONLY_AD7',toggle:target[29],unchangedHour:hour})
   }});
   stage='UNLOCK';
   await gate.finishRecovery({operationId,token:holder.token});
   await gate.release({token:holder.token,verified:true,proof:'SELF_PLANNING_AD7_CAS_VERIFIED'});
  }catch(error){
   const code=errorCode(error);
   if(typeof gate.recordRecoveryFailure==='function')
    await gate.recordRecoveryFailure({operationId,token:holder.token,stage,code}).catch(()=>{});
   console.error('[AMS_SELF_PLANNING_RESCUE_FAILED]',JSON.stringify({stage,code,operationId}));
   throw Error('SELF_PLANNING_RESCUE_STOPPED_'+stage+'_'+code);
  }
  return {success:true,operationId,projected:true,recovered:true};
 }
 return Object.freeze({commit});
}
