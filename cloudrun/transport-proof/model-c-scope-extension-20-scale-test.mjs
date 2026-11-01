import assert from 'node:assert/strict';
import {planScopeExtension20 as plan} from './model-c-scope-extension-plan-20.mjs';
const build=(n)=>Array.from({length:n},(_,i)=>{const scope='SCOPE_'+String(i+1).padStart(2,'0');const day=String(i+1).padStart(2,'0');return {obligationId:'O'+i,auditId:'A20',scopeCode:scope,linkState:'ACTIVE',triggerSource:'CERTIFICATE',baseExpiry:'2027-01-'+day,effectiveExpiry:'2027-01-'+day,windowFrom:'2026-12-01',windowTo:'2027-02-28',extensionApplied:false,extensionMetadata:''}});
const policies=Object.fromEntries(Array.from({length:20},(_,i)=>['SCOPE_'+String(i+1).padStart(2,'0'),{extensionMonths:i%2?6:3,planningFromMonths:-2,planningToMonths:0}]));
for(const count of [1,8,20]){
 const obligations=build(count),target=obligations[count-1].obligationId,untouched=JSON.stringify(obligations.slice(0,-1));
 const applied=plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:[target],obligations,policyByScope:policies,actorUid:'M',transactionId:'TX-'+count});
 assert.equal(applied.changes.length,1);
 assert.equal(applied.changes[0].obligationId,target);
 assert.equal(JSON.stringify(obligations.slice(0,-1)),untouched);
 const modified=obligations.map(x=>x.obligationId===target?{...x,...applied.changes[0].after}:x);
 const undo=plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'undo',targets:[target],obligations:modified,policyByScope:{},actorUid:'M',transactionId:'UNDO-'+count,priorTransaction:applied});
 assert.deepEqual(undo.changes[0].after,applied.changes[0].before);
 assert.equal(undo.changes.length,1);
 assert.equal(modified.filter(x=>x.extensionApplied).length,1);
 assert.throws(()=>plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:[target],obligations:modified,policyByScope:policies,actorUid:'M',transactionId:'AGAIN'}),/EXT_ALREADY_APPLIED/);
}
const base=build(20);
assert.throws(()=>plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:['O0','O0'],obligations:base,policyByScope:policies,actorUid:'M',transactionId:'DUP'}),/EXT_TARGETS_INVALID/);
assert.throws(()=>plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:['O0'],obligations:base.map((o,i)=>i?o:{...o,baseExpiry:'2027-02-30'}),policyByScope:policies,actorUid:'M',transactionId:'DATE'}),/EXT_SNAPSHOT_DATE_INVALID/);
assert.throws(()=>plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:['O0'],obligations:base.map((o,i)=>i?o:{...o,windowFrom:'2027-03-01',windowTo:'2027-02-01'}),policyByScope:policies,actorUid:'M',transactionId:'WINDOW'}),/EXT_SNAPSHOT_DATE_INVALID/);
assert.throws(()=>plan({auditId:'A20',command:'apply',auditId:'A20',targets:['O0'],obligations:base,policyByScope:policies,actorUid:'M',transactionId:'STATUS',lifecycleStatus:'Completed'}),/EXTENSION_ALLOWED_ONLY_PENDING_PLANNING/);
assert.throws(()=>plan({auditId:'A20',command:'apply',targets:['O0'],obligations:base,policyByScope:policies,actorUid:'M',transactionId:'NO-STATUS'}),/EXTENSION_ALLOWED_ONLY_PENDING_PLANNING/);
assert.throws(()=>plan({auditId:'A20',lifecycleStatus:'Pending Planning',command:'apply',targets:['O0'],obligations:base.map((o,i)=>i===19?{...o,effectiveExpiry:''}:o),policyByScope:policies,actorUid:'M',transactionId:'PARTIAL'}),/EXT_AGGREGATE_SNAPSHOT_INCOMPLETE/);
console.log('PASS Model C scope EXT/UNDO 1, 8, 20; isolated changes, undo, guards');
