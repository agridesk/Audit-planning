/** DEV-only Firestore authoritative obligation extension store.
 * Inactive until an explicit migration/backfill and ALL legacy writer fences
 * have been independently verified. Never dual-write canonical Sheets.
 * Atomic boundary: obligation revision + immutable event + outbox.
 */
const str=x=>String(x??'').trim();
const id=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..';
const copy=x=>structuredClone(x);
function encode(v){if(v===null)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number'&&Number.isSafeInteger(v))return{integerValue:String(v)};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]))}};throw Error('EXT_FIRESTORE_VALUE_INVALID')}
function decode(v){if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('integerValue'in v)return Number(v.integerValue);if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));throw Error('EXT_FIRESTORE_VALUE_CORRUPT')}
export function createScopeExtensionFirestoreStore20({projectId,getToken,fetchImpl=fetch,databaseId='(default)',prefix='ams_scope_extension_20_dev',migrationVerified=false,writerFenceVerified=false}={}){
 if(migrationVerified!==true||writerFenceVerified!==true)throw Error('EXT_FIRESTORE_CUTOVER_UNVERIFIED');
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||'')||typeof getToken!=='function'||!id(prefix)||!databaseId)throw Error('EXT_FIRESTORE_CONFIG_INVALID');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId)+'/databases/'+encodeURIComponent(databaseId)+'/documents';
 const doc=(kind,key)=>{if(!['obligation','event','outbox'].includes(kind)||!id(key))throw Error('EXT_FIRESTORE_DOCUMENT_ID_INVALID');return base+'/'+prefix+'_'+kind+'/'+encodeURIComponent(key)};
 async function request(url,method='GET',body){const token=await getToken();if(!token)throw Error('EXT_FIRESTORE_TOKEN_MISSING');return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})}
 async function runAtomic({obligationId,auditId,scopeCode,expectedRevision,idempotencyKey,requestDigest,action,actorId,execute}={}){
  if(![obligationId,auditId,scopeCode,idempotencyKey,requestDigest,actorId].every(id)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!['apply','undo'].includes(action)||typeof execute!=='function')throw Error('EXT_FIRESTORE_COMMAND_INVALID');
  const started=await request(base+':beginTransaction','POST',{options:{readWrite:{}}});if(!started.ok)throw Error('EXT_FIRESTORE_BEGIN_'+started.status);
  const {transaction}=await started.json();if(!transaction)throw Error('EXT_FIRESTORE_TRANSACTION_MISSING');
  const read=async(kind,key)=>{const url=new URL(doc(kind,key));url.searchParams.set('transaction',transaction);const response=await request(url.toString());if(response.status===404)return null;if(!response.ok)throw Error('EXT_FIRESTORE_READ_'+response.status);const v=await response.json();if(!v.updateTime||!v.fields?.payload)throw Error('EXT_FIRESTORE_CORRUPT');return{value:decode(v.fields.payload),updateTime:v.updateTime}};
  const existing=await read('event',idempotencyKey);
  if(existing){if(existing.value.requestDigest!==requestDigest||existing.value.actorUid!==actorId||existing.value.obligationId!==obligationId||existing.value.action!==action||existing.value.auditId!==auditId||existing.value.scopeCode!==scopeCode)throw Error('EXT_IDEMPOTENCY_REUSE_CONFLICT');return{...copy(existing.value.receipt),replayed:true}}
  const current=await read('obligation',obligationId);
  if(!current)throw Error('EXT_OBLIGATION_NOT_MIGRATED');
  if(current.value.auditId!==auditId||current.value.scopeCode!==scopeCode||current.value.revision!==expectedRevision||current.value.pendingProjectionId)throw Error('EXT_REVISION_OR_PROJECTION_CONFLICT');
  let priorTransaction=null;
  if(action==='undo'){const meta=JSON.parse(str(current.value.extensionMetadata)||'null');if(!id(meta?.transactionId))throw Error('EXT_UNDO_PROVENANCE_MISSING');const before=await read('event',meta.transactionId);if(!before||before.value.action!=='apply'||before.value.obligationId!==obligationId||before.value.auditId!==auditId)throw Error('EXT_UNDO_PROVENANCE_INVALID');priorTransaction=before.value.planTransaction}
  const prepared=execute({obligation:copy(current.value),priorTransaction});
  if(prepared.obligationId!==obligationId||prepared.expectedRevision!==expectedRevision||prepared.nextRevision!==expectedRevision+1||prepared.transaction?.transactionId!==idempotencyKey||prepared.transaction?.requestDigest!==requestDigest||prepared.transaction?.obligationId!==obligationId||prepared.outbox?.obligationId!==obligationId)throw Error('EXT_FIRESTORE_PLAN_INVALID');
  const receipt={success:true,obligationId,revision:prepared.nextRevision,operationId:idempotencyKey,projection:'PENDING'};
  const value={...current.value,...copy(prepared.after),revision:prepared.nextRevision,pendingProjectionId:idempotencyKey};
  const event={...copy(prepared.transaction),planTransaction:{auditId,transactionId:idempotencyKey,actorUid:actorId,changes:[{obligationId,scopeCode,before:prepared.before,after:prepared.after}]},receipt,createdAt:new Date().toISOString()};
  const outbox={...copy(prepared.outbox),operationId:idempotencyKey,state:'PENDING',createdAt:event.createdAt};
  const write=(kind,key,payload,precondition)=>({update:{name:doc(kind,key),fields:{payload:encode(payload)}},currentDocument:precondition});
  const writes=[write('obligation',obligationId,value,{updateTime:current.updateTime}),write('event',idempotencyKey,event,{exists:false}),write('outbox',idempotencyKey,outbox,{exists:false})];
  const committed=await request(base+':commit','POST',{transaction,writes});if(!committed.ok)throw Error('EXT_FIRESTORE_COMMIT_'+committed.status);
  return receipt;
 }
 async function readOutbox(operationId){
  if(!id(operationId))throw Error('EXT_OUTBOX_ID_INVALID');
  const response=await request(doc('outbox',operationId));
  if(response.status===404)return null;
  if(!response.ok)throw Error('EXT_OUTBOX_READ_'+response.status);
  const raw=await response.json();
  if(!raw.fields?.payload)throw Error('EXT_OUTBOX_CORRUPT');
  const value=decode(raw.fields.payload);
  if(value.operationId!==operationId||!['PENDING','PROJECTED','UNCERTAIN'].includes(value.state))throw Error('EXT_OUTBOX_CORRUPT');
  return copy(value);
 }
 async function listOutbox({pageSize=100,pageToken=''}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200||typeof pageToken!=='string')throw Error('EXT_OUTBOX_SCAN_INVALID');
  const url=new URL(base+'/'+prefix+'_outbox');
  url.searchParams.set('pageSize',String(pageSize));
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const response=await request(url.toString());
  if(!response.ok)throw Error('EXT_OUTBOX_SCAN_'+response.status);
  const raw=await response.json();
  const entries=(raw.documents||[]).map(item=>{
   const operationId=decodeURIComponent(str(item.name).split('/').at(-1)||'');
   if(!id(operationId)||!item.fields?.payload)throw Error('EXT_OUTBOX_SCAN_CORRUPT');
   const value=decode(item.fields.payload);
   if(value.operationId!==operationId||!id(value.obligationId)||!['PENDING','PROJECTED','UNCERTAIN'].includes(value.state))throw Error('EXT_OUTBOX_SCAN_CORRUPT');
   return value;
  });
  return{entries:copy(entries),nextPageToken:str(raw.nextPageToken)||null};
 }
 async function markProjected({obligationId,operationId,proof}={}){
  if(!id(obligationId)||!id(operationId)||proof?.verified!==true||proof?.obligationId!==obligationId||proof?.operationId!==operationId||typeof proof?.rowHash!=='string'||!/^[a-f0-9]{64}$/.test(proof.rowHash))throw Error('EXT_PROJECTION_PROOF_INVALID');
  const started=await request(base+':beginTransaction','POST',{options:{readWrite:{}}});
  if(!started.ok)throw Error('EXT_FIRESTORE_BEGIN_'+started.status);
  const {transaction}=await started.json();
  if(!transaction)throw Error('EXT_FIRESTORE_TRANSACTION_MISSING');
  const read=async(kind,key)=>{
   const url=new URL(doc(kind,key));url.searchParams.set('transaction',transaction);
   const res=await request(url.toString());if(res.status===404)return null;
   if(!res.ok)throw Error('EXT_FIRESTORE_READ_'+res.status);
   const raw=await res.json();if(!raw.updateTime||!raw.fields?.payload)throw Error('EXT_FIRESTORE_CORRUPT');
   return{value:decode(raw.fields.payload),updateTime:raw.updateTime};
  };
  const ob=await read('obligation',obligationId),out=await read('outbox',operationId);
  if(!ob||!out||out.value.operationId!==operationId||out.value.obligationId!==obligationId)throw Error('EXT_PROJECTION_STATE_MISSING');
  if(out.value.state==='PROJECTED'){
   if(out.value.proof?.rowHash!==proof.rowHash)throw Error('EXT_PROJECTION_PROOF_CONFLICT');
   return{state:'PROJECTED',replayed:true};
  }
  if(out.value.state!=='PENDING'||ob.value.pendingProjectionId!==operationId||ob.value.revision!==out.value.revision)throw Error('EXT_PROJECTION_REVISION_CONFLICT');
  const changed={...ob.value,pendingProjectionId:'',lastProjectedOperationId:operationId};
  const projected={...out.value,state:'PROJECTED',proof:copy(proof),projectedAt:new Date().toISOString()};
  const write=(kind,key,value,time)=>({update:{name:doc(kind,key),fields:{payload:encode(value)}},currentDocument:{updateTime:time}});
  const response=await request(base+':commit','POST',{transaction,writes:[write('obligation',obligationId,changed,ob.updateTime),write('outbox',operationId,projected,out.updateTime)]});
  if(!response.ok)throw Error('EXT_FIRESTORE_COMMIT_'+response.status);
  return{state:'PROJECTED',replayed:false};
 }
 return Object.freeze({runAtomic,readOutbox,listOutbox,markProjected});
}
