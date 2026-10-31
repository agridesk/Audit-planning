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
context.m5t_scopeSlotDefs_=()=>defs;
context.m5t_toNumberOrZero_=x=>Number(x)||0;
context.m5t_toIntOrNull_=x=>x==null?null:Number(x);
const catalogUi=context.m5t_listScopeCatalog_({});
assert.equal(catalogUi[1].scopeCode,'NEW-09');
assert.equal(catalogUi[1].slotKey,'SCOPE_09');
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
auditorRows=[['Auditor_UID','E-mail','Active','Role','Qualification_Withdrawals_JSON'],
 ['UID-1','a@example.com','YES','Auditor',JSON.stringify([{scopeCode:'NEW-09',effectiveDate:'2026-11-01',grandfatheredAuditIds:[]}])],
 ['UID-2','b@example.com','YES','Auditor','']];
assert.equal(check().error,'CANONICAL_QUALIFICATION_WITHDRAWN','No grandfathering for new preassignment');
auditorRows[1][4]='not-json';
assert.equal(check().error,'CANONICAL_QUALIFICATION_WITHDRAWAL_SCHEMA_INVALID');
auditorRows=auditors;
// Integration smoke: a missing qualification must fail BEFORE creating an audit row.
let createdAuditRows=0;
context.SpreadsheetApp={getActiveSpreadsheet:()=>ss};
context.m5t_const_=()=>({SHEETS:{AUDIT_PLANNING:'Audit planning'}});
context.m5t_getSheet_=()=>({name:'mock-planning'});
context.m5t_readSheet_=()=>({headerMap:{},rows:[]});
context.m5t_pickHeader_=(headers,candidates)=>candidates.includes('Company_UID')?0:candidates.includes('Company')?1:-1;
context.m5t_createAuditRowFromCompaniesPool_=()=>{createdAuditRows++;return {success:true,rowIndex:2};};
relationRows=[header,['UID-1','NEW-09','NO'],['UID-1','MPS-ABC','YES']];
const denied=context.m5t_upsertScopes({
 companyUid:'C-1',companyName:'Company 1',selectedScopes:[{scope:'New Scheme',enabled:true}],
 preassignedAuditorEmail:'a@example.com'
});
assert.equal(denied.success,false);
assert.equal(denied.error,'AUDITOR_NOT_HARD_QUALIFIED');
assert.equal(createdAuditRows,0,'Denied Scope09 preassignment must not create an orphan audit row');
// DEV currently has optional physical 09+ columns, but these must not bypass canonical qualifications.
context.m5t_scopeSlotDefs_=()=>[{...defs[0]},{...defs[1],flagCol0:18,hourCol0:19}];
const deniedPhysical=context.m5t_upsertScopes({
 companyUid:'C-1',companyName:'Company 1',selectedScopes:[{scope:'New Scheme',enabled:true}],
 preassignedAuditorEmail:'a@example.com'
});
assert.equal(deniedPhysical.success,false);
assert.equal(deniedPhysical.error,'AUDITOR_NOT_HARD_QUALIFIED');
assert.equal(createdAuditRows,0,'Optional physical Scope09 column must not allow unauthorized audit creation');
context.m5t_scopeSlotDefs_=()=>defs;
const unknownBeforeWrite=context.m5t_upsertScopes({companyUid:'C-1',companyName:'Company 1',selectedScopes:[{scope:'NONEXISTENT',enabled:true}]});
assert.equal(unknownBeforeWrite.error,'SCOPE_IDENTITY_UNRESOLVED');
const doubleBeforeWrite=context.m5t_upsertScopes({companyUid:'C-1',companyName:'Company 1',selectedScopes:[{scope:'New Scheme',enabled:true},{scopeCode:'NEW-09',enabled:true}]});
assert.equal(doubleBeforeWrite.error,'DUPLICATE_SELECTED_SCOPE');
assert.equal(createdAuditRows,0,'Rejected unknown and duplicate scopes may not create audit rows');
// Legacy scope rejection must be checked before creating a missing audit row.
let legacyValidatorCalls=0;
context.m5t_getSheet_=()=>({
  getLastColumn:()=>4,
  getRange:()=>({getValues:()=>[['Company_UID','Company','SCOPE_01','Duration SCOPE_01']]})
});
context._mp_assertAuditorQualifiedForPlanning_=()=>{legacyValidatorCalls++;return {success:false,message:'Not qualified'};};
const rejectedLegacy=context.m5t_upsertScopes({
 companyUid:'C-1',companyName:'Company 1',
 selectedScopes:[{scope:'MPS-ABC',enabled:true}],
 preassignedAuditorEmail:'a@example.com'
});
assert.equal(rejectedLegacy.error,'AUDITOR_NOT_HARD_QUALIFIED');
assert.equal(legacyValidatorCalls,1);
assert.equal(createdAuditRows,0,'Legacy qualification failure must happen before row creation');
const contradictory=context.m5t_upsertScopes({
 companyUid:'C-1',companyName:'Company 1',
 selectedScopes:[{scope:'MPS-ABC',scopeCode:'NEW-09',enabled:true}]
});
assert.equal(contradictory.error,'SCOPE_IDENTITY_CONFLICT','Mismatched name and code must never be interpreted as another scheme');
assert.equal(createdAuditRows,0,'Conflicting identities must not create audit rows');
console.log('GAS Scope20 preassignment: canonical UID+ScopeCode YES, NO, missing, orphan, duplicate, invalid and missing source fail closed');
