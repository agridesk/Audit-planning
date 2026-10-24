/**
 * DEV Firestore complete reservation-index reader.
 * Scans the entire canonical availability collection, including pagination.
 * The caller must supply the canonical collection populated for all auditors.
 * This is a preflight index, not a replacement for transactional conflict locks.
 */
export function createSwapFirestoreReservationIndex({project,getToken,fetchImpl=fetch,maxPages=100}={}){
 if(typeof project!=='string'||!project.endsWith('-dev')||typeof getToken!=='function')
  throw Error('SWAP_INDEX_CONFIG_INVALID');
 const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_swap20_dev_availability';
 async function loadCompleteReservationIndex(){
  const token=await getToken();
  if(!token)throw Error('SWAP_INDEX_TOKEN_MISSING');
  const reservations=[],seen=new Set();
  let pageToken='';
  for(let page=0;page<maxPages;page++){
   const target=url+'?pageSize=100'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):'');
   const response=await fetchImpl(target,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('SWAP_INDEX_HTTP_'+response.status);
   const result=await response.json();
   if(!Array.isArray(result.documents)&&result.documents!==undefined)throw Error('SWAP_INDEX_RESPONSE_INVALID');
   for(const document of result.documents||[]){
    if(!document.name?.startsWith('projects/'+project+'/databases/(default)/documents/ams_swap20_dev_availability/'))
     throw Error('SWAP_INDEX_DOCUMENT_INVALID');
    if(seen.has(document.name))throw Error('SWAP_INDEX_DUPLICATE_DOCUMENT');
    seen.add(document.name);
    let record;
    try{record=JSON.parse(document.fields?.payload?.stringValue||'null');}
    catch{throw Error('SWAP_INDEX_PAYLOAD_INVALID');}
    if(!record||!Array.isArray(record.reservations))throw Error('SWAP_INDEX_RESERVATIONS_INVALID');
    reservations.push(...record.reservations);
   }
   if(!result.nextPageToken)return {complete:true,reservations,documentCount:seen.size};
   if(result.nextPageToken===pageToken)throw Error('SWAP_INDEX_PAGINATION_LOOP');
   pageToken=result.nextPageToken;
  }
  throw Error('SWAP_INDEX_PAGE_LIMIT');
 }
 return Object.freeze({loadCompleteReservationIndex});
}
