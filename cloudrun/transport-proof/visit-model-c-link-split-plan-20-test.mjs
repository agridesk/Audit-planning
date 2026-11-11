import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareModelCVisitLinkSplit20 as plan} from './visit-model-c-link-split-plan-20.mjs';
const command=()=>prepareVisitCompositionCommand20({
 auditId:'A-1',companyUid:'C-1',sourceRevision:'a'.repeat(24),mode:'SEPARATELY',
 obligations:[
  {auditId:'A-1',companyUid:'C-1',obligationId:'O-1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
  {auditId:'A-1',companyUid:'C-1',obligationId:'O-2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
 ],
 visits:[
  {auditId:'A-1',obligationId:'O-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
  {auditId:'A-2',identityIssuedBy:'CANONICAL',identityIssueRevision:'b'.repeat(24),
   obligationId:'O-2',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
 ]
});
const sheet=()=>[
 ['Audit_ID','Obligation_ID','Link_State','Linked_At','Unlinked_At','Migration_Batch_ID'],
 ['A-1','O-1','ACTIVE','2026-01-01','',''],
 ['A-1','O-2','ACTIVE','2026-01-01','','BATCH-ORIGIN'],
 ['A-3','O-3','ACTIVE','2026-01-01','','']
];
const input=()=>({command:command(),linkValues:sheet(),appendRowNumbers:[5],now:'2026-11-11T17:10:00'});
const output=plan(input());
assert.equal(output.canCommit,false);
assert.equal(output.requiresFence,true);
assert.deepEqual(output.movedObligationIds,['O-2']);
assert.equal(output.preservedObligationId,'O-1');
assert.equal(output.projectionWrites.length,2);
assert.equal(output.projectionWrites[0].range,'Audit_Visit_Obligations!A3:F3');
assert.equal(output.projectionWrites[0].values[0][2],'INACTIVE');
assert.equal(output.projectionWrites[1].range,'Audit_Visit_Obligations!A5:F5');
assert.equal(output.projectionWrites[1].values[0][0],'A-2');
assert.equal(output.projectionWrites[1].values[0][1],'O-2');
assert.equal(output.projectionWrites[1].values[0][5],'BATCH-ORIGIN');
assert.equal(output.projectionWrites[1].values[0][4],'');
assert.equal(output.projectionWrites[0].values[0][5],'BATCH-ORIGIN');
assert.deepEqual(output.projectionPreconditions[1].before,[]);
assert.equal(output.requiredProofs.includes('FIRESTORE_MULTI_TRANSACTION'),true);
const error=(edit,code)=>{const x=input();edit(x);assert.throws(()=>plan(x),e=>e?.code===code,code);};
error(x=>{x.command={...x.command,canCommit:true}},'MODEL_C_LINK_SPLIT_COMMAND_INVALID');
error(x=>{x.linkValues=[]},'MODEL_C_LINK_SPLIT_SNAPSHOT_REQUIRED');
error(x=>{x.now='bad'},'MODEL_C_LINK_SPLIT_TIMESTAMP_INVALID');
error(x=>{x.linkValues[0][2]='different'},'MODEL_C_LINK_SPLIT_SCHEMA_INVALID');
error(x=>{x.linkValues[0][5]='Link_ID'},'MODEL_C_LINK_SPLIT_LINK_IDENTITY_WRITER_REQUIRED');
error(x=>{x.linkValues.push(['A-4','O-2','ACTIVE'])},'MODEL_C_LINK_SPLIT_ACTIVE_CONFLICT');
error(x=>{x.linkValues[2][2]='INACTIVE'},'MODEL_C_LINK_SPLIT_SOURCE_LINK_DRIFT');
error(x=>{x.linkValues.push(['A-1','O-4','ACTIVE'])},'MODEL_C_LINK_SPLIT_SOURCE_LINK_DRIFT');
error(x=>{x.appendRowNumbers=[]},'MODEL_C_LINK_SPLIT_APPEND_ROWS_REQUIRED');
error(x=>{x.appendRowNumbers=[3]},'MODEL_C_LINK_SPLIT_APPEND_UNVERIFIED');
error(x=>{x.linkValues[2]=['A-1','O-2','ACTIVE','2026','','','EXTRA']},'MODEL_C_LINK_SPLIT_ROW_INVALID');
console.log('VISIT_MODEL_C_LINK_SPLIT_PLAN_PASS: exact active links, tombstone + append, fail-closed snapshot, no writes');
