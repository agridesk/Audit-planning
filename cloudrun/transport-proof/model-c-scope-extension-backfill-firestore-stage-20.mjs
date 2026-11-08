/**
 * DEV-only Model C EXT STAGING. This is NOT a cutover.
 * A single Firestore commit creates all obligation and auditcontext docs with
 * exists:false preconditions, after proving four target collections empty.
 * Every staged auditcontext retains writerFenceVerified:false.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const stableSha=x=>sha(canonical(x));
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..';
const kinds=['obligation','auditcontext','event','outbox'];
function encode(v){
 if(v===null)return{nullValue:null};
 if(typeof v==='string')return{stringValue:v};
 if(typeof v==='boolean')return{booleanValue:v};
 if(typeof v==='number'&&Number.isSafeInteger(v))return{integerValue:String(v)};
 if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};
 if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]))}};
 throw Error('EXT_STAGE_VALUE_INVALID');
}
function decode(v){
 if(Object.hasOwn(v,'nullValue'))return null;
 if(Object.hasOwn(v,'stringValue'))return v.stringValue;
 if(Object.hasOwn(v,'booleanValue'))return v.booleanValue;
 if(Object.hasOwn(v,'integerValue'))return Number(v.integerValue);
 if(Object.hasOwn(v,'arrayValue'))return(v.arrayValue.values||[]).map(decode);
 if(Object.hasOwn(v,'mapValue'))return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
 throw Error('EXT_STAGE_FIRESTORE_VALUE_CORRUPT');
}
export function createScopeExtensionFirestoreStager20({projectId,getToken,fetchImpl=fetch,prefix='ams_scope_extension_20_dev',databaseId='(default)'}={}){
 if(projectId!=='audit-management-system-dev'||prefix!=='ams_scope_extension_20_dev'||databaseId!=='(default)'||typeof getToken!=='function'||typeof fetchImpl!=='function')throw Error('EXT_STAGE_TARGET_NOT_DEV');
 const base='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents';
 const collection=kind=>{if(!kinds.includes(kind))throw Error('EXT_STAGE_KIND_INVALID');return base+'/'+prefix+'_'+kind};
 const location=(kind,key)=>{if(!validId(key))throw Error('EXT_STAGE_DOC_ID_INVALID');return collection(kind)+'/'+encodeURIComponent(key)};
 async function request(url,method='GET',body){
  const token=await getToken();if(!token)throw Error('EXT_STAGE_TOKEN_MISSING');
  return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }
 async function scan(kind,{withValues=false}={}){
  let token='',count=0,items=[],pages=0;
  do{
   const u=new URL(collection(kind));u.searchParams.set('pageSize','200');if(token)u.searchParams.set('pageToken',token);
   const r=await request(u.toString());
   if(r.status===404)return{count:0,items:[]};
   if(!r.ok)throw Error('EXT_STAGE_SCAN_'+kind+'_'+r.status);
   const data=await r.json();
   if(!Array.isArray(data.documents)&&data.documents!==undefined)throw Error('EXT_STAGE_SCAN_INVALID');
   const docs=data.documents||[];count+=docs.length;
   if(withValues){
    for(const document of docs){
     const key=decodeURIComponent(str(document.name).split('/').at(-1));
     if(!validId(key)||!document.fields?.payload)throw Error('EXT_STAGE_READBACK_CORRUPT');
     items.push({id:key,payload:decode(document.fields.payload)});
    }
   }
   token=str(data.nextPageToken);pages++;if(pages>100)throw Error('EXT_STAGE_SCAN_LIMIT_EXCEEDED');
  }while(token);
  return{count,items};
 }
 async function inspectEmpty(){
  const counts={};for(const kind of kinds)counts[kind]=(await scan(kind)).count;
  return{empty:kinds.every(kind=>counts[kind]===0),counts};
 }
 const manifestCheck=manifest=>{
  if(manifest?.readOnly!==true||manifest?.writeAuthorized!==false||!/^[a-f0-9]{64}$/.test(str(manifest?.sourceManifest))||!Array.isArray(manifest?.obligations)||!Array.isArray(manifest?.contexts))throw Error('EXT_STAGE_MANIFEST_INVALID');
  if(!manifest.obligations.length||!manifest.contexts.length||manifest.obligations.length+manifest.contexts.length>450)throw Error('EXT_STAGE_MANIFEST_SIZE_INVALID');
  const seen=new Set();
  for(const [kind,items,idField] of [['obligation',manifest.obligations,'obligationId'],['auditcontext',manifest.contexts,'auditId']]){
   for(const row of items){
    if(!validId(row[idField])||seen.has(kind+'|'+row[idField]))throw Error('EXT_STAGE_DUPLICATE_ID');
    seen.add(kind+'|'+row[idField]);
    if(kind==='auditcontext'&&(row.writerFenceVerified!==false||row.migrationState!=='STAGED_UNVERIFIED'))throw Error('EXT_STAGE_WRITER_FLAG_FORBIDDEN');
    if(kind==='obligation'&&(row.stagingWriterFenceVerified!==false||row.pendingProjectionId!==''||row.revision!==0))throw Error('EXT_STAGE_OBLIGATION_NOT_INERT');
   }
  }
  const check=sha({obligations:manifest.obligations,contexts:manifest.contexts});
  if(check!==manifest.sourceManifest)throw Error('EXT_STAGE_MANIFEST_SHA_MISMATCH');
 };
 async function verify(manifest){
  manifestCheck(manifest);
  const [obligations,contexts,events,outbox]=await Promise.all(kinds.map(kind=>scan(kind,{withValues:true})));
  if(events.count||outbox.count)throw Error('EXT_STAGE_EVENT_OR_OUTBOX_NOT_EMPTY');
  const compare=(actual,expected,idField)=>actual.count===expected.length
    &&actual.items.every(row=>{
      const item=expected.find(x=>x[idField]===row.id);
      return item&&stableSha(item)===stableSha(row.payload);
    });
  const parity=compare(obligations,manifest.obligations,'obligationId')&&compare(contexts,manifest.contexts,'auditId');
  return{parity,counts:{obligation:obligations.count,auditcontext:contexts.count,event:events.count,outbox:outbox.count},sourceManifest:manifest.sourceManifest,writerEnabled:false};
 }
 async function stage({manifest,expectedSha256,approved=false,cutoverVerified=false}={}){
  if(approved!==true||cutoverVerified!==false)throw Error('EXT_STAGE_EXPLICIT_APPROVAL_REQUIRED');
  manifestCheck(manifest);
  if(expectedSha256!==manifest.sourceManifest)throw Error('EXT_STAGE_SOURCE_MANIFEST_CHANGED');
  const initial=await inspectEmpty();
  if(!initial.empty)throw Error('EXT_STAGE_TARGET_NOT_EMPTY');
  const writes=[
   ...manifest.obligations.map(value=>({kind:'obligation',key:value.obligationId,value})),
   ...manifest.contexts.map(value=>({kind:'auditcontext',key:value.auditId,value}))
  ].map(({kind,key,value})=>({update:{name:location(kind,key),fields:{payload:encode(value)}},currentDocument:{exists:false}}));
  // One atomic create-only commit: no partial batches and no overwrite possible.
  const reply=await request(base+':commit','POST',{writes});
  if(!reply.ok)throw Error('EXT_STAGE_COMMIT_'+reply.status);
  const checked=await verify(manifest);
  if(!checked.parity)throw Error('EXT_STAGE_READBACK_PARITY_FAILED');
  return{staged:true,...checked,writerEnabled:false};
 }
 return Object.freeze({inspectEmpty,verify,stage});
}
