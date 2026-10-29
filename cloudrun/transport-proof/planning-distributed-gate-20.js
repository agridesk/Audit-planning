/** Durable single-writer gate for all DEV planning mutations.
 * One Firestore CAS document serializes incompatible legacy Sheets writes across
 * Cloud Run instances until their writes are migrated. No time-based lease stealing:
 * an expired process does not prove an in-flight Sheets write has ended.
 * Fail closed until reconciliation supplies independent proof.
 */
import {randomUUID} from 'node:crypto';
const clone=x=>structuredClone(x);
const initial={auditorId:'__planning_write_gate__',version:0,holder:null,lastCompleted:null};
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
 async function release({token,verified,proof}){
  if(verified!==true||typeof proof!=='string'||proof.length<8)throw Error('PLANNING_GATE_RELEASE_EVIDENCE_REQUIRED');
  const current=await read();
  if(!current.holder||current.holder.token!==token)throw Error('PLANNING_GATE_TOKEN_MISMATCH');
  const next={...current,version:current.version+1,holder:null,lastCompleted:{operationId:current.holder.operationId,proof,at:new Date().toISOString()}};
  if(await adapter.compareAndSwap(initial.auditorId,current.version,next)!==true)throw Error('PLANNING_GATE_CONFLICT');
  return clone(next.lastCompleted);
 }
 return Object.freeze({read,acquire,uncertain,release});
}
