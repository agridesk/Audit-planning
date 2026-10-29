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
  // Past appointments remain in the canonical snapshot, not the live capacity index.
  // This also prevents historical cross-company overlaps from blocking DEV backfill.
  if(date<new Date().toISOString().slice(0,10))continue;
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
 async function listOutbox({pageSize=100,pageToken=''}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200||typeof pageToken!=='string')throw Error('PLANNING_OUTBOX_SCAN_INPUT_INVALID');
  const u=new URL(base+'/'+coll.outbox);
  u.searchParams.set('pageSize',String(pageSize));
  if(pageToken)u.searchParams.set('pageToken',pageToken);
  const r=await request(u.toString());
  if(!r.ok)throw Error('PLANNING_OUTBOX_SCAN_'+r.status);
  const data=await r.json(),docs=(data.documents||[]).map(doc=>{
   const id=String(doc.name||'').split('/').at(-1);
   const decoded=decodeDoc(doc);
   if(!validId(id)||decoded?.value?.operationId!==id)throw Error('PLANNING_OUTBOX_SCAN_CORRUPT');
   return decoded.value;
  });
  return {entries:docs,nextPageToken:data.nextPageToken||null};
 }
 async function readAudit(auditId){return clone((await get('audit',auditId))?.value??null);}
 async function inspectAuditClaimIndex(auditId){
  const audit=await readAudit(auditId);
  if(!audit)return {ok:false,reason:'AUDIT_MISSING',checked:0};
  const ids=audit.claimIds;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!validId(id)))return {ok:false,reason:'INVALID_CLAIM_INDEX',checked:0};
  for(const id of ids){
   const document=(await get('claim',id))?.value;
   if(!document||document.claimId!==id||document.auditId!==auditId||document.auditorId!==audit.auditorId||document.revision!==audit.revision&&document.operationId!==audit.lastOperationId&&document.operationId!=='BACKFILL'){
    return {ok:false,reason:'CLAIM_INTEGRITY_MISMATCH',checked:ids.indexOf(id)};
   }
  }
  return {ok:true,checked:ids.length};
 }
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
 /** Atomic multi-audit lifecycle (completion successor audits / transfer).
  * Writes every affected audit, ownership claim and one projection outbox in
  * the SAME Firestore transaction. No Sheets mutation occurs inside this call.
  */
 async function commitMulti({operationId,actorId,action,entities,projectionPlan}){
  if(!validId(operationId)||!validId(actorId)||!str(action)||!Array.isArray(entities)||!entities.length||entities.length>15||!projectionPlan||typeof projectionPlan!=='object')throw Error('PLANNING_MULTI_INPUT_INVALID');
  const auditIds=entities.map(e=>e?.auditId);
  if(new Set(auditIds).size!==auditIds.length||auditIds.some(x=>!validId(x)))throw Error('PLANNING_MULTI_AUDIT_ID_INVALID');
  for(const e of entities){
   if(!e.nextSnapshot||e.nextSnapshot.auditId!==e.auditId||!(e.expectedRevision===null||Number.isSafeInteger(e.expectedRevision)&&e.expectedRevision>=0)||e.remove!==undefined&&typeof e.remove!=='boolean')throw Error('PLANNING_MULTI_ENTITY_INVALID');
  }
  const sorted=entities.slice().sort((a,b)=>a.auditId.localeCompare(b.auditId));
  const digest=hex(JSON.stringify({operationId,actorId,action,entities:sorted,projectionPlan}));
  return transaction(async tx=>{
   const previous=await tx.get('outbox',operationId);
   if(previous){
    if(previous.value.requestDigest!==digest||previous.value.action!==action)throw Error('PLANNING_MULTI_REPLAY_CONFLICT');
    return {operationId,replayed:true,state:previous.value.state,entities:previous.value.entities};
   }
   const existing=new Map(),newClaimGroups=new Map(),oldIds=new Set(),newIds=new Set();
   for(const e of sorted){
    const old=await tx.get('audit',e.auditId);
    if(e.expectedRevision===null){if(old)throw Error('PLANNING_MULTI_SUCCESSOR_ALREADY_EXISTS');}
    else if(!old||old.value.revision!==e.expectedRevision||old.value.pendingOperationId)throw Error('PLANNING_MULTI_REVISION_CONFLICT');
    existing.set(e.auditId,old);
    if(e.remove&&e.blocks?.length)throw Error('PLANNING_MULTI_REMOVE_WITH_BLOCKS');
    const nextClaims=e.remove?[]:claimsFor(e.blocks||[],e.auditorId||null);
    newClaimGroups.set(e.auditId,nextClaims);
    for(const c of nextClaims){if(newIds.has(c.claimId))throw Error('PLANNING_MULTI_INTERNAL_SLOT_CONFLICT');newIds.add(c.claimId);}
    for(const id of old?.value?.claimIds||[])oldIds.add(id);
   }
   const ids=[...new Set([...oldIds,...newIds])].sort();
   if(ids.length>450)throw Error('PLANNING_MULTI_CLAIMS_TOO_MANY');
   const claims=new Map();
   for(const id of ids)claims.set(id,await tx.get('claim',id));
   for(const e of sorted){
    for(const id of existing.get(e.auditId)?.value?.claimIds||[]){
     if(claims.get(id)?.value?.auditId!==e.auditId)throw Error('PLANNING_MULTI_EXISTING_CLAIM_CORRUPT');
    }
   }
   for(const e of sorted)for(const c of newClaimGroups.get(e.auditId)){
    const holder=claims.get(c.claimId)?.value;
    if(holder&&holder.auditId!==e.auditId&&!auditIds.includes(holder.auditId))throw Error('PLANNING_MULTI_SLOT_CONFLICT');
    if(holder&&holder.auditId!==e.auditId){
     const transferred=sorted.find(x=>x.auditId===holder.auditId);
     if(newClaimGroups.get(transferred.auditId).some(x=>x.claimId===c.claimId))throw Error('PLANNING_MULTI_SLOT_CONFLICT');
    }
   }
   const now=new Date().toISOString(),receipts=[];
   for(const e of sorted){
    const old=existing.get(e.auditId),revision=(old?.value?.revision??-1)+1,claimIds=newClaimGroups.get(e.auditId).map(c=>c.claimId);
    const canonical={auditId:e.auditId,revision,snapshot:clone(e.nextSnapshot),auditorId:e.remove?null:e.auditorId||null,blocks:e.remove?[]:clone(e.blocks||[]),claimIds,pendingOperationId:operationId,removed:e.remove===true,updatedAt:now,lastOperationId:operationId};
    tx.set('audit',e.auditId,canonical);
    receipts.push({auditId:e.auditId,revision,removed:e.remove===true});
   }
   for(const id of oldIds)if(!newIds.has(id))tx.remove('claim',id);
   for(const e of sorted)for(const c of newClaimGroups.get(e.auditId))tx.set('claim',c.claimId,{...c,auditId:e.auditId,revision:receipts.find(x=>x.auditId===e.auditId).revision,operationId});
   // The public operation identity is the initiating audit, not the lexically
   // first sorted audit. Sorting is only a deadlock-prevention detail.
   tx.set('outbox',operationId,{operationId,auditId:entities[0].auditId,auditIds,entities:receipts,actorId,action,requestDigest:digest,snapshot:clone(projectionPlan),state:'PENDING',createdAt:now,multi:true});
   return {operationId,replayed:false,state:'PENDING',entities:receipts};
  });
 }
 async function seed({auditId,snapshot,auditorId,blocks=[]}){
  if(!validId(auditId)||!snapshot||typeof snapshot!=='object'||snapshot.auditId!==auditId||!/^([a-f0-9]{24})$/.test(str(snapshot.sourceRevision)))throw Error('PLANNING_BACKFILL_SOURCE_INVALID');
  const newClaims=claimsFor(blocks,auditorId),ids=newClaims.map(x=>x.claimId);
  return transaction(async tx=>{
   const old=await tx.get('audit',auditId);
   if(old){
    if(old.value.revision===0&&old.value.snapshot?.sourceRevision===snapshot.sourceRevision&&JSON.stringify(old.value.snapshot)===JSON.stringify(snapshot)&&JSON.stringify(old.value.claimIds||[])===JSON.stringify(ids))return {seeded:false,idempotent:true};
    throw Error('PLANNING_BACKFILL_EXISTING_CANONICAL');
   }
   for(const claim of newClaims){
    if(await tx.get('claim',claim.claimId))throw Error('PLANNING_BACKFILL_SLOT_COLLISION');
   }
   const canonical={auditId,revision:0,snapshot:clone(snapshot),auditorId:auditorId||null,blocks:clone(blocks),claimIds:ids,pendingOperationId:null,backfilledAt:new Date().toISOString(),lastOperationId:null};
   tx.set('audit',auditId,canonical);
   for(const claim of newClaims)tx.set('claim',claim.claimId,{...claim,auditId,revision:0,operationId:'BACKFILL'});
   return {seeded:true,idempotent:false,claimCount:ids.length};
  });
 }
 async function markProjected({auditId,operationId,proof}){
  if(!validId(auditId)||!validId(operationId)||proof?.verified!==true||proof?.auditId!==auditId||typeof proof?.rowHash!=='string'||!/^[a-f0-9]{64}$/.test(proof.rowHash))throw Error('PLANNING_PROJECTION_EVIDENCE_REQUIRED');
  return transaction(async tx=>{
   const audit=await tx.get('audit',auditId),outbox=await tx.get('outbox',operationId);
   if(!audit||!outbox||outbox.value.auditId!==auditId)throw Error('PLANNING_PROJECTION_RECORD_MISSING');
   if(outbox.value.state==='PROJECTED'){
    if(outbox.value.proof?.rowHash!==proof.rowHash)throw Error('PLANNING_PROJECTION_PROOF_CONFLICT');
    return {state:'PROJECTED',replayed:true};
   }
   if(!['PENDING','UNCERTAIN'].includes(outbox.value.state)||audit.value.pendingOperationId!==operationId)throw Error('PLANNING_PROJECTION_STATE_CONFLICT');
   const related=outbox.value.multi===true?outbox.value.entities:[{auditId,revision:outbox.value.revision}];
   if(!Array.isArray(related)||!related.length||related.some(x=>!validId(x.auditId)||!Number.isSafeInteger(x.revision)))throw Error('PLANNING_MULTI_PROJECTION_INDEX_CORRUPT');
   const audited=new Map([[auditId,audit]]);
   for(const item of related)if(item.auditId!==auditId)audited.set(item.auditId,await tx.get('audit',item.auditId));
   for(const item of related){
    const row=audited.get(item.auditId);
    if(!row||row.value.pendingOperationId!==operationId||row.value.revision!==item.revision)throw Error('PLANNING_MULTI_PROJECTION_STATE_CONFLICT');
   }
   const now=new Date().toISOString();
   for(const item of related){
    const row=audited.get(item.auditId);
    tx.set('audit',item.auditId,{...row.value,pendingOperationId:null,lastProjectedOperationId:operationId,lastProjectedAt:now});
   }
   tx.set('outbox',operationId,{...outbox.value,state:'PROJECTED',projectedAt:now,proof:clone(proof)});
   return {state:'PROJECTED',replayed:false};
  });
 }
 async function markUncertain({auditId,operationId,reason}){
  if(!validId(auditId)||!validId(operationId))throw Error('PLANNING_OUTBOX_ID_REQUIRED');
  return transaction(async tx=>{
   const audit=await tx.get('audit',auditId),outbox=await tx.get('outbox',operationId);
   if(!audit||!outbox||outbox.value.auditId!==auditId||audit.value.pendingOperationId!==operationId)throw Error('PLANNING_OUTBOX_STATE_CONFLICT');
   if(outbox.value.state==='UNCERTAIN')return {state:'UNCERTAIN',replayed:true};
   if(outbox.value.state!=='PENDING')throw Error('PLANNING_OUTBOX_STATE_CONFLICT');
   tx.set('outbox',operationId,{...outbox.value,state:'UNCERTAIN',uncertainAt:new Date().toISOString(),reason:String(reason??'UNKNOWN').slice(0,120)});
   return {state:'UNCERTAIN',replayed:false};
  });
 }
 return Object.freeze({readAudit,readOutbox,listOutbox,inspectAuditClaimIndex,commit,commitMulti,seed,markProjected,markUncertain});
}
