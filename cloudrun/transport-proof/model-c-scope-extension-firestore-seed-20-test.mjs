import assert from 'node:assert/strict';
import {createScopeExtensionFirestoreSeeder20} from './model-c-scope-extension-firestore-seed-20.mjs';
assert.throws(()=>createScopeExtensionFirestoreSeeder20({}),/EXT_SEED_WRITE_DISABLED/);
assert.throws(()=>createScopeExtensionFirestoreSeeder20({writeEnabled:true,writerFenceEvidenceVerified:true,projectId:'production'}),/EXT_SEED_DEV_IDENTITY_INVALID/);
const docs=new Map();let commits=0;
const fetchImpl=async(url,opts={})=>{
 if(url.endsWith(':commit')){commits++;const body=JSON.parse(opts.body);assert.equal(body.writes.length,3);for(const w of body.writes){assert.equal(w.currentDocument.exists,false);if(docs.has(w.update.name))return{ok:false,status:409};docs.set(w.update.name,w.update.fields.payload)}return{ok:true,json:async()=>({})}}
 if(docs.has(url))return{ok:true,json:async()=>({fields:{payload:docs.get(url)}})};
 return{ok:false,status:404};
};
const seeder=createScopeExtensionFirestoreSeeder20({writeEnabled:true,writerFenceEvidenceVerified:true,projectId:'audit-management-system-dev',getToken:async()=> 'token',fetchImpl});
const context={auditId:'A',companyUid:'C',obligationIds:['O1','O2'],policyByScope:{},lifecycleStatus:'PENDING_PLANNING',writerFenceVerified:false,revision:0};
const make=id=>({obligationId:id,auditId:'A',companyUid:'C',scopeCode:id,triggerSource:'ECAS',linkState:'ACTIVE',revision:0,pendingProjectionId:'',baseExpiry:'',effectiveExpiry:'',windowFrom:'',windowTo:'',extensionApplied:false,extensionMetadata:''});
const args={context,obligations:[make('O1'),make('O2')],sourceSnapshotHash:'a'.repeat(64)};
const first=await seeder.seedAudit(args);assert.equal(first.seeded,true);assert.equal(first.cutoverEnabled,false);assert.equal(commits,1);
const retry=await seeder.seedAudit(args);assert.equal(retry.seeded,false);assert.equal(retry.idempotent,true);assert.equal(commits,1);
await assert.rejects(()=>seeder.seedAudit({...args,obligations:[{...make('O1'),scopeCode:'DIFFERENT'},make('O2')]}),/EXT_SEED_EXISTING_DATA_CONFLICT/);
await assert.rejects(()=>seeder.seedAudit({...args,sourceSnapshotHash:'bad'}),/EXT_SEED_INPUT_INVALID/);
console.log('PASS Firestore guarded per-audit backfill: atomic write, readback and idempotency');
