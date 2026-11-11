import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20 as prepare} from './visit-composition-command-20.mjs';
const sourceRevision='a'.repeat(24),issueRevision='b'.repeat(24);
const common=()=>({
 auditId:'AUD-1',companyUid:'COMP-1',sourceRevision,
 obligations:[
 {auditId:'AUD-1',companyUid:'COMP-1',obligationId:'OB-GAP',scopeCode:'MPS-GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'AUD-1',companyUid:'COMP-1',obligationId:'OB-GRASP',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
 ]
});
const together=()=>({...common(),mode:'TOGETHER',blocks:[
 {date:'2026-11-18',start:'08:00',end:'16:00'},
 {date:'2026-11-19',start:'09:00',end:'12:00'}
],allocations:[
 {blockIndex:0,obligationId:'OB-GAP',start:'08:00',end:'16:00'},
 {blockIndex:1,obligationId:'OB-GRASP',start:'09:00',end:'12:00'}
]});
const separate=()=>({...common(),mode:'SEPARATELY',visits:[
 {auditId:'AUD-1',obligationId:'OB-GAP',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {auditId:'AUD-2',identityIssuedBy:'CANONICAL',identityIssueRevision:issueRevision,obligationId:'OB-GRASP',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]});
const err=(factory,edit,code)=>{const value=factory();edit(value);assert.throws(()=>prepare(value),e=>e?.code===code,code);};
const same=prepare(together());
assert.equal(same.mode,'TOGETHER');assert.equal(same.totalMinutes,660);assert.equal(same.allocations.length,2);assert.equal(same.canCommit,false);
const apart=prepare(separate());
assert.equal(apart.mode,'SEPARATELY');assert.equal(apart.visits.length,2);assert.equal(apart.totalMinutes,660);assert.equal(apart.canCommit,false);
err(together,x=>{x.sourceRevision='bad'},'COMPOSITION_COMMAND_CANONICAL_REVISION_REQUIRED');
err(together,x=>{x.allocations=[]},'SCOPE_ALLOCATION_EXPLICIT_REQUIRED');
err(together,x=>{x.visits=[]},'COMPOSITION_COMMAND_UNEXPECTED_VISITS');
err(together,x=>{x.blocks[0].start='08:10'},'COMPOSITION_COMMAND_BLOCK_QUARTER_HOUR_REQUIRED');
err(together,x=>{x.blocks[0].date='invalid'},'COMPOSITION_COMMAND_DATE_INVALID');
err(together,x=>{x.blocks[0].date='2026-02-30'},'COMPOSITION_COMMAND_DATE_INVALID');
err(together,x=>{x.blocks[1].date='2026-11-18';x.blocks[1].start='15:00';x.blocks[1].end='18:00'},'COMPOSITION_COMMAND_BLOCK_OVERLAP');
err(together,x=>{x.mode='together'},'COMPOSITION_COMMAND_MODE_NOT_CANONICAL');
err(separate,x=>{x.visits.pop()},'COMPOSITION_COMMAND_VISITS_REQUIRED');
err(separate,x=>{x.visits[1].identityIssuedBy='CLIENT'},'COMPOSITION_COMMAND_CANONICAL_VISIT_IDENTITY_REQUIRED');
err(separate,x=>{delete x.visits[1].identityIssueRevision},'COMPOSITION_COMMAND_CANONICAL_VISIT_IDENTITY_REQUIRED');
err(separate,x=>{x.visits[1].auditId='AUD-1'},'COMPOSITION_COMMAND_AUDIT_ID_COLLISION');
err(separate,x=>{x.visits[0].auditId='AUD-X'},'COMPOSITION_COMMAND_CANONICAL_VISIT_IDENTITY_REQUIRED');
err(separate,x=>{x.visits[1].obligationId='OB-GAP'},'COMPOSITION_COMMAND_OBLIGATION_PARTITION_INVALID');
err(separate,x=>{x.visits[1].blocks[0].end='11:45'},'COMPOSITION_COMMAND_SCOPE_MINUTES_MISMATCH');
err(separate,x=>{x.visits[1].blocks[0].date='2026-11-18';x.visits[1].blocks[0].start='13:00';x.visits[1].blocks[0].end='16:00'},'COMPOSITION_COMMAND_CROSS_VISIT_OVERLAP');
err(separate,x=>{x.blocks=[]},'COMPOSITION_COMMAND_UNEXPECTED_AGGREGATE_BLOCKS');
err(separate,x=>{x.visits[0].identityIssuedBy='CANONICAL'},'COMPOSITION_COMMAND_SOURCE_IDENTITY_REISSUE_FORBIDDEN');
const noSource=separate();
noSource.visits[0].auditId='AUD-3';
noSource.visits[0].identityIssuedBy='CANONICAL';
noSource.visits[0].identityIssueRevision=issueRevision;
assert.throws(()=>prepare(noSource),e=>e?.code==='COMPOSITION_COMMAND_SOURCE_AUDIT_MUST_REMAIN');
console.log('VISIT_COMPOSITION_COMMAND_20_PASS: together/separate, canonical IDs, minutes, no-overlap, no commit');
