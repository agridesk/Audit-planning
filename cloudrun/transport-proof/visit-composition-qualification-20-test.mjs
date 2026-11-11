import assert from 'node:assert/strict';
import {verifyCompositionAuditorQualifications20 as verify} from './visit-composition-qualification-20.mjs';
const input=()=>({
 auditorUid:'AUD-1',scopeCodes:['MPS-GAP','GRASP'],
 auditorRows:[['Name','E-mail','Role','Active','Auditor_UID'],['Auditor','auditor@example.com','Auditor','Yes','AUD-1']],
 qualificationRows:[['Auditor_UID','ScopeCode','Qualified'],['AUD-1','MPS-GAP','YES'],['AUD-1','GRASP','YES']]
});
const proof=verify(input());
assert.equal(proof.qualified,true);assert.equal(proof.auditorUid,'AUD-1');
assert.equal(proof.auditorEmail,'auditor@example.com');
assert.equal(proof.availabilityVerified,false);assert.equal(proof.writeEnabled,false);
const err=(edit,code)=>{const x=input();edit(x);assert.throws(()=>verify(x),e=>e?.code===code,code)};
err(x=>{x.auditorUid=''},'COMPOSITION_QUALIFICATIONS_EVIDENCE_REQUIRED');
err(x=>{x.scopeCodes=['MPS-GAP','MPS-GAP']},'COMPOSITION_QUALIFICATIONS_EVIDENCE_REQUIRED');
err(x=>{x.auditorRows[0][4]='invalid'},'COMPOSITION_QUALIFICATIONS_SCHEMA_INVALID');
err(x=>{x.auditorRows[1][3]='No'},'COMPOSITION_QUALIFICATIONS_AUDITOR_NOT_ACTIVE');
err(x=>{x.auditorRows[1][2]='Manager'},'COMPOSITION_QUALIFICATIONS_AUDITOR_NOT_ACTIVE');
err(x=>{x.auditorRows.push([...x.auditorRows[1]])},'COMPOSITION_QUALIFICATIONS_AUDITOR_NOT_ACTIVE');
err(x=>{x.qualificationRows.pop()},'COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED');
err(x=>{x.qualificationRows[1][2]='NO'},'COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED');
err(x=>{x.qualificationRows.push([...x.qualificationRows[1]])},'COMPOSITION_QUALIFICATIONS_RELATION_CONFLICT');
console.log('VISIT_COMPOSITION_QUALIFICATIONS_20_PASS: active auditor, canonical per-scope YES, no availability claim');
