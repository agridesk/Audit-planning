export function createSwapReservationFenceReader({project,getToken,fetchImpl=fetch}){
 if(!project?.endsWith('-dev')||typeof getToken!=='function')throw Error('SWAP_FENCE_READER_CONFIG');
 return async function readFence(){
  const token=await getToken();
  const url='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/ams_swap20_dev_meta/reservation_fence';
  const response=await fetchImpl(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('SWAP_FENCE_READ_HTTP_'+response.status);
  const data=await response.json();
  if(!/^\d{4}-\d{2}-\d{2}T/.test(data.updateTime||''))throw Error('SWAP_FENCE_REVISION_INVALID');
  return {revision:data.updateTime};
 };
}
