import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareScheduledCompositionSplitRows20 as schedule} from './visit-composition-scheduled-split-20.mjs';
const base=()=>prepareVisitCompositionCommand20({
 auditId:'A1',companyUid:'C1',sourceRevision:'a'.repeat(24),mode:'SEPARATELY',
 obligations:[
 {auditId:'A1',companyUid:'C1',obligationId:'O1',scopeCode:'MPS-GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A1',companyUid:'C1',obligationId:'O2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}],
 visits:[
 {auditId:'A1',obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {auditId:'A2',obligationId:'O2',identityIssuedBy:'CANONICAL',identityIssueRevision:'b'.repeat(24),
  blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
 ]
});
const headers=['Company','Company_UID','Audit ID','Status','Assigned to','Planning JSON','Total audit time in hours','Total audit time in days','Date - Planned','Date - Approved','Scopes_List','SCOPE_01','Duration SCOPE_01','SCOPE_02','Duration SCOPE_02','SCOPE_03','Duration SCOPE_03','Auditor_UID','Last manager decision','Last decision timestamp','Status since',...Array.from({length:21},(_,i)=>'Other_'+i)];
const row=['Company A','C1','A1','Pending Planning','','','11.00','','','','','x','8','x','3','','','','','','',...Array(21).fill('')];
const assignment=(auditId,obligationId,auditorUid,auditorEmail,auditorName)=>({auditId,obligationId,auditorUid,auditorEmail,auditorName});
const input=()=>({command:base(),planningValues:[headers,row],configScopeValues:[['SlotKey','ScopeCode'],['SCOPE_01','MPS-GAP'],['SCOPE_02','GRASP'],['SCOPE_03','MPS-ABC']],
 newRowNumbers:[4],now:'2026-11-11T17:10:00',assignments:[
 assignment('A1','O1','U1','auditor1@example.com','Auditor One'),
 assignment('A2','O2','U2','auditor2@example.com','Auditor Two')]
});
const result=schedule(input());
assert.equal(result.canCommit,false);
assert.equal(result.projectionWrites.length,2);
assert.equal(result.visits.length,2);
for(let i=0;i<2;i++){
 const r=result.projectionWrites[i].values[0];
 assert.equal(r[3],'Approved');
 assert.equal(r[4],input().assignments[i].auditorEmail);
 assert.equal(r[17],input().assignments[i].auditorUid);
 assert.equal(r[18],'PLAN');assert.equal(r[19],'2026-11-11T17:10:00');
 assert.equal(r[20],'2026-11-11T17:10:00');
 assert.equal(r[9],'2026-11-11');
 const json=JSON.parse(r[5]);
 assert.equal(json.auditorEmail,r[4]);
 assert.equal(json.totalPlannedHours,i===0?8:3);
 assert.equal(json.formalHours,i===0?8:3);
 assert.equal(json.blocks[0].date,r[8]);
}
assert.deepEqual(result.projectionPreconditions[1].before,[]);
assert.equal(result.projectionWrites[0].values[0][13],'');
assert.equal(result.projectionWrites[1].values[0][11],'');
const err=(change,code)=>{const x=input();change(x);assert.throws(()=>schedule(x),e=>e?.code===code,code)};
err(x=>{x.assignments[1].auditorEmail='bad'},'COMPOSITION_SCHEDULED_AUDITOR_ASSIGNMENT_INVALID');
err(x=>{x.assignments[1].obligationId='O1'},'COMPOSITION_SCHEDULED_VISIT_ASSIGNMENT_MISMATCH');
err(x=>{x.planningValues[0][17]='Removed'},'COMPOSITION_SCHEDULED_LIFECYCLE_SCHEMA_REQUIRED');
err(x=>{x.assignments[1].maxOffsiteHours=-1},'COMPOSITION_SCHEDULED_OFFSITE_POLICY_REQUIRED');
err(x=>{x.command.visits[1].blocks[0].executionType='OFFSITE'},'COMPOSITION_SCHEDULED_OFFSITE_POLICY_REQUIRED');
err(x=>{x.now='INVALID'},'COMPOSITION_SCHEDULED_ASSIGNMENTS_REQUIRED');
console.log('VISIT_COMPOSITION_SCHEDULED_SPLIT_20_PASS: full manager lifecycle and per-visit blocks, auditor identity, offsite fail-closed; no writes');
