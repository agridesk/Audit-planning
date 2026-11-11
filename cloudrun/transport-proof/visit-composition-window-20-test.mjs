import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {verifyVisitCompositionWindows20} from './visit-composition-window-20.mjs';
const sourceRevision='a'.repeat(24),obligations=[
 {auditId:'A1',companyUid:'C1',obligationId:'O1',scopeCode:'MPS-GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A1',companyUid:'C1',obligationId:'O2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const blocks=[{date:'2026-11-18',start:'08:00',end:'16:00'},{date:'2026-11-19',start:'09:00',end:'12:00'}];
const command=prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision,obligations,mode:'TOGETHER',blocks,
 allocations:[{blockIndex:0,obligationId:'O1',start:'08:00',end:'16:00'},{blockIndex:1,obligationId:'O2',start:'09:00',end:'12:00'}]
});
const obligationRows=[
 ['Obligation_ID','Planning_Window_From','Planning_Window_To'],
 ['O1','2026-11-01','2026-12-01'],['O2','01/11/2026','30/11/2026']
];
const x=()=>({command,obligationRows:structuredClone(obligationRows)});
const valid=verifyVisitCompositionWindows20(x());
assert.equal(valid.verified,true);assert.equal(valid.canCommit,false);
assert.equal(valid.obligations.length,2);assert.equal(valid.obligations[1].from,'2026-11-01');
const reject=(edit,expected)=>{const a=x();edit(a);assert.throws(()=>verifyVisitCompositionWindows20(a),e=>e?.code===expected,expected)};
reject(a=>{a.obligationRows[2][2]='2026-11-18'},'COMPOSITION_WINDOW_OUTSIDE_ALLOWED_PERIOD');
reject(a=>{a.obligationRows[2][1]=''},'COMPOSITION_WINDOW_MISSING_REQUIRES_MANUAL_RECONCILIATION');
reject(a=>{a.obligationRows[2][1]='31/02/2026'},'COMPOSITION_WINDOW_DATE_INVALID');
reject(a=>{a.obligationRows[2][1]='2026-12-02'},'COMPOSITION_WINDOW_INVERTED');
reject(a=>{a.obligationRows[2][1]='02-11-2026'},'COMPOSITION_WINDOW_DATE_UNRECOGNIZED');
reject(a=>{a.obligationRows.push([...a.obligationRows[2]])},'COMPOSITION_WINDOW_DUPLICATE_OBLIGATION');
reject(a=>{a.obligationRows.pop()},'COMPOSITION_WINDOW_OBLIGATION_NOT_FOUND');
const separate=prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision,obligations,mode:'SEPARATELY',
 visits:[{auditId:'A1',obligationId:'O1',blocks:[blocks[0]]},
 {auditId:'A1_SPLIT_EXAMPLE',identityIssuedBy:'CANONICAL',identityIssueRevision:'b'.repeat(24),
 obligationId:'O2',blocks:[blocks[1]]}]
});
assert.equal(verifyVisitCompositionWindows20({command:separate,obligationRows}).verified,true);
console.log('VISIT_COMPOSITION_WINDOW_20_PASS: ISO and EU dates, both modes, missing or conflicting periods fail closed');
