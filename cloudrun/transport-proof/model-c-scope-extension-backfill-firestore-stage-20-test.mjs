import assert from 'node:assert/strict';
import {createScopeExtensionFirestoreStager20} from './model-c-scope-extension-backfill-firestore-stage-20.mjs';
import {prepareScopeExtensionBackfill20} from './model-c-scope-extension-backfill-prepare-20.mjs';
const manifest=prepareScopeExtensionBackfill20({
 obligationRows:[['Obligation_ID','Company_UID','ScopeCode','Trigger_Source','Obligation_State','Base_Expiry_Date','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To','Extension_Applied','Extension_Metadata_JSON','Source_Audit_ID'],
  ['O1','C1','GAP','CERTIFICATE_LIFECYCLE','LINKED_TO_VISIT','30/09/2026','30/09/2026','30/05/2026','30/09/2026','','','A1'],
  ['O2','C1','GRASP','CERTIFICATE_LIFECYCLE','LINKED_TO_VISIT','30/09/2026','30/09/2026','30/05/2026','30/09/2026','','','A1']],
 linkRows:[['Audit_ID','Obligation_ID','Link_State'],['A1','O1','ACTIVE'],['A1','O2','ACTIVE']],
 planningRows:[['Audit ID','Status'],['A1','Pending Planning']],
 scopeRows:[['ScopeCode','Extension','Planning from','Planning to','Trigger source'],['GAP','4','-4','-1',''],['GRASP','4','-4','-2','']]
});
const documents=new Map();
let writes=0,breakReadback=false;
const response=(status,body)=>({status,ok:status>=200&&status<300,async json(){return body}});
function jsonEncode(v){if(v===null)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number')return{integerValue:String(v)};if(Array.isArray(v))return{arrayValue:{values:v.map(jsonEncode)}};return{mapValue:{fields:Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,jsonEncode(x)]))}}}
const fakeFetch=async(url,options)=>{
 const parsed=new URL(url),method=options.method;
 assert.equal(parsed.hostname,'firestore.googleapis.com');
 assert.equal(options.headers.authorization,'Bearer TEST');
 if(method==='GET'){
  const prefix=parsed.pathname.split('/').at(-1);
  const list=[...documents.entries()].filter(([key])=>key.split('/')[0]===prefix).map(([key,value])=>({name:parsed.origin+parsed.pathname+'/'+key.split('/')[1],fields:{payload:jsonEncode(value)}}));
  if(breakReadback&&list.length)list[0].fields.payload=jsonEncode({...list[0].fields.payload,wrong:true});
  return response(200,list.length?{documents:list}:{});
 }
 if(method==='POST'&&parsed.pathname.endsWith('/documents:commit')){
  writes++;
  const body=JSON.parse(options.body);
  assert.equal(body.writes.length,3);
  assert(body.writes.every(x=>x.currentDocument?.exists===false));
  assert(body.writes.every(x=>x.update?.fields?.payload));
  const names=body.writes.map(x=>x.update.name.split('/documents/')[1]);
  if(names.some(x=>documents.has(x)))return response(409,{error:'already exists'});
  for(let i=0;i<names.length;i++){
   const requested=body.writes[i].update.fields.payload;
   const decode=v=>{
    if('stringValue'in v)return v.stringValue;if('integerValue'in v)return Number(v.integerValue);
    if('booleanValue'in v)return v.booleanValue;if('nullValue'in v)return null;
    if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);
    if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
   };
   documents.set(names[i],decode(requested));
  }
  return response(200,{commitTime:'NOW'});
 }
 throw Error('UNEXPECTED_REQUEST_'+method+'_'+parsed.pathname);
};
const make=(options={})=>createScopeExtensionFirestoreStager20({projectId:'audit-management-system-dev',getToken:async()=>'TEST',fetchImpl:fakeFetch,...options});
assert.throws(()=>createScopeExtensionFirestoreStager20({projectId:'audit-management-system-prod',getToken:async()=>'TEST'}),/NOT_DEV/);
const store=make();
assert.deepEqual((await store.inspectEmpty()).counts,{obligation:0,auditcontext:0,event:0,outbox:0});
await assert.rejects(store.stage({manifest,expectedSha256:manifest.sourceManifest}),/APPROVAL_REQUIRED/);
await assert.rejects(store.stage({manifest,expectedSha256:'0'.repeat(64),approved:true}),/SOURCE_MANIFEST_CHANGED/);
await assert.rejects(store.stage({manifest:{...manifest,contexts:manifest.contexts.map(x=>({...x,writerFenceVerified:true}))},expectedSha256:manifest.sourceManifest,approved:true}),/WRITER_FLAG_FORBIDDEN/);
assert.equal(writes,0);
const done=await store.stage({manifest,expectedSha256:manifest.sourceManifest,approved:true,cutoverVerified:false});
assert.equal(done.staged,true);
assert.equal(done.parity,true);
assert.deepEqual(done.counts,{obligation:2,auditcontext:1,event:0,outbox:0});
assert.equal(done.writerEnabled,false);
assert.equal(writes,1);
await assert.rejects(store.stage({manifest,expectedSha256:manifest.sourceManifest,approved:true}),/TARGET_NOT_EMPTY/);
assert.equal(writes,1,'no second commit');
const rechecked=await store.verify(manifest);
assert.equal(rechecked.parity,true);
assert.equal(rechecked.writerEnabled,false,'readback must never infer writer cutover');
breakReadback=true;
const corrupt=await store.verify(manifest);
assert.equal(corrupt.parity,false,'readback drift must fail parity');
assert.equal(writes,1);
console.log('PASS atomic create-only stage: target freeze, manifest SHA, writer flags, no overwrite and readback parity');
