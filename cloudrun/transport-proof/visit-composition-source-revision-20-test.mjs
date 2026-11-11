import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deriveCompositionSourceRevision20 as derive} from './visit-composition-source-revision-20.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex').slice(0,24);
const table=[
 ['Audit ID','Company_UID','Status','Assigned to','Planning JSON','Last decision timestamp','Status since','Auditor_UID'],
 ['A-1','C-1','Pending Planning','','','','','']
];
const input=()=>({auditId:'A-1',planningRows:structuredClone(table)});
const original=derive(input());
assert.equal(original.sourceRevision,sha('A-1|Pending Planning||||'));
assert.equal(original.writeEnabled,false);
assert.equal(original.canonicalSource,'AUDIT_PLANNING_DIRECT_ROW_REVISION');
const withAssigned=input();withAssigned.planningRows[1][3]='auditor@example.com';
assert.equal(derive(withAssigned).sourceRevision,sha('A-1|Pending Planning|auditor@example.com|||'));
const withUid=input();withUid.planningRows[1][7]='AUD-123';
assert.equal(derive(withUid).sourceRevision,sha('A-1|Pending Planning|||||AUD-123'));
const wrongStatus=input();wrongStatus.planningRows[1][2]='Approved';
assert.notEqual(derive(wrongStatus).sourceRevision,original.sourceRevision);
const bad=(change,code)=>{const x=input();change(x);assert.throws(()=>derive(x),e=>e?.code===code,code)};
bad(x=>{x.auditId=''},'COMPOSITION_REVISION_CANONICAL_ROWS_REQUIRED');
bad(x=>{x.planningRows[0][2]='Missing'},'COMPOSITION_REVISION_CANONICAL_HEADERS_REQUIRED');
bad(x=>{x.planningRows.push([...x.planningRows[1]])},'COMPOSITION_REVISION_SOURCE_NOT_UNIQUE');
bad(x=>{x.auditId='MISSING'},'COMPOSITION_REVISION_SOURCE_NOT_UNIQUE');
console.log('VISIT_COMPOSITION_SOURCE_REVISION_20_PASS: exact R4 hash, assigned auditor, UID and duplicate guard');
