/** DEV-only durable SWAP read index. GAS is the sole transactional source. */
const COLLECTION='ams_swap20_dev_index';
const OPEN_MANAGER=['AWAITING_ACKNOWLEDGEMENT','ESCALATED','CONFIRMED','DECLINED'];
const OPEN_AUDITOR=['AWAITING_ACKNOWLEDGEMENT','ESCALATED'];
const validId=id=>/^[A-Za-z0-9_-]{8,100}$/.test(String(id||''));
export function createSwapProposalIndex({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||'')||typeof getToken!=='function')throw Error('SWAP_INDEX_CONFIG');
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
  if(!p||!validId(p.operationId)||!validId(p.auditA)||!validId(p.auditB)||
    !Array.isArray(p.requiredAuditorUids)||!Array.isArray(p.acknowledgedAuditorUids)||
    !Array.isArray(p.blocksA)||!Array.isArray(p.blocksB)||typeof p.status!=='string')
   throw Error('SWAP_INDEX_PROPOSAL_INVALID');
  return p;
 }
 function project(actor,records){
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
    p.status==='CONFIRMED'||p.status==='DECLINED':!p.acknowledged).length};
 }
 async function read(actor){
  const before=await meta();
  if(!before||before.data.status!=='READY')return null;
  const records=await listRaw();
  const after=await meta();
  if(!after||after.updateTime!==before.updateTime||after.data.status!=='READY')return null;
  return project(actor,records);
 }
 async function bootstrap(records){
  const prior=await meta();
  if(prior)return false;
  if(!Array.isArray(records)||records.length>300)throw Error('SWAP_INDEX_BOOTSTRAP_INVALID');
  for(const record of records)await put(validateProposal(record).operationId,record);
  const created=await put('_META',{status:'READY',sequence:1,initializedAt:new Date().toISOString()});
  return !!created;
 }
 async function begin(op){
  if(!validId(op))throw Error('SWAP_INDEX_OPERATION_INVALID');
  const current=await meta();
  if(!current||current.data.status!=='READY')return false;
  const updated=await put('_META',{status:'DIRTY',operationId:op,sequence:(current.data.sequence||0)+1},current.updateTime);
  return !!updated;
 }
 async function finish(op,proposal){
  validateProposal(proposal);
  if(op!==proposal.operationId)throw Error('SWAP_INDEX_RECEIPT_MISMATCH');
  const current=await meta();
  if(!current||current.data.status!=='DIRTY'||current.data.operationId!==op)
   throw Error('SWAP_INDEX_LOCK_LOST');
  await put(op,proposal,(await doc(op))?.updateTime);
  const ready=await put('_META',{status:'READY',sequence:current.data.sequence,updatedAt:new Date().toISOString()},current.updateTime);
  if(!ready)throw Error('SWAP_INDEX_COMPLETE_CONFLICT');
  return true;
 }
 return Object.freeze({read,bootstrap,begin,finish,project,meta});
}
