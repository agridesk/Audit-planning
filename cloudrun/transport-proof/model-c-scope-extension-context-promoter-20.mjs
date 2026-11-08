/** DEV-only atomic promotion of a seeded Model C audit context.
 * Caller must supply a prevalidated, independent writer-freeze + parity plan.
 * No global cutover and no migration of legacy Undo provenance.
 */
import {createHash} from 'node:crypto';
const str=x=>String(x??'').trim();
const id=x=>typeof x==='string'&&x.length>0&&x.length<=180&&!/[\\/]/.test(x)&&x!=='.'&&x!=='..';
const encode=v=>{if(v===null)return{nullValue:null};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number'&&Number.isSafeInteger(v))return{integerValue:String(v)};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};if(v&&typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,encode(x)]))}};throw Error('EXT_PROMOTE_ENCODING_INVALID')};
const decode=v=>{if('nullValue'in v)return null;if('stringValue'in v)return v.stringValue;if('booleanValue'in v)return v.booleanValue;if('integerValue'in v)return Number(v.integerValue);if('arrayValue'in v)return(v.arrayValue.values||[]).map(decode);if('mapValue'in v)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));throw Error('EXT_PROMOTE_DECODE_INVALID')};
export function createScopeExtensionContextPromoter20({projectId,getToken,fetchImpl=fetch,writeEnabled=false,approvedPlan=null}={}){
 if(projectId!=='audit-management-system-dev'||typeof getToken!=='function'||writeEnabled!==true||approvedPlan?.promotionPrepared!==true||approvedPlan?.readOnly!==true||approvedPlan?.cutoverApproved!==false||approvedPlan?.projectId!==projectId||!Array.isArray(approvedPlan.promotions)||!approvedPlan.promotions.length||!/^[0-9a-f]{64}$/.test(str(approvedPlan.sourceSnapshotSha256))||!str(approvedPlan.writerFreezeEvidenceRef)||!str(approvedPlan.sourceParityEvidenceRef)||!str(approvedPlan.seedParityEvidenceRef))throw Error('EXT_PROMOTE_INDEPENDENT_GATE_REQUIRED');
 const root='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents';
 const resource=(kind,key)=>{if(!['obligation','auditcontext','event'].includes(kind)||!id(key))throw Error('EXT_PROMOTE_DOCUMENT_ID_INVALID');return 'projects/'+projectId+'/databases/(default)/documents/ams_scope_extension_20_dev_'+kind+'/'+encodeURIComponent(key)};
 const path=(kind,key)=>'https://firestore.googleapis.com/v1/'+resource(kind,key);
 const request=async(url,method='GET',body)=>{const token=await getToken();if(!str(token))throw Error('EXT_PROMOTE_ACCESS_TOKEN_REQUIRED');return fetchImpl(url,{method,headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})};
 const read=async(kind,key)=>{const r=await request(path(kind,key));if(r.status===404)return null;if(!r.ok)throw Error('EXT_PROMOTE_READ_HTTP_'+r.status);const data=await r.json();if(!data.updateTime||!data.fields?.payload)throw Error('EXT_PROMOTE_DOCUMENT_CORRUPT');return{value:decode(data.fields.payload),updateTime:data.updateTime}};
 async function promoteAudit(auditId){
  const selected=approvedPlan.promotions.filter(x=>x.auditId===auditId);
  if(selected.length!==1)throw Error('EXT_PROMOTE_AUDIT_NOT_IN_APPROVED_PLAN');
  const expected=selected[0],sourceHash=approvedPlan.sourceSnapshotSha256;
  if(!id(expected.auditId)||!id(expected.companyUid)||expected.writerFenceVerified!==true||expected.expectedRevision!==0||expected.sourceSnapshotSha256!==sourceHash||!Array.isArray(expected.obligationIds)||expected.obligationIds.length<1||expected.obligationIds.length>100||new Set(expected.obligationIds).size!==expected.obligationIds.length||!expected.obligationIds.every(id))throw Error('EXT_PROMOTE_PLAN_CONTEXT_INVALID');
  const current=await read('auditcontext',auditId);
  if(!current||current.value.auditId!==auditId||current.value.companyUid!==expected.companyUid||!['STAGED_UNVERIFIED','WRITER_VERIFIED'].includes(current.value.migrationState)||(current.value.writerFenceVerified===false&&(current.value.revision!==undefined&&current.value.revision!==0))||(current.value.writerFenceVerified===true&&current.value.sourceSnapshotHash!==sourceHash)||!Array.isArray(current.value.obligationIds)||current.value.obligationIds.length!==expected.obligationIds.length||current.value.obligationIds.some((x,i)=>x!==expected.obligationIds[i]))throw Error('EXT_PROMOTE_SEEDED_CONTEXT_MISMATCH');
  const eventId='EXT_WRITER_PROMOTION_'+createHash('sha256').update(auditId).digest('hex');
  const already=await read('event',eventId);
  if(current.value.writerFenceVerified===true){
   if(current.value.revision!==1||!already||already.value.kind!=='MODEL_C_WRITER_PROMOTION'||already.value.auditId!==auditId||already.value.sourceSnapshotSha256!==sourceHash||current.value.writerFreezeEvidenceRef!==approvedPlan.writerFreezeEvidenceRef)throw Error('EXT_PROMOTE_EXISTING_AUTHORITY_UNVERIFIED');
   return{auditId,promoted:false,idempotent:true};
  }
  if(already||current.value.writerFenceVerified!==false||(current.value.revision!==undefined&&current.value.revision!==0))throw Error('EXT_PROMOTE_EXISTING_STATE_CONFLICT');
  const linked=await Promise.all(expected.obligationIds.map(key=>read('obligation',key)));
  for(let i=0;i<linked.length;i++){
   const ob=linked[i],key=expected.obligationIds[i];
   if(!ob||ob.value.obligationId!==key||ob.value.auditId!==auditId||ob.value.companyUid!==expected.companyUid||ob.value.stagingWriterFenceVerified!==false||!id(ob.value.scopeCode)||ob.value.linkState!=='ACTIVE'||ob.value.revision!==0||ob.value.pendingProjectionId!==''||typeof ob.value.extensionApplied!=='boolean'||typeof ob.value.legacyUndoQuarantined!=='boolean')throw Error('EXT_PROMOTE_SEEDED_OBLIGATION_MISMATCH');
  }
  const at=new Date().toISOString();
  const value={...current.value,writerFenceVerified:true,revision:1,migrationState:'WRITER_VERIFIED',sourceSnapshotHash:sourceHash,writerFreezeEvidenceRef:approvedPlan.writerFreezeEvidenceRef,sourceParityEvidenceRef:approvedPlan.sourceParityEvidenceRef,seedParityEvidenceRef:approvedPlan.seedParityEvidenceRef,writerPromotedAt:at};
  const event={kind:'MODEL_C_WRITER_PROMOTION',auditId,companyUid:expected.companyUid,sourceSnapshotSha256:sourceHash,writerFreezeEvidenceRef:approvedPlan.writerFreezeEvidenceRef,sourceParityEvidenceRef:approvedPlan.sourceParityEvidenceRef,seedParityEvidenceRef:approvedPlan.seedParityEvidenceRef,at,obligationIds:[...expected.obligationIds]};
  const writes=[{update:{name:resource('auditcontext',auditId),fields:{payload:encode(value)}},currentDocument:{updateTime:current.updateTime}},{update:{name:resource('event',eventId),fields:{payload:encode(event)}},currentDocument:{exists:false}},...linked.map((ob,i)=>({verify:resource('obligation',expected.obligationIds[i]),currentDocument:{updateTime:ob.updateTime}}))];
  const result=await request(root+':commit','POST',{writes});
  if(!result.ok)throw Error('EXT_PROMOTE_ATOMIC_COMMIT_'+result.status);
  const verified=await read('auditcontext',auditId),evidence=await read('event',eventId);
  if(verified?.value?.writerFenceVerified!==true||verified.value.revision!==1||verified.value.writerFreezeEvidenceRef!==approvedPlan.writerFreezeEvidenceRef||evidence?.value?.sourceSnapshotSha256!==sourceHash)throw Error('EXT_PROMOTE_READBACK_UNVERIFIED');
  return{auditId,promoted:true,idempotent:false,obligations:linked.length,globalCutoverApproved:false};
 }
 return Object.freeze({promoteAudit});
}
