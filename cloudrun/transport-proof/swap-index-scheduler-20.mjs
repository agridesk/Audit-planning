/** DEV SWAP Firestore reconciliation. Requires verified Cloud Scheduler OIDC. */
export function createSwapIndexScheduler({index,roster,gasCall,serviceEmail,audience,fetchImpl=fetch,now=Date.now}={}){
 if(!index||typeof roster!=='function'||typeof gasCall!=='function')throw Error('SWAP_SCHEDULER_DEPENDENCIES');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(serviceEmail||'')||!/^https:\/\/[^/]+$/.test(audience||''))throw Error('SWAP_SCHEDULER_CONFIG');
 async function verify(auth){
  const matched=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(auth||''));
  if(!matched)return false;
  const response=await fetchImpl('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(matched[1]),{signal:AbortSignal.timeout(10000)});
  if(!response.ok)return false;
  const t=await response.json();
  return t.aud===audience&&t.email===serviceEmail&&
   (t.email_verified===true||t.email_verified==='true')&&
   ['https://accounts.google.com','accounts.google.com'].includes(t.iss)&&
   Number(t.exp)>Math.floor(now()/1000)&&typeof t.sub==='string'&&t.sub.length>0;
 }
 async function reconcile(){
  const records=await roster(),manager=records.find(x=>x.role==='manager'&&x.email&&x.auditorId);
  if(!manager)throw Error('SWAP_SCHEDULER_NO_MANAGER');
  const seed=await gasCall({role:'manager',email:manager.email,auditorId:manager.auditorId},'listIndexSeed',{},'externalswap20');
  if(seed?.ok!==true||!Array.isArray(seed.records)){ console.error('[SWAP_SEED_REJECTED]',JSON.stringify({ok:seed?.ok,code:String(seed?.error||'MISSING_RECORDS').slice(0,80)}));throw Error('SWAP_SCHEDULER_SEED_FAILED'); }
  const meta=await index.meta();
  const updated=meta?await index.reconcile(seed.records):await index.bootstrap(seed.records);
  if(!updated)throw Error('SWAP_SCHEDULER_RECONCILIATION_BUSY');
  return {ok:true,records:seed.records.length};
 }
 return Object.freeze({verify,reconcile});
}
