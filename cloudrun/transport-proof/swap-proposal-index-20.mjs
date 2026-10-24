/** DEV-only durable SWAP read index. GAS is the sole transactional source. */
const COLLECTION='ams_swap20_dev_index';
const MAX_VERIFIED_AGE_MS=480000;
const OPEN_MANAGER=['AWAITING_ACKNOWLEDGEMENT','ESCALATED','CONFIRMED','DECLINED'];
const OPEN_AUDITOR=['AWAITING_ACKNOWLEDGEMENT','ESCALATED'];
const validId=id=>/^[A-Za-z0-9_-]{8,100}$/.test(String(id||''));
const validAudit=id=>typeof id==='string'&&id.trim().length>0&&id.length<=140;
export function createSwapProposalIndex({project,getToken,fetchImpl=fetch,now=Date.now}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||''))throw Error('SWAP_INDEX_PROJECT_INVALID');
 if(typeof getToken!=='function')throw Error('SWAP_INDEX_TOKEN_PROVIDER_INVALID');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/'+COLLECTION;
 async function request(url,init={}){
  const token=await getToken();
  if(!token)throw Error('SWAP_INDEX_TOKEN');
  return fetchImpl(url,{...init,headers:{authorization:'Bearer '+token,...(init.body?{'content-type':'application/json'}:{})}});
 }
 async function doc(id){
  const r=await request(base+'/'+encodeURIComponent(id));
  if(r.status===404)return null;
  if(!r.ok)throw Error('SWAP_INDEX_DOC_'+r.status);
  return r.json();
 }
 function fields(v){return {payload:{stringValue:JSON.stringify(v)}};}
 async function put(id,value,updateTime){
  const url=new URL(base+'/'+encodeURIComponent(id));
  if(updateTime)url.searchParams.set('currentDocument.updateTime',updateTime);
  else url.searchParams.set('currentDocument.exists','false');
  const r=await request(url.toString(),{method:'PATCH',body:JSON.stringify({fields:fields(value)})});
  if([409,412].includes(r.status))return null;
  if(!r.ok)throw Error('SWAP_INDEX_WRITE_'+r.status);
  return r.json();
 }
 function decode(raw){
  const data=JSON.parse(raw?.fields?.payload?.stringValue||'null');
  if(!data||typeof data!=='object')throw Error('SWAP_INDEX_DATA_INVALID');
  return data;
 }
 async function meta(){
  const raw=await doc('_META');
  return raw?{data:decode(raw),updateTime:raw.updateTime}:null;
 }
 async function listRaw(){
  const url=base+'?pageSize=350';
  const r=await request(url);
  if(!r.ok)throw Error('SWAP_INDEX_LIST_'+r.status);
  const result=await r.json();
  if(result.nextPageToken)throw Error('SWAP_INDEX_PAGINATION_REQUIRES_REVIEW');
  const docs=result.documents||[];
  if(docs.length>=350)throw Error('SWAP_INDEX_SIZE_REQUIRES_REVIEW');
  return docs.filter(x=>!String(x.name||'').endsWith('/_META')).map(decode);
 }
 function validateProposal(p){
  if(!p||!validId(p.operationId)||!validAudit(p.auditA)||!validAudit(p.auditB)||
    !Array.isArray(p.requiredAuditorUids)||!Array.isArray(p.acknowledgedAuditorUids)||
    !Array.isArray(p.blocksA)||!Array.isArray(p.blocksB)||typeof p.status!=='string')
   throw Error('SWAP_INDEX_PROPOSAL_INVALID');
  return p;
 }
 function projectList(actor,records){
  if(!actor||!['manager','auditor'].includes(actor.role))throw Error('SWAP_INDEX_ROLE');
  const items=records.filter(p=>{
   validateProposal(p);
   return actor.role==='manager'?OPEN_MANAGER.includes(p.status):
    OPEN_AUDITOR.includes(p.status)&&p.requiredAuditorUids.includes(actor.auditorId);
  }).map(p=>actor.role==='manager'?{
    operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,status:p.status,
    createdAt:p.createdAt||'',createdBy:p.createdBy||'',blocksA:p.blocksA,blocksB:p.blocksB,
    acknowledgedCount:p.acknowledgedAuditorUids.length,requiredCount:p.requiredAuditorUids.length,
    acknowledgedAuditorUids:p.acknowledgedAuditorUids,requiredAuditorUids:p.requiredAuditorUids,
    internalReason:p.internalReason||'',ecasComment:p.ecasComment||'',commitEnabled:false
   }:{
    operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,status:p.status,
    createdAt:p.createdAt||'',afterA:p.blocksA,afterB:p.blocksB,
    ecasComment:p.ecasComment||'',dateChanged:p.dateChanged===true,
    acknowledged:p.acknowledgedAuditorUids.includes(actor.auditorId)
   });
  items.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  return {ok:true,readOnly:true,items:items.slice(0,actor.role==='manager'?100:50),
   attentionCount:items.filter(p=>actor.role==='manager'?
    true:!p.acknowledged).length};
 }
 let verifiedSnapshot=null;
 let metaReadPending=null;
 async function readMetaSingleflight(){
  if(metaReadPending)return metaReadPending;
  const pending=meta();
  metaReadPending=pending;
  try{return await pending;}finally{if(metaReadPending===pending)metaReadPending=null;}
 }
 async function readProposal(operationId){
  if(!validId(operationId))throw Error('SWAP_INDEX_OPERATION_INVALID');
  const state=await readMetaSingleflight();
  if(!state||state.data.status!=='READY'||!Number.isSafeInteger(state.data.verifiedAtMs)||
     now()-state.data.verifiedAtMs>=MAX_VERIFIED_AGE_MS||state.data.verifiedAtMs>now())return null;
  const raw=await doc(operationId);
  if(!raw)return null;
  const proposal=validateProposal(decode(raw));
  const after=await meta();
  if(!after||after.updateTime!==state.updateTime||after.data.status!=='READY')return null;
  return proposal;
 }
 async function read(actor){
  const before=await readMetaSingleflight();
  if(!before||before.data.status!=='READY'||!Number.isSafeInteger(before.data.verifiedAtMs)||now()-before.data.verifiedAtMs>=MAX_VERIFIED_AGE_MS||before.data.verifiedAtMs>now()){
   verifiedSnapshot=null;return null;
  }
  if(verifiedSnapshot&&verifiedSnapshot.updateTime===before.updateTime)
   return projectList(actor,verifiedSnapshot.records);
  const records=await listRaw();
  const after=await meta();
  if(!after||after.updateTime!==before.updateTime||after.data.status!=='READY'){
   verifiedSnapshot=null;return null;
  }
  verifiedSnapshot={updateTime:after.updateTime,records};
  return projectList(actor,records);
 }
 async function bootstrap(records){
  const prior=await meta();
  if(prior)return false;
  if(!Array.isArray(records)||records.length>300)throw Error('SWAP_INDEX_BOOTSTRAP_INVALID');
  const started=await put('_META',{status:'BOOTSTRAPPING',sequence:1});
  if(!started)return false;
  for(const record of records){
   const saved=await put(validateProposal(record).operationId,record);
   if(!saved)throw Error('SWAP_INDEX_BOOTSTRAP_ROW_CONFLICT');
  }
  const ready=await put('_META',{status:'READY',sequence:1,verifiedAtMs:now(),initializedAt:new Date().toISOString()},started.updateTime);
  if(!ready)throw Error('SWAP_INDEX_BOOTSTRAP_RACE');
  return true;
 }
 async function reconcile(records){
  if(!Array.isArray(records)||records.length>300)throw Error('SWAP_INDEX_RECONCILE_INPUT');
  const current=await meta();
  if(!current)return false;
  // A failed mutation can leave DIRTY after GAS executed but its redirect failed.
  // Reconcile only from the full authoritative GAS seed and after the lock has aged.
  const status=current.data.status;
  if(status!=='READY'){
   if(!['DIRTY','RECONCILING','BOOTSTRAPPING'].includes(status))return false;
   const age=now()-Date.parse(current.updateTime||'');
   if(!Number.isFinite(age)||age<120000)return false;
  }
  const locked=await put('_META',{status:'RECONCILING',sequence:(current.data.sequence||0)+1},current.updateTime);
  if(!locked)return false;
  // Never expose an incomplete reconciliation: an interrupted pass remains locked.
  const existing=await listRaw();
  const incoming=new Set(records.map(p=>validateProposal(p).operationId));
  if(existing.some(p=>!incoming.has(p.operationId)))throw Error('SWAP_INDEX_RECONCILE_MISSING_SOURCE_RECORD');
  for(const p of records){
   const currentDoc=await doc(p.operationId);
   const saved=await put(p.operationId,p,currentDoc?.updateTime);
   if(!saved)throw Error('SWAP_INDEX_RECONCILE_WRITE_CONFLICT');
  }
  const ready=await put('_META',{status:'READY',sequence:(current.data.sequence||0)+1,
   verifiedAtMs:now(),verifiedAt:new Date().toISOString()},locked.updateTime);
  if(!ready)throw Error('SWAP_INDEX_RECONCILE_COMPLETE_CONFLICT');
  return true;
 }
 async function begin(op){
  if(!validId(op))throw Error('SWAP_INDEX_OPERATION_INVALID');
  const current=await meta();
  if(!current||current.data.status!=='READY')return false;
  const updated=await put('_META',{status:'DIRTY',operationId:op,sequence:(current.data.sequence||0)+1,verifiedAtMs:current.data.verifiedAtMs||0},current.updateTime);
  return !!updated;
 }
 async function abort(op){
  const current=await meta();
  if(!current||current.data.status!=='DIRTY'||current.data.operationId!==op)
   throw Error('SWAP_INDEX_ABORT_LOCK_LOST');
  const ready=await put('_META',{status:'READY',sequence:current.data.sequence,verifiedAtMs:current.data.verifiedAtMs||0,abortedAt:new Date().toISOString()},current.updateTime);
  if(!ready)throw Error('SWAP_INDEX_ABORT_CONFLICT');
 }
 async function finish(op,proposal){
  validateProposal(proposal);
  if(op!==proposal.operationId)throw Error('SWAP_INDEX_RECEIPT_MISMATCH');
  const current=await meta();
  if(!current||current.data.status!=='DIRTY'||current.data.operationId!==op)
   throw Error('SWAP_INDEX_LOCK_LOST');
  const saved=await put(op,proposal,(await doc(op))?.updateTime);
  if(!saved)throw Error('SWAP_INDEX_PROPOSAL_WRITE_CONFLICT');
  const ready=await put('_META',{status:'READY',sequence:current.data.sequence,verifiedAtMs:current.data.verifiedAtMs||0,updatedAt:new Date().toISOString()},current.updateTime);
  if(!ready)throw Error('SWAP_INDEX_COMPLETE_CONFLICT');
  return true;
 }
 return Object.freeze({read,readProposal,bootstrap,begin,finish,abort,reconcile,project:projectList,meta});
}
