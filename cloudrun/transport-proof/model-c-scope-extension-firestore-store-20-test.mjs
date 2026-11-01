import assert from 'node:assert/strict';
import {createScopeExtensionFirestoreStore20} from './model-c-scope-extension-firestore-store-20.mjs';
assert.throws(()=>createScopeExtensionFirestoreStore20({}),/EXT_FIRESTORE_CUTOVER_UNVERIFIED/);
assert.throws(()=>createScopeExtensionFirestoreStore20({migrationVerified:true}),/EXT_FIRESTORE_CUTOVER_UNVERIFIED/);
assert.throws(()=>createScopeExtensionFirestoreStore20({writerFenceVerified:true}),/EXT_FIRESTORE_CUTOVER_UNVERIFIED/);
let reads=0,commits=0;
const payload=v=>({mapValue:{fields:Object.fromEntries(Object.entries(v).map(([key,val])=>[key,typeof val==='number'?{integerValue:String(val)}:typeof val==='string'?{stringValue:val}:{booleanValue:val}]))}});
const current={obligationId:'O1',companyUid:'C1',auditId:'A1',scopeCode:'ABC',revision:1,pendingProjectionId:'',baseExpiry:'2027-01-31',effectiveExpiry:'2027-01-31',windowFrom:'2026-12-01',windowTo:'2027-01-31',extensionApplied:false,extensionMetadata:''};
const fetchImpl=async(url,options={})=>{
 if(url.endsWith(':beginTransaction'))return{ok:true,json:async()=>({transaction:'TX'})};
 if(url.includes('/event/'))return{status:404,ok:false};
 if(url.includes('/obligation/')){reads++;return{ok:true,json:async()=>({updateTime:'2026-11-01T00:00:00Z',fields:{payload:payload(current)}})}}
 if(url.endsWith(':commit')){commits++;const body=JSON.parse(options.body);assert.equal(body.writes.length,3);assert(body.writes.every(w=>w.update&&w.currentDocument));return{ok:true,json:async()=>({writeResults:[{},{},{}]})}}
 throw Error('unexpected mock request '+url);
};
const store=createScopeExtensionFirestoreStore20({projectId:'audit-management-system-dev',getToken:async()=> 'fake',fetchImpl,migrationVerified:true,writerFenceVerified:true});
const receipt=await store.runAtomic({obligationId:'O1',auditId:'A1',scopeCode:'ABC',expectedRevision:1,idempotencyKey:'REQ1',requestDigest:'DIGEST',actorId:'M1',action:'apply',execute:({obligation})=>({obligationId:'O1',expectedRevision:1,nextRevision:2,before:{effectiveExpiry:obligation.effectiveExpiry},after:{effectiveExpiry:'2027-04-30',extensionMetadata:'{"transactionId":"REQ1"}'},transaction:{transactionId:'REQ1',requestDigest:'DIGEST',obligationId:'O1',action:'apply',auditId:'A1',actorUid:'M1'},outbox:{obligationId:'O1',auditId:'A1'}})});
assert.equal(receipt.projection,'PENDING');assert.equal(commits,1);assert.equal(reads,1);
console.log('PASS Firestore extension gate and three-write transaction contract');
