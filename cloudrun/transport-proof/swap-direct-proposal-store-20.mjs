/**
 * SWAP 2.0 DEV-only Firestore proposal persistence prototype.
 * This is deliberately NOT connected to the production SWAP request router.
 * Canonical audit/availability changes require a separate transactional migration.
 */
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const COLLECTION='ams_swap20_dev_proposals';
const TERMINAL=new Set(['APPLIED','WITHDRAWN','DECLINED']);
const NEXT={
 AWAITING_ACKNOWLEDGEMENT:new Set(['AWAITING_ACKNOWLEDGEMENT','CONFIRMED','DECLINED','WITHDRAWN','ESCALATED']),
 ESCALATED:new Set(['ESCALATED','CONFIRMED','DECLINED','WITHDRAWN']),
 CONFIRMED:new Set(['WITHDRAWN']),
 DECLINED:new Set(),
 WITHDRAWN:new Set(),
 APPLIED:new Set()
};
function transitionAllowed(prior,next){
 if(!prior||!next||prior.operationId!==next.operationId||prior.auditA!==next.auditA||prior.auditB!==next.auditB)return false;
 if(TERMINAL.has(prior.status)||!NEXT[prior.status]?.has(next.status))return false;
 for(const field of ['blocksA','blocksB','originalRevisions','dateChanged','internalReason','ecasComment'])
  if(JSON.stringify(prior[field])!==JSON.stringify(next[field]))return false;
 if(!Array.isArray(next.requiredAuditorUids)||!Array.isArray(next.acknowledgedAuditorUids))return false;
 if(JSON.stringify(prior.requiredAuditorUids)!==JSON.stringify(next.requiredAuditorUids))return false;
 if(next.acknowledgedAuditorUids.some(uid=>!next.requiredAuditorUids.includes(uid)))return false;
 if(new Set(next.acknowledgedAuditorUids).size!==next.acknowledgedAuditorUids.length)return false;
 if(!Array.isArray(prior.acknowledgedAuditorUids)||prior.acknowledgedAuditorUids.some(uid=>!next.acknowledgedAuditorUids.includes(uid)))return false;
 if(next.status==='DECLINED'&&(!next.declinedBy||!next.requiredAuditorUids.includes(next.declinedBy)))return false;
 if(next.status==='CONFIRMED'&&next.requiredAuditorUids.some(uid=>!next.acknowledgedAuditorUids.includes(uid)))return false;
 return true;
}
export function createSwapDirectProposalStore({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||''))throw Error('SWAP_DIRECT_PROJECT_INVALID');
 if(typeof getToken!=='function')throw Error('SWAP_DIRECT_AUTH_INVALID');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/'+COLLECTION;
 const encode=v=>({fields:{payload:{stringValue:JSON.stringify(v)}}});
 const decode=raw=>JSON.parse(raw?.fields?.payload?.stringValue||'null');
 async function request(url,init={}){
  const token=await getToken();if(!token)throw Error('SWAP_DIRECT_TOKEN_MISSING');
  const response=await fetchImpl(url,{...init,headers:{authorization:'Bearer '+token,...(init.body?{'content-type':'application/json'}:{})},signal:AbortSignal.timeout(12000)});
  if(response.status===409||response.status===412)return null;
  if(response.status===404&&(!init.method||init.method==='GET'))return null;
  if(!response.ok)throw Error('SWAP_DIRECT_HTTP_'+response.status);
  return response.json();
 }
 async function read(operationId){
  if(!ID.test(String(operationId||'')))throw Error('SWAP_DIRECT_ID_INVALID');
  const raw=await request(base+'/'+encodeURIComponent(operationId));
  return raw?{proposal:decode(raw),updateTime:raw.updateTime}:null;
 }
 async function create(proposal){
  if(!proposal||!ID.test(String(proposal.operationId||''))||!proposal.auditA||!proposal.auditB||
    proposal.auditA===proposal.auditB||!['AWAITING_ACKNOWLEDGEMENT','CONFIRMED'].includes(proposal.status)||
    !Array.isArray(proposal.requiredAuditorUids)||!proposal.requiredAuditorUids.length||
    !Array.isArray(proposal.acknowledgedAuditorUids)||proposal.acknowledgedAuditorUids.length||proposal.status==='CONFIRMED')
   throw Error('SWAP_DIRECT_PROPOSAL_INVALID');
  const url=new URL(base+'/'+encodeURIComponent(proposal.operationId));
  url.searchParams.set('currentDocument.exists','false');
  const raw=await request(url.toString(),{method:'PATCH',body:JSON.stringify(encode(proposal))});
  if(!raw)return {ok:false,conflict:true};
  return {ok:true,proposal:decode(raw),updateTime:raw.updateTime};
 }
 async function compareAndSet(operationId,expectedUpdateTime,next,validateTransition){
  if(!ID.test(String(operationId||''))||!expectedUpdateTime||!next||
    next.operationId!==operationId||typeof validateTransition!=='function')throw Error('SWAP_DIRECT_TRANSITION_INVALID');
  const prior=await read(operationId);
  if(!prior||prior.updateTime!==expectedUpdateTime)return {ok:false,conflict:true};
  if(!transitionAllowed(prior.proposal,next)||validateTransition(prior.proposal,next)!==true)throw Error('SWAP_DIRECT_TRANSITION_REJECTED');
  const url=new URL(base+'/'+encodeURIComponent(operationId));
  url.searchParams.set('currentDocument.updateTime',expectedUpdateTime);
  const raw=await request(url.toString(),{method:'PATCH',body:JSON.stringify(encode(next))});
  if(!raw)return {ok:false,conflict:true};
  return {ok:true,proposal:decode(raw),updateTime:raw.updateTime};
 }
 async function list({actor,authorizeAuditor}={}){
  if(!actor||!['manager','auditor'].includes(actor.role)||!actor.email)throw Error('SWAP_DIRECT_LIST_UNAUTHORIZED');
  const uid=actor.role==='auditor'?await authorizeAuditor?.(actor):null;
  if(actor.role==='auditor'&&(!uid||typeof uid!=='string'))throw Error('SWAP_DIRECT_LIST_AUDITOR_UNAUTHORIZED');
  let pageToken='',count=0;const all=[];
  do{
   const url=new URL(base);
   url.searchParams.set('pageSize','100');
   if(pageToken)url.searchParams.set('pageToken',pageToken);
   const raw=await request(url.toString());
   for(const doc of raw?.documents||[]){
    count++;
    if(count>300)throw Error('SWAP_DIRECT_LIST_SIZE_REQUIRES_REVIEW');
    const p=decode(doc);
    if(!p||!ID.test(String(p.operationId||''))||!p.auditA||!p.auditB||
       !Array.isArray(p.requiredAuditorUids)||!Array.isArray(p.acknowledgedAuditorUids))
     throw Error('SWAP_DIRECT_LIST_PROPOSAL_INVALID');
    all.push(p);
   }
   pageToken=raw?.nextPageToken||'';
  }while(pageToken);
  const relevant=all.filter(p=>actor.role==='manager'
   ?['AWAITING_ACKNOWLEDGEMENT','ESCALATED','CONFIRMED','DECLINED'].includes(p.status)
   :['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].includes(p.status)&&p.requiredAuditorUids.includes(uid));
  relevant.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const items=relevant.slice(0,actor.role==='manager'?100:50).map(p=>actor.role==='manager'
   ?{operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,status:p.status,
      createdAt:p.createdAt||'',createdBy:p.createdBy||'',blocksA:p.blocksA||[],blocksB:p.blocksB||[],
      requiredCount:p.requiredAuditorUids.length,acknowledgedCount:p.acknowledgedAuditorUids.length,
      requiredAuditorUids:p.requiredAuditorUids,acknowledgedAuditorUids:p.acknowledgedAuditorUids,
      internalReason:p.internalReason||'',ecasComment:p.ecasComment||'',commitEnabled:p.status==='CONFIRMED'}
   :{operationId:p.operationId,auditA:p.auditA,auditB:p.auditB,status:p.status,
      createdAt:p.createdAt||'',afterA:p.blocksA||[],afterB:p.blocksB||[],
      ecasComment:p.ecasComment||'',dateChanged:p.dateChanged===true,
      acknowledged:p.acknowledgedAuditorUids.includes(uid)});
  return {ok:true,readOnly:true,source:'firestore-canonical',items,
   attentionCount:actor.role==='manager'?relevant.length:relevant.filter(p=>!p.acknowledgedAuditorUids.includes(uid)).length};
 }
 async function respond({operationId,decision,actor,authorizeAuditor}={}){
  if(!ID.test(String(operationId||''))||!['ACKNOWLEDGE','DECLINE'].includes(decision)||
     !actor||String(actor.role||'').toLowerCase()!=='auditor'||!actor.email||typeof authorizeAuditor!=='function')
   throw Error('SWAP_DIRECT_RESPONSE_INVALID');
  // The caller must resolve the authenticated principal to a canonical UID.
  // A UID furnished by the browser is never accepted as authorization.
  const uid=await authorizeAuditor(actor,operationId);
  if(typeof uid!=='string'||!uid.trim())throw Error('SWAP_DIRECT_AUDITOR_UNAUTHORIZED');
  const current=await read(operationId);
  if(!current)throw Error('SWAP_DIRECT_PROPOSAL_NOT_FOUND');
  const prior=current.proposal;
  if(!Array.isArray(prior.requiredAuditorUids)||!prior.requiredAuditorUids.includes(uid))
   throw Error('SWAP_DIRECT_AUDITOR_NOT_ASSIGNED');
  if(decision==='ACKNOWLEDGE'&&prior.status==='CONFIRMED'&&
     prior.acknowledgedAuditorUids?.includes(uid))
   return {ok:true,idempotent:true,status:'CONFIRMED',operationId};
  if(!['AWAITING_ACKNOWLEDGEMENT','ESCALATED'].includes(prior.status))
   throw Error('SWAP_DIRECT_RESPONSE_STATUS_INVALID');
  const acknowledged=[...(prior.acknowledgedAuditorUids||[])];
  const next={...prior};
  if(decision==='DECLINE'){
   next.status='DECLINED';next.declinedBy=uid;next.declinedAt=new Date().toISOString();
  }else{
   if(!acknowledged.includes(uid))acknowledged.push(uid);
   next.acknowledgedAuditorUids=acknowledged;
   next.status=prior.requiredAuditorUids.every(x=>acknowledged.includes(x))?'CONFIRMED':prior.status;
  }
  const result=await compareAndSet(operationId,current.updateTime,next,()=>true);
  if(!result.ok)return {ok:false,conflict:true,code:'SWAP_DIRECT_RESPONSE_RETRY_FROM_FRESH_STATE'};
  return {ok:true,status:next.status,operationId,updateTime:result.updateTime};
 }
 return Object.freeze({read,list,create,compareAndSet,respond});
}
