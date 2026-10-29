/** DEV-only multi-document Firestore planning authority.
 * Commit boundary: canonical audit snapshot + all 15-minute occupancy claims
 * + immutable projection outbox are written in ONE Firestore transaction.
 * Do not enable until existing canonical rows and claims are backfilled.
 * External availability/lifecycle writers MUST be fenced at the same authority.
 */
import {createHash} from 'node:crypto';
const clone=x=>structuredClone(x);
const str=x=>String(x??'').trim();
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..';
const hex=x=>createHash('sha256').update(x).digest('hex');
function encode(v){
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return {integerValue:String(v)};
 if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]))}};
 throw Error('PLANNING_FIRESTORE_INVALID_VALUE');
}
function decode(v){
 if('nullValue'in v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decode);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 throw Error('PLANNING_FIRESTORE_DECODE_INVALID');
}
const decodeDoc=raw=>{
 if(!raw)return null;
 if(!raw.fields?.payload||!raw.updateTime)throw Error('PLANNING_FIRESTORE_CORRUPT');
 return {value:decode(raw.fields.payload),updateTime:raw.updateTime};
};
const time=x=>{if(!/^\d\d:\d\d$/.test(str(x)))throw Error('PLANNING_TIME_INVALID');const [h,m]=x.split(':').map(Number);const n=h*60+m;if(h>23||m>59||n%15)throw Error('PLANNING_TIME_INVALID');return n;};
function claimsFor(blocks,auditorId){
 if(!Array.isArray(blocks)||blocks.length>50)throw Error('PLANNING_CLAIMS_INVALID');
 if(blocks.length&&!validId(auditorId))throw Error('PLANNING_AUDITOR_REQUIRED');
 const result=new Map();
 for(const block of blocks){
  const date=str(block?.date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('PLANNING_DATE_INVALID');
  const start=time(block.start),end=time(block.end);if(end<=start)throw Error('PLANNING_INTERVAL_INVALID');
  for(let minute=start;minute<end;minute+=15){
   const key=hex(auditorId+'|'+date+'|'+minute);
   if(result.has(key))throw Error('PLANNING_SELF_OVERLAP');
   result.set(key,{claimId:key,auditorId,date,minute});
   if(result.size>300)throw Error('PLANNING_TOO_MANY_CLAIMS');
  }
 }
 return [...result.values()].sort((a,b)=>a.claimId.localeCompare(b.claimId));
}
export function createPlanningAtomicFirestoreStore({projectId,getToken,fetchImpl=fetch,databaseId='(default)',prefix='ams_planning_20_dev'}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof getToken!=='function'||!validId(prefix)||!databaseId)throw Error('PLANNING_FIRESTORE_CONFIG_INVALID');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/databases/'+encodeURIComponent(databaseId)+'/documents';
 const coll={audit:prefix+'_audits',claim:prefix+'_claims',outbox:prefix+'_outbox'};
 const doc=(type,id)=>{if(!coll[type]||!validId(id))throw Error('PLANNING_FIRESTORE_ID_INVALID');return base+'/'+coll[type]+'/'+encodeURIComponent(id)};
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('PLANNING_FIRESTORE_TOKEN_REQUIRED');
  return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 async function get(type,id,tx){
  const url=new URL(doc(type,id));if(tx)url.searchParams.set('transaction',tx);
  const r=await request(url.toString());
  if(r.status===404)return null;
  if(!r.ok)throw Error('PLANNING_FIRESTORE_READ_'+r.status);
  return decodeDoc(await r.json());
 }
 async function readAudit(auditId){return clone((await get('audit',auditId))?.value??null);}
 async function readOutbox(operationId){return clone((await get('outbox',operationId))?.value??null);}
 async function transaction(fn){
  const started=await request(base+':beginTransaction','POST',{options:{readWrite:{}}});
  if(!started.ok)throw Error('PLANNING_FIRESTORE_BEGIN_'+started.status);
  const {transaction:tx}=await started.json();
  if(!tx)throw Error('PLANNING_FIRESTORE_TRANSACTION_MISSING');
  const reads=new Map();
  const getInTx=async(type,id)=>{
   const key=type+':'+id;
   if(reads.has(key))return reads.get(key);
   const item=await get(type,id,tx);reads.set(key,item);return item;
  };
  const writes=[];
  const set=(type,id,value)=>{
   const target=doc(type,id),seen=reads.get(type+':'+id);
   if(seen===undefined)throw Error('PLANNING_TX_WRITE_WITHOUT_READ');
   const update={name:target,fields:{payload:encode(value)}};
   writes.push({update,currentDocument:seen?{updateTime:seen.updateTime}:{exists:false}});
  };
  const remove=(type,id)=>{
   const target=doc(type,id),seen=reads.get(type+':'+id);
   if(seen===undefined)throw Error('PLANNING_TX_DELETE_WITHOUT_READ');
   if(seen)writes.push({delete:target,currentDocument:{updateTime:seen.updateTime}});
  };
  const result=await fn({get:getInTx,set,remove});
  if(!writes.length)return result;
  if(writes.length>500)throw Error('PLANNING_FIRESTORE_WRITE_LIMIT');
  let committed;
  try{committed=await request(base+':commit','POST',{transaction:tx,writes});}
  catch{throw Error('PLANNING_FIRESTORE_COMMIT_OUTCOME_UNKNOWN');}
  if([409,412].includes(committed.status))throw Error('PLANNING_TRANSACTION_CONFLICT');
  if(!committed.ok)throw Error('PLANNING_FIRESTORE_COMMIT_'+committed.status);
  const receipt=await committed.json();
  if(!receipt.commitTime||!Array.isArray(receipt.writeResults)||receipt.writeResults.length!==writes.length)throw Error('PLANNING_FIRESTORE_COMMIT_RECEIPT_UNKNOWN');
  return result;
 }
 async function commit({auditId,operationId,actorId,expectedRevision,nextSnapshot,auditorId,blocks=[],action='PLAN'}){
  if(!validId(auditId)||!validId(operationId)||!validId(actorId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!nextSnapshot||typeof nextSnapshot!=='object'||Array.isArray(nextSnapshot)||!str(action))throw Error('PLANNING_TRANSACTION_INPUT_INVALID');
  if(nextSnapshot.auditId!==auditId)throw Error('PLANNING_SNAPSHOT_AUDIT_MISMATCH');
  const nextClaims=claimsFor(blocks,auditorId),requestDigest=hex(JSON.stringify({auditId,actorId,expectedRevision,nextSnapshot,auditorId,blocks,action}));
  return transaction(async tx=>{
   const old=await tx.get('audit',auditId);
   const replay=await tx.get('outbox',operationId);
   if(replay){
    if(replay.value.requestDigest!==requestDigest||replay.value.auditId!==auditId)throw Error('PLANNING_IDEMPOTENCY_KEY_REUSED');
    return {operationId,replayed:true,state:replay.value.state,revision:replay.value.revision};
   }
   if(!old)throw Error('PLANNING_CANONICAL_BACKFILL_REQUIRED');
   if(!Number.isSafeInteger(old.value.revision)||old.value.revision!==expectedRevision)throw Error('PLANNING_CANONICAL_REVISION_CONFLICT');
   if(old.value.pendingOperationId)throw Error('PLANNING_PREVIOUS_PROJECTION_UNRESOLVED');
   const oldIds=old.value.claimIds||[];
   if(!Array.isArray(oldIds)||oldIds.some(id=>!validId(id)))throw Error('PLANNING_CLAIM_INDEX_CORRUPT');
   const newIds=nextClaims.map(x=>x.claimId),ids=[...new Set([...oldIds,...newIds])].sort();
   if(ids.length>350)throw Error('PLANNING_TOO_MANY_CLAIMS');
   const oldClaims=new Map();
   for(const id of ids)oldClaims.set(id,await tx.get('claim',id));
   for(const claim of nextClaims){
    const existing=oldClaims.get(claim.claimId)?.value;
    if(existing&&existing.auditId!==auditId)throw Error('PLANNING_SLOT_ALREADY_CLAIMED');
   }
   for(const id of oldIds){
    const existing=oldClaims.get(id)?.value;
    if(!existing||existing.auditId!==auditId)throw Error('PLANNING_EXISTING_CLAIM_CORRUPT');
   }
   const nextRevision=expectedRevision+1,now=new Date().toISOString();
   const canonical={auditId,revision:nextRevision,snapshot:clone(nextSnapshot),auditorId:auditorId||null,blocks:clone(blocks),claimIds:newIds,pendingOperationId:operationId,updatedAt:now,lastOperationId:operationId};
   const outbox={auditId,operationId,actorId,action,revision:nextRevision,requestDigest,snapshot:clone(nextSnapshot),auditorId:auditorId||null,blocks:clone(blocks),state:'PENDING',createdAt:now};
   tx.set('audit',auditId,canonical);
   for(const id of oldIds.filter(id=>!newIds.includes(id)))tx.remove('claim',id);
   for(const c of nextClaims)tx.set('claim',c.claimId,{...c,auditId,revision:nextRevision,operationId});
   tx.set('outbox',operationId,outbox);
   return {operationId,replayed:false,state:'PENDING',revision:nextRevision,claimCount:newIds.length};
  });
 }
 return Object.freeze({readAudit,readOutbox,commit});
}
