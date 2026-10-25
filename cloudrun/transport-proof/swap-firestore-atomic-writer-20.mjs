/**
 * DEV-only Firestore atomic SWAP transaction boundary.
 * The caller must supply complete, validated canonical document writes.
 * Not wired into active SWAP: spreadsheet-based canonical state cannot be
 * changed atomically by Firestore and must be migrated before enabling.
 */
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const DOC=/^projects\/[a-z][a-z0-9-]{4,62}\/databases\/\(default\)\/documents\/[A-Za-z0-9_/-]+$/;
const MAX_WRITES=100;
export function createSwapFirestoreAtomicWriter({project,getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||'')||typeof getToken!=='function')
  throw Error('SWAP_ATOMIC_CONFIG_INVALID');
 const root='projects/'+project+'/databases/(default)/documents/';
 const endpoint='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents:commit';
 function validWrite(write){
  const doc=write?.update?.name||write?.delete||write?.transform?.document;
  if(typeof doc!=='string'||!DOC.test(doc)||!doc.startsWith(root))return false;
  if(write.update&&(!write.update.fields||typeof write.update.fields!=='object'))return false;
  const pre=write.currentDocument;
  if(!pre||typeof pre!=='object'||(typeof pre.updateTime!=='string'&&typeof pre.exists!=='boolean'))return false;
  if(pre.updateTime!==undefined&&!/^\d{4}-\d{2}-\d{2}T/.test(pre.updateTime))return false;
  if(pre.updateTime&&pre.exists!==undefined)return false;
  if(pre.exists===true)return false;
  return true;
 }
 async function commit({operationId,writes}={}){
  if(!ID.test(String(operationId||'')))throw Error('SWAP_ATOMIC_OPERATION_INVALID');
  if(!Array.isArray(writes)||writes.length<3||writes.length>MAX_WRITES||writes.some(w=>!validWrite(w)))
   throw Error('SWAP_ATOMIC_WRITES_INVALID');
  const names=writes.map(w=>w.update?.name||w.delete||w.transform?.document);
  if(new Set(names).size!==names.length)throw Error('SWAP_ATOMIC_DUPLICATE_DOCUMENT');
  if(!writes.some(w=>w.update?.name===root+'ams_swap20_dev_journal/'+operationId&&w.currentDocument?.exists===false))
   throw Error('SWAP_ATOMIC_JOURNAL_REQUIRED');
  if(!writes.some(w=>w.update?.name===root+'ams_swap20_dev_meta/reservation_fence'&&typeof w.currentDocument?.updateTime==='string'))
   throw Error('SWAP_ATOMIC_RESERVATION_FENCE_REQUIRED');
  const allowed=new Set(['ams_swap20_dev_audits','ams_swap20_dev_availability','ams_swap20_dev_proposals','ams_swap20_dev_journal','ams_swap20_dev_meta']);
  if(names.some(name=>!allowed.has(name.slice(root.length).split('/')[0])))throw Error('SWAP_ATOMIC_COLLECTION_FORBIDDEN');
  if(names.some(name=>name.slice(root.length).split('/').length!==2))throw Error('SWAP_ATOMIC_DOCUMENT_PATH_INVALID');
  const token=await getToken();
  if(!token)throw Error('SWAP_ATOMIC_TOKEN_MISSING');
  const response=await fetchImpl(endpoint,{
   method:'POST',
   headers:{authorization:'Bearer '+token,'content-type':'application/json'},
   body:JSON.stringify({writes}),
   signal:AbortSignal.timeout(20000)
  });
  if(response.status===409||response.status===412)return {ok:false,conflict:true};
  if(!response.ok)throw Error('SWAP_ATOMIC_HTTP_'+response.status);
  const receipt=await response.json();
  if(!Array.isArray(receipt.writeResults)||receipt.writeResults.length!==writes.length)
   throw Error('SWAP_ATOMIC_RECEIPT_UNVERIFIED');
  return {ok:true,commitTime:receipt.commitTime,writeCount:receipt.writeResults.length};
 }
 return Object.freeze({commit});
}
