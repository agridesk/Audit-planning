import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../../AuditManagerToolsScopes.js',import.meta.url),'utf8');
const context={};
runInNewContext(src,context);
const defs=[
 {slotKey:'SCOPE_01',scope:'MPS-ABC',scopeCode:'MPS-ABC',flagCol0:2},
 {slotKey:'SCOPE_09',scope:'New Scheme',scopeCode:'NEW-09',flagCol0:null}
];
const auditors=[['Auditor_UID','E-mail','Active','Role'],['UID-1','a@example.com','YES','Auditor'],['UID-2','b@example.com','YES','Auditor']];
const header=['Auditor_UID','ScopeCode','Qualified'];
let relationRows=[header,['UID-1','NEW-09','YES'],['UID-1','MPS-ABC','YES']];
let auditorRows=auditors;
const ss={getSheetByName(name){
 const rows=name==='Auditors'?auditorRows:name==='Auditor_Scope_Qualifications'?relationRows:null;
 return rows?{getDataRange:()=>({getValues:()=>rows})}:null;
}};
const selected=[{scope:'New Scheme',enabled:true},{scope:'MPS-ABC',enabled:true}];
const check=()=>context.m5t_scope20CanonicalPreassignmentCheck_(ss,'a@example.com',selected,defs);
assert.equal(check().success,true,'UID+ScopeCode qualifies both selected schemes');
relationRows=[header,['UID-1','NEW-09','NO'],['UID-1','MPS-ABC','YES']];
assert.equal(check().error,'AUDITOR_NOT_HARD_QUALIFIED','Explicit NO blocks despite legacy grants');
relationRows=[header,['UID-1','MPS-ABC','YES']];
assert.equal(check().error,'AUDITOR_NOT_HARD_QUALIFIED','Missing canonical new scope grant fails closed');
relationRows=[header,['UID-1','NEW-09','YES'],['UID-1','NEW-09','YES'],['UID-1','MPS-ABC','YES']];
assert.equal(check().error,'CANONICAL_QUALIFICATION_DUPLICATE');
relationRows=[header,['UNKNOWN','NEW-09','YES'],['UID-1','MPS-ABC','YES']];
assert.equal(check().error,'CANONICAL_QUALIFICATION_ORPHAN');
relationRows=[header,['UID-1','NEW-09','MAYBE'],['UID-1','MPS-ABC','YES']];
assert.equal(check().error,'CANONICAL_QUALIFICATION_STATE_INVALID');
relationRows=[header,['UID-1','NEW-09','YES'],['UID-1','MPS-ABC','YES']];
auditorRows=[...auditors,['UID-1','other@example.com','YES','Auditor']];
assert.equal(check().error,'CANONICAL_AUDITOR_IDENTITY_DUPLICATE');
auditorRows=auditors;
assert.equal(context.m5t_scope20CanonicalPreassignmentCheck_(ss,'b@example.com',selected,defs).error,'AUDITOR_NOT_HARD_QUALIFIED');
assert.equal(context.m5t_scope20CanonicalPreassignmentCheck_(ss,'a@example.com',[{scope:'UNKNOWN',enabled:true}],defs).error,'CANONICAL_SCOPE_IDENTITY_UNRESOLVED');
const missing={getSheetByName:()=>null};
assert.equal(context.m5t_scope20CanonicalPreassignmentCheck_(missing,'a@example.com',selected,defs).error,'CANONICAL_QUALIFICATION_SOURCE_UNAVAILABLE');
auditorRows=[['Auditor_UID','E-mail','Role'],['UID-1','a@example.com','Auditor']];
assert.equal(check().error,'CANONICAL_QUALIFICATION_SCHEMA_INCOMPLETE','Active role schema cannot be silently omitted');
auditorRows=auditors;
const ambiguousDefs=[...defs,{slotKey:'SCOPE_10',scope:'New Scheme',scopeCode:'ANOTHER-10',flagCol0:null}];
assert.equal(context.m5t_scope20CanonicalPreassignmentCheck_(ss,'a@example.com',selected,ambiguousDefs).error,'CANONICAL_SCOPE_ALIAS_AMBIGUOUS');
console.log('GAS Scope20 preassignment: canonical UID+ScopeCode YES, NO, missing, orphan, duplicate, invalid and missing source fail closed');
