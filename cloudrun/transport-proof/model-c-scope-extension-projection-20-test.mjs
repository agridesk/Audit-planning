import assert from 'node:assert/strict';
import {projectScopeExtensions20 as project} from './model-c-scope-extension-projection-20.mjs';
const make=(i)=>({auditId:'A',companyUid:'C',obligationId:'O'+i,scopeCode:'SCOPE_'+String(i+1).padStart(2,'0'),linkState:'ACTIVE',triggerSource:'CERTIFICATE',baseExpiry:'2027-01-31',effectiveExpiry:i%2?'2027-07-31':'2027-04-30',windowFrom:i%2?'2027-05-31':'2027-02-28',windowTo:i%2?'2027-07-31':'2027-04-30',extensionApplied:true,extensionMetadata:JSON.stringify({transactionId:'T'+i}),revision:i+1});
for(const size of [1,8,20]){
 const rows=Array.from({length:size},(_,i)=>make(i));
 const p=project({auditId:'A',companyUid:'C',obligations:rows});
 assert.equal(p.scopeCount,size);assert.equal(p.scopes.length,size);assert.equal(p.aggregate.earliestExpiry,'2027-04-30');
 assert.equal(p.aggregate.extensionAppliedCount,size);
 assert.equal(p.aggregate.requiresSeparatePlanning,size>1);
 assert.equal(rows[0].effectiveExpiry,'2027-04-30');
}
assert.throws(()=>project({auditId:'A',companyUid:'C',obligations:[{...make(0),effectiveExpiry:'2027-02-30'}]}),/EXT_PROJECTION_DATES_INVALID/);
assert.throws(()=>project({auditId:'A',companyUid:'C',obligations:[make(0),make(0)]}),/EXT_PROJECTION_LINEAGE_INVALID/);
assert.throws(()=>project({auditId:'A',companyUid:'C',obligations:[{...make(0),companyUid:'OTHER'}]}),/EXT_PROJECTION_LINEAGE_INVALID/);
assert.throws(()=>project({auditId:'A',companyUid:'C',obligations:[{...make(0),extensionMetadata:'broken'}]}),/EXT_PROJECTION_METADATA_INVALID/);
assert.throws(()=>project({auditId:'A',companyUid:'C',obligations:[{...make(0),linkState:'INACTIVE'}]}),/EXT_PROJECTION_NO_OBLIGATIONS/);
console.log('PASS canonical obligation projection: 1, 8, 20 scopes and fail-closed integrity');
