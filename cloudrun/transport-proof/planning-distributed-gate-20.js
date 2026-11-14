/** Durable single-writer gate for all DEV planning mutations.
 * One Firestore CAS document serializes incompatible legacy Sheets writes across
 * Cloud Run instances until their writes are migrated. No time-based lease stealing:
 * an expired process does not prove an in-flight Sheets write has ended.
 * Fail closed until reconciliation supplies independent proof.
 */
import {randomUUID} from 'node:crypto';
const clone=x=>structuredClone(x);
// Firestore reserves document IDs matching __.*__. Keep this gate ID legal.
const initial={auditorId:'planning-write-gate-v2',version:0,holder:null,lastCompleted:null};
export function createPlanningDistributedGate(adapter){
 if(typeof adapter?.read!=='function'||typeof adapter?.compareAndSwap!=='function')throw Error('PLANNING_GATE_ATOMIC_ADAPTER_REQUIRED');
 async function read(){
  const doc=await adapter.read(initial.auditorId)??clone(initial);
  if(doc.auditorId!==initial.auditorId||!Number.isSafeInteger(doc.version)||doc.version<0||!(doc.holder===null||doc.holder&&typeof doc.holder==='object'&&typeof doc.holder.token==='string'&&typeof doc.holder.operationId==='string'))throw Error('PLANNING_GATE_CORRUPT');
  return clone(doc);
 }
 async function acquire({operationId,actorId,kind}){
  if(!operationId||!actorId||!kind)throw Error('PLANNING_GATE_REQUEST_INVALID');
  const current=await read();
  if(current.holder)throw Error('PLANNING_GATE_BUSY');
  const token=randomUUID(),next={...current,version:current.version+1,holder:{token,operationId,actorId,kind,acquiredAt:new Date().toISOString(),state:'ACTIVE'}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_GATE_CONFLICT');
  return clone(next.holder);
 }
 async function uncertain({token,reason}){
  const current=await read();
  if(!current.holder||current.holder.token!==token)throw Error('PLANNING_GATE_TOKEN_MISMATCH');
  const next={...current,version:current.version+1,holder:{...current.holder,state:'UNCERTAIN',uncertainAt:new Date().toISOString(),reason:String(reason||'UNKNOWN').slice(0,100)}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_GATE_CONFLICT');
  return clone(next.holder);
 }
 /** An operator-verified crashed writer can be quarantined, not unlocked.
  * This must not be exposed as a general timeout override. The operator
  * supplies external Cloud Run evidence that the process/request ended.
  */
 async function quarantineOrphan({operationId,actorId,evidenceRef}){
  if(!operationId||!actorId||typeof evidenceRef!=='string'||evidenceRef.trim().length<24||evidenceRef.length>512)throw Error('PLANNING_ORPHAN_ATTESTATION_REQUIRED');
  const current=await read(),holder=current.holder;
  if(!holder||holder.operationId!==operationId||holder.state!=='ACTIVE')throw Error('PLANNING_ORPHAN_GATE_MISMATCH');
  const age=Date.now()-Date.parse(holder.acquiredAt||'');
  if(!Number.isFinite(age)||age<30*60*1000)throw Error('PLANNING_ORPHAN_TOO_RECENT');
  const next={...current,version:current.version+1,
   holder:{...holder,state:'UNCERTAIN',uncertainAt:new Date().toISOString(),
    operatorAttestation:{actorId:String(actorId).slice(0,180),evidenceRef:evidenceRef.trim(),at:new Date().toISOString()},
    reason:'MANUALLY_VERIFIED_TERMINATED_WRITER'}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_GATE_CONFLICT');
  return clone(next.holder);
 }
 async function release({token,verified,proof}){
  if(verified!==true||typeof proof!=='string'||proof.length<8)throw Error('PLANNING_GATE_RELEASE_EVIDENCE_REQUIRED');
  const current=await read();
  if(!current.holder||current.holder.token!==token)throw Error('PLANNING_GATE_TOKEN_MISMATCH');
  const next={...current,version:current.version+1,holder:null,lastCompleted:{operationId:current.holder.operationId,proof,at:new Date().toISOString()}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_GATE_CONFLICT');
  return clone(next.lastCompleted);
 }
 /** Single-operation, fenced recovery ownership: a quarantined writer can be
  * resumed only after independent 30-minute isolation. A second recovery
  * attempt cannot acquire the RECOVERING gate concurrently.
  */
 async function beginRecovery({operationId}){
  const current=await read(),holder=current.holder;
  if(!holder||holder.operationId!==operationId||holder.state!=='UNCERTAIN')throw Error('PLANNING_RECOVERY_GATE_NOT_QUARANTINED');
  const since=Date.parse(holder.uncertainAt||'');
  if(!Number.isFinite(since)||Date.now()-since<30*60*1000)throw Error('PLANNING_RECOVERY_QUARANTINE_ACTIVE');
  const next={...current,version:current.version+1,holder:{...holder,state:'RECOVERING',recoveryStartedAt:new Date().toISOString()}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_RECOVERY_GATE_RACE');
  return clone(next.holder);
 }
 async function finishRecovery({operationId,token}){
  const current=await read(),holder=current.holder;
  if(!holder||holder.operationId!==operationId||holder.token!==token||holder.state!=='RECOVERING')throw Error('PLANNING_RECOVERY_FINISH_GATE_MISMATCH');
  const {recoveryStartedAt,...rest}=holder;
  const next={...current,version:current.version+1,holder:{...rest,state:'UNCERTAIN'}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_RECOVERY_FINISH_RACE');
  return clone(next.holder);
 }
 // Persist sanitized failure stage in the held gate. This never releases
 // the gate and is safe after an uncertain Sheets network outcome.
 async function recordRecoveryFailure({operationId,token,stage,code}={}){
  const current=await read(),holder=current.holder;
  if(!holder||holder.operationId!==operationId||holder.token!==token||holder.state!=='RECOVERING')
   throw Error('PLANNING_RECOVERY_FAILURE_OWNERSHIP_MISMATCH');
  const safe=x=>String(x||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,110);
  const next={...current,version:current.version+1,holder:{...holder,
   lastRecoveryFailure:{stage:safe(stage),code:safe(code),at:new Date().toISOString()}}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)
   throw Error('PLANNING_RECOVERY_FAILURE_CAS_CONFLICT');
  return {recorded:true};
 }
 return Object.freeze({read,acquire,uncertain,quarantineOrphan,release,beginRecovery,finishRecovery,recordRecoveryFailure});
}
