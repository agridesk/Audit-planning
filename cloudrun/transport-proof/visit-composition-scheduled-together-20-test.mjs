import assert from 'node:assert/strict';
import {prepareVisitCompositionCommand20} from './visit-composition-command-20.mjs';
import {prepareScheduledCompositionTogetherRow20 as schedule} from './visit-composition-scheduled-together-20.mjs';
import {deriveCompositionSourceRevision20} from './visit-composition-source-revision-20.mjs';
const command=prepareVisitCompositionCommand20({
 auditId:'A-1',companyUid:'C-1',sourceRevision:'a'.repeat(24),mode:'TOGETHER',
 obligations:[
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-1',scopeCode:'GAP',formalHours:8,linkState:'ACTIVE'},
 {auditId:'A-1',companyUid:'C-1',obligationId:'O-2',scopeCode:'GRASP',formalHours:3,linkState:'ACTIVE'}
 ],
 blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'},{date:'2026-11-19',start:'09:00',end:'12:00'}],
 allocations:[{blockIndex:0,obligationId:'O-1',start:'08:00',end:'16:00'},
 {blockIndex:1,obligationId:'O-2',start:'09:00',end:'12:00'}]
});
const headers=['Company','Company_UID','Audit ID','Status','Assigned to','Planning JSON',
 'Total audit time in hours','Date - Planned','Date - Approved','Auditor_UID',
 'Last manager decision','Last decision timestamp','Status since',...Array.from({length:28},(_,i)=>'Other_'+i)];
const source=['A Company','C-1','A-1','Pending Planning','','','11','','','','','','',...Array(28).fill('')];
const input=()=>({command,planningValues:[structuredClone(headers),structuredClone(source)],
 assignment:{auditorUid:'AUD-1',auditorEmail:'auditor@example.com',auditorName:'Auditor Example'},
 now:'2026-11-11T17:10:00'});
const result=schedule(input());
assert.equal(result.canCommit,false);
assert.equal(result.projectionWrites.length,1);
assert.equal(result.projectionWrites[0].range,'Audit planning!A2:AO2');
const after=result.projectionWrites[0].values[0];
assert.equal(after[3],'Approved');assert.equal(after[4],'auditor@example.com');
assert.equal(after[9],'AUD-1');assert.equal(after[10],'PLAN');
assert.equal(after[8],'2026-11-11');assert.equal(after[7],'2026-11-18');
assert.equal(after[11],'2026-11-11T17:10:00');
const json=JSON.parse(after[5]);
assert.equal(json.formalHours,11);assert.equal(json.totalPlannedHours,11);
assert.equal(json.auditorEmail,'auditor@example.com');assert.equal(json.blocks.length,2);
assert.equal(result.sourceRevision,deriveCompositionSourceRevision20({auditId:'A-1',planningRows:[headers,after]}).sourceRevision);
assert.notEqual(result.sourceRevision,command.sourceRevision);
const reject=(change,code)=>{const x=input();change(x);assert.throws(()=>schedule(x),e=>e?.code===code,code)};
reject(x=>{x.planningValues[1][3]='Accepted'},'COMPOSITION_TOGETHER_SOURCE_STATE_INVALID');
reject(x=>{x.planningValues[1][4]='existing@example.com'},'COMPOSITION_TOGETHER_EXISTING_PLAN_REQUIRES_MIGRATION');
reject(x=>{x.planningValues[1][6]='10'},'COMPOSITION_TOGETHER_FORMAL_HOURS_MISMATCH');
reject(x=>{x.assignment.auditorEmail='invalid'},'COMPOSITION_TOGETHER_AUDITOR_REQUIRED');
reject(x=>{x.command={...x.command,blocks:x.command.blocks.map((b,i)=>({...b,...(i===0?{executionType:'OFFSITE'}:{})}))}},'COMPOSITION_TOGETHER_OFFSITE_POLICY_REQUIRED');
reject(x=>{x.planningValues[0][9]='Not a UID'},'COMPOSITION_TOGETHER_LIFECYCLE_SCHEMA_MISSING');
console.log('VISIT_COMPOSITION_SCHEDULED_TOGETHER_20_PASS: manager Approved row, 11h per-scope allocation, R4 post-revision, fail-closed');
