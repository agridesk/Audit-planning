/** DEV-only volatile, role-scoped Firestore mirror. GAS remains authoritative. */
const TTL=30000;
export function createSwapFirestoreReadmodel({project,getToken,fetchImpl=fetch,now=Date.now}){
 if(!/^[a-z][a-z0-9-]+$/.test(project)||typeof getToken!=='function')throw Error('SWAP_MIRROR_CONFIG');
 const base='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+'/databases/(default)/documents/ams_swap_20_dev_mirror/';
 function identity(actor){
  if(!actor||!['manager','auditor'].includes(actor.role)||!/^\S+@\S+\.\S+$/.test(actor.email||''))throw Error('SWAP_MIRROR_ROLE');
  return actor.role+':'+actor.email.toLowerCase();
 }
 function uri(actor){return base+encodeURIComponent(identity(actor).replace(/[^a-z0-9]/gi,'_'));}
 async function call(url,method,body){
  const token=await getToken();
  const r=await fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return r;
 }
 function check(data){
  if(data?.ok!==true||!Array.isArray(data.items)||data.items.length>100||!Number.isSafeInteger(data.attentionCount))throw Error('SWAP_MIRROR_INVALID');
  return data;
 }
 async function read(actor){
  const r=await call(uri(actor),'GET');
  if(r.status===404)return null;
  if(!r.ok)throw Error('SWAP_MIRROR_READ_'+r.status);
  const doc=await r.json(),f=doc.fields||{};
  if(f.actor?.stringValue!==identity(actor))return null;
  const until=Number(f.until?.integerValue||0);
  if(!Number.isSafeInteger(until)||until<=now()||until>now()+TTL)return null;
  return check(JSON.parse(f.payload?.stringValue||'{}'));
 }
 async function save(actor,data){
  const raw=JSON.stringify(check(data));
  if(raw.length>100000)throw Error('SWAP_MIRROR_TOO_LARGE');
  const r=await call(uri(actor),'PATCH',{fields:{
   actor:{stringValue:identity(actor)},payload:{stringValue:raw},until:{integerValue:String(now()+TTL)}
  }});
  if(!r.ok)throw Error('SWAP_MIRROR_SAVE_'+r.status);
 }
 async function invalidate(actor){
  const r=await call(uri(actor),'DELETE');
  if(r.status!==404&&!r.ok)throw Error('SWAP_MIRROR_INVALIDATE_'+r.status);
 }
 return {read,save,invalidate};
}
