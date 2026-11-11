import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {verifyVisitCompositionSource20 as verify} from './visit-composition-source-evidence-20.mjs';

const sourceRevision='a'.repeat(24),identityIssueRevision='b'.repeat(24);
const canonicalObligations=[
 {auditId:'A1',companyUid:'C1',obligationId:'O1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A1',companyUid:'C1',obligationId:'O2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
];
const blocks=[{date:'2026-11-18',start:'08:00',end:'16:00'},{date:'2026-11-19',start:'09:00',end:'12:00'}];
const allocations=[
 {blockIndex:0,obligationId:'O1',start:'08:00',end:'16:00'},
 {blockIndex:1,obligationId:'O2',start:'09:00',end:'12:00'}
];
const together=prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision,obligations:canonicalObligations,
 mode:'TOGETHER',blocks,allocations
});
const separate=prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision,obligations:canonicalObligations,
 mode:'SEPARATELY',visits:[
 {auditId:'A1',obligationId:'O1',blocks:[blocks[0]]},
 {auditId:'A2',identityIssuedBy:'CANONICAL',identityIssueRevision,
  obligationId:'O2',blocks:[blocks[1]]}
 ]
});
const evidence=()=>({
 command:separate,
 readAuditRows:[
 ['Audit ID','Company_UID','Status'],
 ['A1','C1','Pending Planning'],
 ['OTHER','C9','Pending Planning']
 ],
 readObligationRows:[
 ['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State'],
 ['O1','C1','GAP',8,'OPEN'],
 ['O2','C1','GRASP',3,'LINKED_TO_VISIT']
 ],
 readLinkRows:[
 ['Audit_ID','Obligation_ID','Link_State'],
 ['A1','O1','ACTIVE'],['A1','O2','ACTIVE']
 ],
 emptyAppendRows:[{row:5,before:[]}]
});
const proof=verify(evidence());
assert.equal(proof.verified,true);
assert.equal(proof.obligationCount,2);
assert.deepEqual(proof.obligations.map(x=>x.requiredMinutes),[480,180]);
assert.deepEqual(proof.reservedAppendRows,[5]);
assert.equal(proof.doesNotAuthorizeWrite,true);
assert.equal(verify({...evidence(),command:together,emptyAppendRows:[]}).verified,true);
const error=(edit,code)=>{const data=evidence();edit(data);assert.throws(()=>verify(data),x=>x?.code===code,code)};
error(x=>{x.readAuditRows=[]},'AUDIT_PLANNING_SOURCE_MISSING');
error(x=>{x.readObligationRows=[]},'AUDIT_OBLIGATIONS_SOURCE_MISSING');
error(x=>{x.readLinkRows=[]},'AUDIT_LINKS_SOURCE_MISSING');
error(x=>{x.readAuditRows[0][2]='UNKNOWN'},'COMPOSITION_SOURCE_SCHEMA_INCOMPLETE');
error(x=>{x.readAuditRows[1][1]='C4'},'COMPOSITION_SOURCE_COMPANY_MISMATCH');
error(x=>{x.readAuditRows[1][2]='Approved'},'COMPOSITION_SOURCE_NOT_PENDING_PLANNING');
error(x=>{x.readAuditRows.push(['A1','C1','Pending Planning'])},'COMPOSITION_SOURCE_AUDIT_NOT_UNIQUE');
error(x=>{x.readAuditRows.push(['OTHER','C9','Pending Planning'])},'COMPOSITION_SOURCE_AUDIT_IDS_NOT_UNIQUE');
error(x=>{x.readObligationRows.push(['O1','C1','GAP',8,'OPEN'])},'COMPOSITION_SOURCE_DUPLICATE_OBLIGATION');
error(x=>{x.readObligationRows[2][1]='C4'},'COMPOSITION_SOURCE_OBLIGATION_PARITY');
error(x=>{x.readObligationRows[2][4]='REJECTED'},'COMPOSITION_SOURCE_OBLIGATION_PARITY');
error(x=>{x.readObligationRows[2][3]=2.5},'COMPOSITION_SOURCE_TOTAL_HOURS_DRIFT');
error(x=>{x.readObligationRows[2][3]=1/7},'COMPOSITION_SOURCE_SCOPE_NOT_MINUTE_ALIGNED');
error(x=>{x.readLinkRows[2][2]='INACTIVE'},'COMPOSITION_SOURCE_ACTIVE_LINK_DRIFT');
error(x=>{x.readLinkRows.push(['A9','O2','ACTIVE'])},'COMPOSITION_SOURCE_ACTIVE_LINK_CONFLICT');
error(x=>{x.readLinkRows.push(['A1','O3','ACTIVE'])},'COMPOSITION_SOURCE_ACTIVE_LINK_DRIFT');
error(x=>{x.readAuditRows.push(['A2','C1','Pending Planning'])},'COMPOSITION_SOURCE_NEW_VISIT_ID_COLLISION');
error(x=>{x.emptyAppendRows=[{row:5,before:['occupied']}]},'COMPOSITION_SOURCE_APPEND_ROW_NOT_EMPTY');
error(x=>{x.emptyAppendRows=[]},'COMPOSITION_SOURCE_APPEND_ROW_NOT_EMPTY');
console.log('VISIT_COMPOSITION_SOURCE_EVIDENCE_20_PASS: canonical rows, ownership, links, hours, identity collisions and empty-row proof');
