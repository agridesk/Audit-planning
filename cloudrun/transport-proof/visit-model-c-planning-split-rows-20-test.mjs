import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareModelCPlanningVisitSplitRows20 as project} from './visit-model-c-planning-split-rows-20.mjs';
const base=()=>prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision:'a'.repeat(24),mode:'SEPARATELY',
 obligations:[
 {auditId:'A1',companyUid:'C1',obligationId:'O1',scopeCode:'MPS-GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A1',companyUid:'C1',obligationId:'O2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
 ],
 visits:[
 {auditId:'A1',obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {auditId:'A2',obligationId:'O2',identityIssuedBy:'CANONICAL',identityIssueRevision:'b'.repeat(24),
  blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
 ]
});
const headers=['Company','Company_UID','Audit ID','Status','Assigned to','Planning JSON','Total audit time in hours','Total audit time in days','Date - Planned','Date - Approved','Scopes_List','SCOPE_01','Duration SCOPE_01','SCOPE_02','Duration SCOPE_02','SCOPE_03','Duration SCOPE_03',...Array.from({length:24},(_,i)=>'Other_'+i)];
const row=()=>['Company A','C1','A1','Pending Planning','','','11.00','','','','','x','8','x','3','','',...Array(24).fill('')];
const config=()=>[['SlotKey','ScopeCode'],['SCOPE_01','MPS-GAP'],['SCOPE_02','GRASP'],['SCOPE_03','MPS-ABC']];
const input=()=>({command:base(),planningValues:[headers,row()],configScopeValues:config(),newRowNumbers:[4]});
const result=project(input());
assert.equal(result.canCommit,false);
assert.deepEqual(result.projectedAuditIds,['A1','A2']);
assert.equal(result.projectionWrites.length,2);
assert.equal(result.projectionWrites[0].values[0][11],'x');
assert.equal(result.projectionWrites[0].values[0][12],'8');
assert.equal(result.projectionWrites[0].values[0][13],'');
assert.equal(result.projectionWrites[0].values[0][6],'8.00');
assert.equal(result.projectionWrites[1].values[0][2],'A2');
assert.equal(result.projectionWrites[1].values[0][11],'');
assert.equal(result.projectionWrites[1].values[0][13],'x');
assert.equal(result.projectionWrites[1].values[0][14],'3');
assert.equal(result.projectionWrites[1].values[0][6],'3.00');
assert.deepEqual(result.projectionPreconditions[1].before,[]);
const err=(edit,code)=>{const x=input();edit(x);assert.throws(()=>project(x),e=>e?.code===code,code)};
err(x=>{x.planningValues[1][3]='Accepted'},'COMPOSITION_PLANNING_SOURCE_STATUS_OR_OWNER_INVALID');
err(x=>{x.planningValues[1][4]='aud@example.com'},'COMPOSITION_PLANNING_EXISTING_STATE_REQUIRES_MIGRATION');
err(x=>{x.planningValues[1][14]='4'},'COMPOSITION_PLANNING_SOURCE_SCOPE_MISMATCH');
err(x=>{x.planningValues[1][6]='12'},'COMPOSITION_PLANNING_SOURCE_TOTAL_MISMATCH');
err(x=>{x.planningValues[1][15]='x'},'COMPOSITION_PLANNING_EXTRA_SOURCE_SCOPE');
err(x=>{x.planningValues[0][17]='SCOPE_19';x.planningValues[1][17]='x'},'COMPOSITION_PLANNING_UNKNOWN_ACTIVE_SCOPE');
err(x=>{x.configScopeValues[2][1]='MPS-GAP'},'COMPOSITION_PLANNING_SCOPE_MAPPING_DUPLICATE');
err(x=>{x.configScopeValues[2][1]='OTHER'},'COMPOSITION_PLANNING_SCOPE_NOT_IN_CONFIG');
err(x=>{x.planningValues.push([...row().slice(0,2),'A2'])},'COMPOSITION_PLANNING_NEW_ID_COLLISION');
err(x=>{x.newRowNumbers=[2]},'COMPOSITION_PLANNING_NEW_ROWS_UNVERIFIED');
err(x=>{x.planningValues[1][10]='MPS-GAP,GRASP'},'COMPOSITION_PLANNING_EXISTING_STATE_REQUIRES_MIGRATION');
console.log('VISIT_MODEL_C_PLANNING_SPLIT_ROWS_20_PASS: Config_Scopes identity mapping, explicit hours, full-row lineage, source CAS, no writes');
