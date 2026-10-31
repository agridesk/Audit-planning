/** Bounded planning read cache. Mutations ALWAYS bypass cached data. */
export function createPlanningReadCache({load,ttlMs=10000,clock=()=>Date.now()}={}){
 if(typeof load!=='function'||!Number.isInteger(ttlMs)||ttlMs<0||ttlMs>30000)throw Error('INVALID_PLANNING_CACHE_CONFIGURATION');
 let rows=null,until=0,inFlight=null,generation=0;
 function invalidate(){generation++;rows=null;until=0;inFlight=null;}
 async function read({fresh=false}={}){
  if(fresh){const value=await load();if(!Array.isArray(value)||!value.length)throw Error('CANONICAL_PLANNING_INCOMPLETE');return value;}
  if(rows&&clock()<until)return rows;
  if(inFlight)return inFlight;
  const currentGeneration=generation;
  const pending=Promise.resolve().then(load).then(value=>{
   if(!Array.isArray(value)||!value.length)throw Error('CANONICAL_PLANNING_INCOMPLETE');
   if(generation===currentGeneration){rows=value;until=clock()+ttlMs;}return value;
  });
  inFlight=pending;
  try{return await pending;}finally{if(inFlight===pending)inFlight=null;}
 }
 return Object.freeze({read,invalidate});
}