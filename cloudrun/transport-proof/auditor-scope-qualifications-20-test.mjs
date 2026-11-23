import assert from 'node:assert/strict';
import {qualificationOpenAuditImpact20,resolveAuditorScopeQualifications20 as resolve} from './auditor-scope-qualifications-20.js';
const catalog=[['SlotKey','ScopeCode'],...Array.from({length:20},(_,i)=>['SCOPE_'+String(i+1).padStart(2,'0'),'CODE_'+String(i+1).padStart(2,'0')])];
const auditors=[['Auditor_UID','E-mail'],['UID-1','a@example.com'],['UID-2','b@example.com']];
const relations=[['Auditor_UID','ScopeCode','Qualified'],['UID-1','CODE_09','YES'],['UID-1','CODE_20','x'],['UID-2','CODE_01','YES']];
const args={auditors,catalog,relations,auditorUid:'UID-1',auditorEmail:'a@example.com'};
const result=resolve(args);
assert.deepEqual(result.qualifiedScopeCodes,['CODE_09','CODE_20']);
assert.equal(result.qualificationCount,2);
assert.equal(result.source,'Auditor_Scope_Qualifications');
assert.throws(()=>resolve({...args,auditorEmail:'other@example.com'}),/AUDITOR_IDENTITY_MISMATCH|AUDITOR_IDENTITY_AMBIGUOUS/);
assert.throws(()=>resolve({...args,relations:[...relations,relations[1]]}),/QUALIFICATION_DUPLICATE_RELATION/);
assert.throws(()=>resolve({...args,relations:[...relations,['UID-1','CODE_21','YES']]}),/QUALIFICATION_ORPHAN_RELATION/);
assert.throws(()=>resolve({...args,relations:[...relations,['UNKNOWN-UID','CODE_01','YES']]}),/QUALIFICATION_ORPHAN_RELATION/);
assert.throws(()=>resolve({...args,relations:[...relations,['UID-1','CODE_01','MAYBE']]}),/QUALIFICATION_INVALID_STATE/);
assert.throws(()=>resolve({...args,catalog:[...catalog,['SCOPE_20','CODE_21']]}),/SCOPE_CATALOG_AMBIGUOUS/);
assert.throws(()=>resolve({...args,catalog:[...catalog,['SCOPE_21','CODE_21']]}),/SCOPE_CATALOG_AMBIGUOUS/);
assert.throws(()=>resolve({...args,relations:[]}),/QUALIFICATION_SCHEMA_UNAVAILABLE/);
assert.throws(()=>resolve({...args,auditors:[...auditors,['UID-3','a@example.com']]}),/AUDITOR_IDENTITY_AMBIGUOUS/);
assert.throws(()=>resolve({...args,auditors:[...auditors,['UID-2','c@example.com']]}),/AUDITOR_IDENTITY_AMBIGUOUS/);
assert.equal(resolve({...args,relations:[relations[0]]}).qualificationCount,0,'No implicit qualifications');
const impactPlanning=[['Audit ID','Status','Assigned to','Auditor_UID','Preassigned Auditor','SCOPE_01'],
 ['A1','Approved','old@example.test','UID-1','','X'],
 ['A2','Pending Planning','','','b@example.com','X'],
 ['A3','Completed','a@example.com','UID-1','','X']];
const impact={auditors,planning:impactPlanning,auditorUid:'UID-1',scopeColumns:[5]};
assert.deepEqual(qualificationOpenAuditImpact20(impact),['A1']);
assert.deepEqual(qualificationOpenAuditImpact20({...impact,auditorUid:'UID-2'}),['A2']);
assert.deepEqual(qualificationOpenAuditImpact20({...impact,planning:[impactPlanning[0],[],
 ['A4','Accepted','old@example.test','UID-1','','X']]}),['A4']);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,planning:[impactPlanning[0],
 ['A4','Accepted','b@example.com','UID-1','','X']]}),/OWNER_CONFLICT/);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,planning:[impactPlanning[0],
 ['A4','Approved','unknown@example.test','','','X']]}),/OWNER_UNRESOLVED/);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,planning:impactPlanning.concat(Array.from({length:2500-impactPlanning.length},()=>[]))}),/SOURCE_INCOMPLETE/);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,planning:[impactPlanning[0],impactPlanning[1],impactPlanning[1]]}),/AUDIT_ID_INVALID/);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,planning:[[...impactPlanning[0],'scope 01'],impactPlanning[1]]}),/SCHEMA_INVALID/);
assert.throws(()=>qualificationOpenAuditImpact20({...impact,auditors:[...auditors,['UID-3','a@example.com']],
 planning:[impactPlanning[0],['A4','Approved','a@example.com','','','X']]}),/OWNER_UNRESOLVED/);
console.log('auditor-scope-qualifications-20: canonical UID / ScopeCode 1..20');
