/** Bounded, short-lived canonical planning read cache. DEV Availability 2.0. */
export function createPlanningReadCache({load,ttlMs=10000,now=()=>Date.now()}={}){
 if(typeof load!=='function')throw Error('AVAILABILITY_PLANNING_LOADER_REQUIRED');
 if(!Number.isFinite(ttlMs)||ttlMs<0)throw Error('AVAILABILITY_CACHE_TTL_INVALID');
 let value=null,expires=0,inFlight=null;
 async function read(){
  const t=now();
  if(value!==null&&t<expires)return value;
  if(inFlight)return inFlight;
  inFlight=Promise.resolve().then(load).then(rows=>{
   if(!Array.isArray(rows)||rows.length===0)throw Error('CANONICAL_PLANNING_INCOMPLETE');
   value=rows;expires=now()+ttlMs;return rows;
  }).finally(()=>{inFlight=null;});
  return inFlight;
 }
 function invalidate(){value=null;expires=0;}
 return {read,invalidate};
}
