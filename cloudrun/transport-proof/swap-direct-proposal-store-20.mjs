/**
 * SWAP 2.0 DEV-only Firestore proposal persistence prototype.
 * This is deliberately NOT connected to the production SWAP request router.
 * Canonical audit/availability changes require a separate transactional migration.
 */
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const COLLECTION='ams_swap20_dev_proposals';
export function createSwapDirectProposalStore({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(project||''))throw Error('SWAP_DIRECT_PROJECT_INVALID');
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
    !Array.isArray(proposal.acknowledgedAuditorUids)||proposal.acknowledgedAuditorUids.length)
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
  if(validateTransition(prior.proposal,next)!==true)throw Error('SWAP_DIRECT_TRANSITION_REJECTED');
  const url=new URL(base+'/'+encodeURIComponent(operationId));
  url.searchParams.set('currentDocument.updateTime',expectedUpdateTime);
  const raw=await request(url.toString(),{method:'PATCH',body:JSON.stringify(encode(next))});
  if(!raw)return {ok:false,conflict:true};
  return {ok:true,proposal:decode(raw),updateTime:raw.updateTime};
 }
 return Object.freeze({read,create,compareAndSet});
}
