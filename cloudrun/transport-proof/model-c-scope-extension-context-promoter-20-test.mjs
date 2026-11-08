import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createScopeExtensionContextPromoter20} from './model-c-scope-extension-context-promoter-20.mjs';
const sha='a'.repeat(64),projectId='audit-management-system-dev';
const approvedPlan={promotionPrepared:true,readOnly:true,cutoverApproved:false,projectId,sourceSnapshotSha256:sha,writerFreezeEvidenceRef:'INDEPENDENT_FENCE',sourceParityEvidenceRef:'LIVE_SOURCE_PARITY',seedParityEvidenceRef:'SEED_READBACK',promotions:[{auditId:'AUD_TEST',companyUid:'COMPANY',obligationIds:['OBL_A','OBL_B'],expectedRevision:0,sourceSnapshotSha256:sha,writerFenceVerified:true}]};
const encode=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?{integerValue:String(v)}:Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const decode=v=>'stringValue'in v?v.stringValue:'booleanValue'in v?v.booleanValue:'integerValue'in v?Number(v.integerValue):'arrayValue'in v?(v.arrayValue.values||[]).map(decode):'mapValue'in v?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null;
const context={auditId:'AUD_TEST',companyUid:'COMPANY',obligationIds:['OBL_A','OBL_B'],lifecycleStatus:'PENDING_PLANNING',writerFenceVerified:false,migrationState:'STAGED_UNVERIFIED'};
const obligation=id=>({obligationId:id,auditId:'AUD_TEST',companyUid:'COMPANY',stagingWriterFenceVerified:false,scopeCode:id==='OBL_A'?'MPS-GAP':'GRASP',linkState:'ACTIVE',revision:0,pendingProjectionId:'',extensionApplied:false,legacyUndoQuarantined:false});
const root='https://firestore.googleapis.com/v1/projects/'+projectId+'/databases/(default)/documents';
const documentUrl=name=>name.startsWith('projects/')?'https://firestore.googleapis.com/v1/'+name:name;
const docs=new Map();
function put(kind,key,value,revision=1){const path=root+'/ams_scope_extension_20_dev_'+kind+'/'+key;docs.set(path,{value,updateTime:'2026-11-07T00:00:0'+revision+'Z'})}
put('auditcontext','AUD_TEST',context);
put('obligation','OBL_A',obligation('OBL_A'));
put('obligation','OBL_B',obligation('OBL_B'));
let commits=0,verifiedWrites=0;
const response=(status,body={})=>({status,ok:status>=200&&status<300,async json(){return body}});
const fetchImpl=async(url,options={})=>{
 const method=options.method||'GET';
 if(method==='GET'){const item=docs.get(String(url));return item?response(200,{fields:{payload:encode(item.value)},updateTime:item.updateTime}):response(404)}
 assert.equal(method,'POST');
 assert.equal(String(url),root+':commit');
 const writes=JSON.parse(options.body).writes;
 assert.equal(writes.length,4);
 assert(writes[0].update.name.startsWith('projects/audit-management-system-dev/databases/(default)/documents/ams_scope_extension_20_dev_auditcontext/'));
 assert(writes[1].update.name.includes('ams_scope_extension_20_dev_event/EXT_WRITER_PROMOTION_'));
 assert.deepEqual(writes.slice(2).map(x=>x.verify.split('/').at(-1)),['OBL_A','OBL_B']);
 for(const write of writes){const path=documentUrl(write.verify||write.update?.name);const previous=docs.get(path);
  if(write.currentDocument.exists===false)assert(!previous,'event must not be overwritten');
  if(write.currentDocument.updateTime)assert.equal(previous?.updateTime,write.currentDocument.updateTime,'atomic precondition');
 }
 for(const write of writes){if(write.verify){verifiedWrites++;continue}docs.set(documentUrl(write.update.name),{value:decode(write.update.fields.payload),updateTime:'2026-11-07T00:00:02Z'})}
 commits++;return response(200,{writeResults:writes.map(()=>({}))});
};
assert.throws(()=>createScopeExtensionContextPromoter20({projectId,getToken:async()=>'token',fetchImpl,writeEnabled:false,approvedPlan}),/INDEPENDENT_GATE/);
assert.throws(()=>createScopeExtensionContextPromoter20({projectId:'prod-project',getToken:async()=>'token',fetchImpl,writeEnabled:true,approvedPlan}),/INDEPENDENT_GATE/);
const promoter=createScopeExtensionContextPromoter20({projectId,getToken:async()=>'dev-token',fetchImpl,writeEnabled:true,approvedPlan});
assert.equal((await promoter.promoteAudit('AUD_TEST')).promoted,true);
assert.equal(commits,1);
assert.equal(verifiedWrites,2);
const updated=docs.get(root+'/ams_scope_extension_20_dev_auditcontext/AUD_TEST').value;
assert.equal(updated.writerFenceVerified,true);
assert.equal(updated.revision,1);assert.equal(updated.migrationState,'WRITER_VERIFIED');assert.equal(updated.sourceSnapshotHash,sha);
assert.equal(updated.writerFreezeEvidenceRef,'INDEPENDENT_FENCE');
assert.equal((await promoter.promoteAudit('AUD_TEST')).idempotent,true);
assert.equal(commits,1);
await assert.rejects(promoter.promoteAudit('NOT_IN_PLAN'),/AUDIT_NOT_IN_APPROVED_PLAN/);
console.log('PASS DEV Model C per-audit promoter: context+evidence atomic commit, obligation preconditions, readback, idempotency');
