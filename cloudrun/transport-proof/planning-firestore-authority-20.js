/** DEV planning authority: Firestore CAS is the transaction boundary; Sheets is a projection.
 * The adapter must implement atomic compareAndSwap across Cloud Run instances.
 * Never acknowledge a commit as projected until the Sheets writer confirms it.
 */
import {randomUUID,createHash} from 'node:crypto';
const copy=x=>structuredClone(x);
const valid=x=>typeof x==='string'&&x.trim().length>0;
const initial=id=>({auditorId:id,version:0,commits:[]});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safePayload=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;
const states=['PENDING','UNCERTAIN','PROJECTED','REJECTED'];
export function createPlanningFirestoreAuthority(adapter){
 if(typeof adapter?.read!=='function'||typeof adapter?.compareAndSwap!=='function')throw Error('PLANNING_ATOMIC_ADAPTER_REQUIRED');
 async function read(auditId){
  if(!valid(auditId))throw Error('PLANNING_AUDIT_ID_REQUIRED');
  const doc=await adapter.read(auditId)??initial(auditId);
  if(doc.auditorId!==auditId||!Number.isSafeInteger(doc.version)||doc.version<0||!Array.isArray(doc.commits)||doc.commits.some(x=>!x||typeof x!=='object'||!valid(x.id)||!valid(x.requestId)||x.auditId!==auditId||!states.includes(x.state)||!Array.isArray(x.blocks)||(x.projectionPayload!==undefined&&(!safePayload(x.projectionPayload)||x.projectionDigest!==digest(x.projectionPayload)))))throw Error('PLANNING_CANONICAL_CORRUPT');
  return copy(doc);
 }
 async function stage({auditId,auditorId,actorId,sourceRevision,blocks,requestId,projectionPayload}){
  if(!valid(auditId)||!valid(auditorId)||!valid(actorId)||!valid(requestId)||!Array.isArray(blocks)||!blocks.length)throw Error('PLANNING_INTENT_INVALID');
  if(projectionPayload!==undefined&&(!safePayload(projectionPayload)||projectionPayload.auditId!==auditId||JSON.stringify(projectionPayload.blocks)!==JSON.stringify(blocks)))throw Error('PLANNING_PROJECTION_PAYLOAD_INVALID');
  const current=await read(auditId);
  const previous=current.commits.find(x=>x.requestId===requestId);
  if(previous){if(previous.auditorId!==auditorId||previous.actorId!==actorId||previous.sourceRevision!==String(sourceRevision??'')||JSON.stringify(previous.blocks)!==JSON.stringify(blocks)||(projectionPayload!==undefined&&previous.projectionDigest!==digest(projectionPayload)))throw Error('PLANNING_IDEMPOTENCY_KEY_REUSED');return {commit:copy(previous),replayed:true,version:current.version};}
  if(current.commits.some(x=>x.state==='PENDING'||x.state==='UNCERTAIN'))throw Error('PLANNING_PROJECTION_PENDING');
  if(current.commits.length>=200)throw Error('PLANNING_LEDGER_ARCHIVE_REQUIRED');
  if(current.version>=Number.MAX_SAFE_INTEGER-1)throw Error('PLANNING_VERSION_EXHAUSTED');
  const commit={id:randomUUID(),requestId,auditId,auditorId,actorId,sourceRevision:String(sourceRevision??''),blocks:copy(blocks),...(projectionPayload===undefined?{}:{projectionPayload:copy(projectionPayload),projectionDigest:digest(projectionPayload)}),state:'PENDING',createdAt:new Date().toISOString()};
  const next={...current,version:current.version+1,commits:[...current.commits,commit]};
  if(await adapter.compareAndSwap(auditId,current.version,next)!==true)throw Error('PLANNING_VERSION_CONFLICT');
  return {commit:copy(commit),replayed:false,version:next.version};
 }
 async function transition({auditId,commitId,from,to,detail}){
  if(!['PENDING','UNCERTAIN'].includes(from)||!['PROJECTED','UNCERTAIN','REJECTED'].includes(to))throw Error('PLANNING_TRANSITION_INVALID');
  const current=await read(auditId),index=current.commits.findIndex(x=>x.id===commitId);
  if(index<0)throw Error('PLANNING_COMMIT_NOT_FOUND');
  if(current.commits[index].state===to)return copy(current.commits[index]);
  if(current.commits[index].state!==from)throw Error('PLANNING_TRANSITION_CONFLICT');
  if(current.version>=Number.MAX_SAFE_INTEGER-1)throw Error('PLANNING_VERSION_EXHAUSTED');
  const next=copy(current);next.version++;next.commits[index]={...next.commits[index],state:to,updatedAt:new Date().toISOString(),detail:String(detail??'').slice(0,120)};
  if(await adapter.compareAndSwap(auditId,current.version,next)!==true)throw Error('PLANNING_VERSION_CONFLICT');
  return copy(next.commits[index]);
 }
 async function pending(auditId){const doc=await read(auditId);return doc.commits.filter(c=>c.state==='PENDING'||c.state==='UNCERTAIN').map(copy);}
 return Object.freeze({read,stage,transition,pending});
}
