/**
 * DEV Firestore complete reservation-index reader.
 * Scans the entire canonical availability collection, including pagination.
 * The caller must supply the canonical collection populated for all auditors.
 * This is a preflight index, not a replacement for transactional conflict locks.
 */
export function createSwapFirestoreReservationIndex({project,getToken,fetchImpl=fetch,maxPages=100}={}){
 if(!/^[a-z][a-z0-9-]{4,62}-dev$/.test(project||'')||typeof getToken!=='function'||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>1000)
  throw Error('SWAP_INDEX_CONFIG_INVALID');
 const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_swap20_dev_availability';
 async function loadCompleteReservationIndex(){
  const token=await getToken();
  if(!token)throw Error('SWAP_INDEX_TOKEN_MISSING');
  const reservations=[],seen=new Set(),seenReservations=new Set();
  let pageToken='';
  const visitedTokens=new Set();
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
    const auditId=document.name.split('/').pop();
    if(!/^[A-Za-z0-9_-]{1,140}$/.test(auditId))throw Error('SWAP_INDEX_AUDIT_ID_INVALID');
    for(const reservation of record.reservations){
     if(!reservation||reservation.auditId!==auditId)throw Error('SWAP_INDEX_RESERVATION_ID_MISMATCH');
     if(typeof reservation.owner!=='string'||!reservation.owner.includes('@')||!/^\d{4}-\d{2}-\d{2}$/.test(reservation.date||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(reservation.start||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(reservation.end||''))throw Error('SWAP_INDEX_RESERVATION_SHAPE_INVALID');
     const key=[reservation.auditId,reservation.owner,reservation.date,reservation.start,reservation.end].join('|');
     if(seenReservations.has(key))throw Error('SWAP_INDEX_DUPLICATE_RESERVATION');
     seenReservations.add(key);
     reservations.push(reservation);
    }
   }
   if(!result.nextPageToken)return {complete:true,reservations,documentCount:seen.size};
   if(result.nextPageToken===pageToken||visitedTokens.has(result.nextPageToken))throw Error('SWAP_INDEX_PAGINATION_LOOP');
   visitedTokens.add(result.nextPageToken);
   pageToken=result.nextPageToken;
  }
  throw Error('SWAP_INDEX_PAGE_LIMIT');
 }
 return Object.freeze({loadCompleteReservationIndex});
}
