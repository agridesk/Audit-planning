import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVisitCompositionCanonicalPreflight20} from './visit-composition-canonical-preflight-20.mjs';
const rows={
 readAuditRows:[['Audit ID','Company_UID','Status','Assigned to','Planning JSON','Last decision timestamp','Status since','Auditor_UID'],
 ['A1','C1','Pending Planning','','','','','']],
 readObligationRows:[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours','Obligation_State','Planning_Window_From','Planning_Window_To'],
 ['O1','C1','MPS-GAP',8,'OPEN','2026-11-01','2026-12-01'],['O2','C1','GRASP',3,'LINKED_TO_VISIT','01/11/2026','30/11/2026']],
 readLinkRows:[['Audit_ID','Obligation_ID','Link_State','Migration_Batch_ID','Linked_At','Unlinked_At'],
 ['A1','O1','ACTIVE','MIG','2026-01-01',''],['A1','O2','ACTIVE','MIG','2026-01-01','']],
 readConfigScopeRows:[['SlotKey','ScopeCode'],['SCOPE_02','MPS-GAP'],['SCOPE_04','GRASP']],
 emptyAppendRows:[],emptyPlanningRows:[]
};
let reads=0;
const qualificationRows=[
 ['Auditor_UID','ScopeCode','Qualified'],['AUD-1','MPS-GAP','YES'],['AUD-1','GRASP','YES'],['AUD-2','GRASP','YES']
];
const reader={
 async read(){reads++;return structuredClone(rows)},
 async readQualifications(){return {
  auditorRows:[['Name','E-mail','Role','Active','Auditor_UID'],['Auditor','auditor@example.com','Auditor','Yes','AUD-1'],['Auditor 2','auditor2@example.com','Auditor','Yes','AUD-2']],
  qualificationRows:structuredClone(qualificationRows)
 }}
};
const service=createVisitCompositionCanonicalPreflight20({reader});
const sourceRevision=createHash('sha256').update('A1|Pending Planning||||').digest('hex').slice(0,24);
const together={
 auditId:'A1',sourceRevision,mode:'TOGETHER',
 blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'},{date:'2026-11-19',start:'09:00',end:'12:00'}],
 allocations:[{blockIndex:0,obligationId:'O1',start:'08:00',end:'16:00'},{blockIndex:1,obligationId:'O2',start:'09:00',end:'12:00'}]
};
const good=await service.preview(together);
assert.equal(good.readOnly,true);assert.equal(good.writeEnabled,false);
assert.equal(good.sourceRevision,sourceRevision);
assert.equal(good.totalRequiredMinutes,660);
assert.equal(good.allocations.length,2);
assert.equal(good.windows.length,2);
const qualified=await service.preview({...together,auditorUid:'AUD-1'});
assert.equal(qualified.qualifications.qualified,true);
assert.equal(qualified.qualifications.availabilityVerified,false);
qualificationRows[2][2]='NO';
await assert.rejects(()=>service.preview({...together,auditorUid:'AUD-1'}),/COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED/);
qualificationRows[2][2]='YES';
const separate=await service.preview({auditId:'A1',mode:'SEPARATELY'});
const split=await service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]});
const perVisit=await service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',auditorUid:'AUD-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',auditorUid:'AUD-2',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]});
assert.equal(perVisit.qualificationsVerified,true);
assert.equal(perVisit.visitQualifications.length,2);
assert.equal(perVisit.visitQualifications[1].auditorEmail,'auditor2@example.com');
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',auditorUid:'AUD-1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',auditorUid:'AUD-1',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
],auditorUid:'AUD-1'}),/COMPOSITION_PREFLIGHT_SPLIT_AUDITOR_SET_INCOMPLETE/);
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',auditorUid:'AUD-2',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',auditorUid:'AUD-1',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]}),/COMPOSITION_QUALIFICATIONS_SCOPE_NOT_QUALIFIED/);
assert.equal(split.proposedVisits.length,2);
assert.equal(split.totalRequiredMinutes,660);
assert.equal(split.newIdsAreOnlyProposals,true);
assert.equal(split.proposedVisits[0].auditId,'A1');
assert.match(split.proposedVisits[1].auditId,/^A1_SPLIT_/);
rows.readAuditRows.push([split.proposedVisits[1].auditId,'C1','Pending Planning','','','','','']);
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]}),/COMPOSITION_PREFLIGHT_NEW_AUDIT_ID_ALREADY_EXISTS/);
rows.readAuditRows.pop();
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',auditId:'CLIENT_SELECTED',blocks:[{date:'2026-11-19',start:'09:00',end:'12:00'}]}
]}),/COMPOSITION_PREFLIGHT_SEPARATE_VISIT_UNTRUSTED_IDENTITY/);
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY',visits:[
 {obligationId:'O1',blocks:[{date:'2026-11-18',start:'08:00',end:'16:00'}]},
 {obligationId:'O2',blocks:[{date:'2027-01-19',start:'09:00',end:'12:00'}]}
]}),/COMPOSITION_WINDOW_OUTSIDE_ALLOWED_PERIOD/);
assert.equal(separate.requiredVisitCount,2);
assert.equal(separate.canCommit,false);
assert.match(separate.reason,/SPLIT_VISIT_BLOCKS_REQUIRED/);
await assert.rejects(()=>service.preview({...together,sourceRevision:'b'.repeat(24)}),/COMPOSITION_PREFLIGHT_SOURCE_REVISION_CONFLICT/);
await assert.rejects(()=>service.preview({...together,blocks:[together.blocks[0]],allocations:[together.allocations[0]]}),/SCOPE_ALLOCATION_REQUIRED_HOURS_MISMATCH|SCOPE_ALLOCATION_TOTAL_HOURS_MISMATCH/);
rows.readAuditRows[1][2]='Accepted';
await assert.rejects(()=>service.preview({...together,sourceRevision:undefined}),/COMPOSITION_SOURCE_NOT_PENDING_PLANNING/);
await assert.rejects(()=>service.preview({auditId:'A1',mode:'SEPARATELY'}),/COMPOSITION_SOURCE_NOT_PENDING_PLANNING/);
rows.readAuditRows[1][2]='Pending Planning';
rows.readLinkRows.push(['A3','O2','ACTIVE','MIG','2026-01-01','']);
await assert.rejects(()=>service.preview(together),/COMPOSITION_SOURCE_ACTIVE_LINK_CONFLICT/);
rows.readLinkRows.pop();
assert.equal(reads>=14,true);
console.log('VISIT_COMPOSITION_CANONICAL_PREFLIGHT_20_PASS: actual revision, Together minute allocation, split preview, terminal and link drift, no writes');
