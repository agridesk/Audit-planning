/** DEV-only guarded per-audit Firestore backfill.
 * Seed is atomic PER AUDIT, at most 100 linked obligations. No global cutover.
 * Never marks writerFenceVerified true; a separate verified handoff is mandatory.
 */
const str=x=>String(x??'').trim();
const valid=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..';
const encode=v=>{if(v===null)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number'&&Number.isSafeInteger(v))return{integerValue:String(v)};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,val])=>val!==undefined).map(([k,val])=>[k,encode(val)]))}};throw Error('EXT_SEED_ENCODE_INVALID')};
const decode=v=>{if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('integerValue'in v)return Number(v.integerValue);if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,val])=>[k,decode(val)]));throw Error('EXT_SEED_DECODE_INVALID')};
export function createScopeExtensionFirestoreSeeder20({projectId,getToken,fetchImpl=fetch,writeEnabled=false,writerFenceEvidenceVerified=false,prefix='ams_scope_extension_20_dev'}={}){
 if(writeEnabled!==true||writerFenceEvidenceVerified!==true)throw Error('EXT_SEED_WRITE_DISABLED');
 if(projectId!=='audit-management-system-dev'||typeof getToken!=='function'||!valid(prefix))throw Error('EXT_SEED_DEV_IDENTITY_INVALID');
 const root='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents';
 const doc=(kind,id)=>{if(!['obligation','auditcontext'].includes(kind)||!valid(id))throw Error('EXT_SEED_ID_INVALID');return root+'/'+prefix+'_'+kind+'/'+encodeURIComponent(id)};
 const request=async(url,method='GET',payload)=>{const token=await getToken();if(!token)throw Error('EXT_SEED_TOKEN_MISSING');return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})})};
 const get=async(kind,id)=>{const response=await request(doc(kind,id));if(response.status===404)return null;if(!response.ok)throw Error('EXT_SEED_READ_'+response.status);const raw=await response.json();if(!raw.fields?.payload)throw Error('EXT_SEED_CORRUPT');return decode(raw.fields.payload)};
 async function seedAudit({context,obligations,sourceSnapshotHash}={}){
  if(!context||!valid(context.auditId)||!valid(context.companyUid)||context.writerFenceVerified!==false||!Array.isArray(context.obligationIds)||context.obligationIds.length<1||context.obligationIds.length>100||!Array.isArray(obligations)||obligations.length!==context.obligationIds.length||!Object.keys(context.policyByScope||{}).length||!/^[a-f0-9]{64}$/.test(str(sourceSnapshotHash)))throw Error('EXT_SEED_INPUT_INVALID');
  const ids=new Set(context.obligationIds),docIds=new Set();
  for(const o of obligations)if(!valid(o.obligationId)||docIds.has(o.obligationId)||!ids.has(o.obligationId)||o.auditId!==context.auditId||o.companyUid!==context.companyUid||o.revision!==0||o.pendingProjectionId!==''||o.linkState!=='ACTIVE')throw Error('EXT_SEED_LINEAGE_INVALID');else docIds.add(o.obligationId);
  const expected=[{kind:'auditcontext',key:context.auditId,value:{...context,sourceSnapshotHash} },...obligations.map(x=>({kind:'obligation',key:x.obligationId,value:{...x,sourceSnapshotHash}}))];
  const existing=await Promise.all(expected.map(e=>get(e.kind,e.key)));
  const present=existing.filter(Boolean).length;
  if(present===expected.length){for(let i=0;i<expected.length;i++)if(JSON.stringify(existing[i])!==JSON.stringify(expected[i].value))throw Error('EXT_SEED_EXISTING_DATA_CONFLICT');return{auditId:context.auditId,seeded:false,idempotent:true,records:expected.length}}
  if(present!==0)throw Error('EXT_SEED_PARTIAL_EXISTING_CONTEXT');
  const writes=expected.map(e=>({update:{name:doc(e.kind,e.key),fields:{payload:encode(e.value)}},currentDocument:{exists:false}}));
  const committed=await request(root+':commit','POST',{writes});
  if(!committed.ok)throw Error('EXT_SEED_COMMIT_'+committed.status);
  const check=await Promise.all(expected.map(e=>get(e.kind,e.key)));
  for(let i=0;i<expected.length;i++)if(JSON.stringify(check[i])!==JSON.stringify(expected[i].value))throw Error('EXT_SEED_READBACK_MISMATCH');
  return{auditId:context.auditId,seeded:true,idempotent:false,records:expected.length,cutoverEnabled:false};
 }
 return Object.freeze({seedAudit});
}
