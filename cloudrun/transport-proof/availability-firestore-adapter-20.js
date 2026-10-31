/** AMS Availability 2.0 — Firestore REST adapter, stateless optimistic concurrency.
 * DEV only until deployment approval. Requires Firestore database and service-account IAM.
 * CAS reads the document's updateTime immediately before writing and uses a Firestore
 * precondition, avoiding process-global cached tokens shared between requests.
 */
const enc=encodeURIComponent;
const copy=x=>structuredClone(x);
function encodeValue(v){
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return {integerValue:String(v)};
 if(typeof v==='number'&&Number.isFinite(v))return {doubleValue:v};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encodeValue)}};
 if(v&&typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encodeValue(x)]))}};
 throw Error('INVALID_FIRESTORE_VALUE');
}
function decodeValue(v){
 if('nullValue'in v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('doubleValue'in v)return Number(v.doubleValue);
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(decodeValue);
 if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeValue(x)]));
 throw Error('UNSUPPORTED_FIRESTORE_VALUE');
}
function validId(s){return typeof s==='string'&&s.length>0&&s.length<=200&&!s.includes('/')&&s!=='.'&&s!=='..';}
export function createFirestoreAvailabilityAdapter({projectId,databaseId='(default)',collection='ams_availability_20_dev',getToken,fetchImpl=fetch}={}){
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(projectId||''))throw Error('INVALID_PROJECT_ID');
 if(!validId(databaseId)||!validId(collection)||typeof getToken!=='function')throw Error('INVALID_ADAPTER_CONFIGURATION');
 const base=`https://firestore.googleapis.com/v1/projects/${enc(projectId)}/databases/${enc(databaseId)}/documents/${enc(collection)}`;
 async function request(url,init={}){
  const token=await getToken();if(!token)throw Error('FIRESTORE_AUTH_REQUIRED');
  return fetchImpl(url,{...init,headers:{authorization:`Bearer ${token}`,...(init.body?{'content-type':'application/json'}:{})}});
 }
 async function readRaw(id){
  if(!validId(id))throw Error('INVALID_AUDITOR_ID');
  const r=await request(`${base}/${enc(id)}`);
  if(r.status===404)return null;
  if(!r.ok)throw Error(`FIRESTORE_READ_${r.status}`);
  const raw=await r.json(),doc=decodeValue(raw.fields?.payload||{});
  if(doc?.auditorId!==id||!Number.isSafeInteger(doc.version)||doc.version<0||!raw.updateTime)throw Error('FIRESTORE_CORRUPT_DOCUMENT');
  return {doc,updateTime:raw.updateTime};
 }
 async function read(id){const raw=await readRaw(id);return raw?copy(raw.doc):null;}
 async function compareAndSwap(id,expectedVersion,next){
  if(!validId(id)||!Number.isSafeInteger(expectedVersion)||expectedVersion<0||expectedVersion>=Number.MAX_SAFE_INTEGER||next?.auditorId!==id||next?.version!==expectedVersion+1)throw Error('INVALID_CAS_REQUEST');
  const current=await readRaw(id);
  if((current?.doc.version??0)!==expectedVersion)return false;
  const url=new URL(`${base}/${enc(id)}`);
  if(current)url.searchParams.set('currentDocument.updateTime',current.updateTime);
  else url.searchParams.set('currentDocument.exists','false');
  const r=await request(url.toString(),{method:'PATCH',body:JSON.stringify({fields:{payload:encodeValue(next)}})});
  if([404,409,412].includes(r.status))return false;
  if(!r.ok)throw Error(`FIRESTORE_WRITE_${r.status}`);
  const written=await r.json();if(!written.updateTime)throw Error('FIRESTORE_WRITE_MISSING_VERSION');
  return true;
 }
 async function listPage({pageSize=100,pageToken=''}={}){
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>250||typeof pageToken!=='string')throw Error('INVALID_LIST_REQUEST');
  const url=new URL(base);url.searchParams.set('pageSize',String(pageSize));
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const r=await request(url.toString());
  if(!r.ok)throw Error('FIRESTORE_LIST_'+r.status);
  const data=await r.json();
  const documents=(data.documents||[]).map(raw=>{
   const id=decodeURIComponent(String(raw.name||'').split('/').at(-1)||'');
   const value=decodeValue(raw.fields?.payload||{});
   if(!validId(id)||value?.auditorId!==id||!Number.isSafeInteger(value.version))throw Error('FIRESTORE_LIST_CORRUPT_DOCUMENT');
   return {id,document:value};
  });
  return {documents,nextPageToken:data.nextPageToken||null};
 }
 return Object.freeze({read,compareAndSwap,listPage});
}