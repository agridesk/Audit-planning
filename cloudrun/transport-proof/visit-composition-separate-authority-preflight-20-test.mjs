import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareSeparateCompositionAuthority20} from './visit-composition-separate-authority-preflight-20.mjs';
import {createVisitCompositionAtomicService20} from './visit-composition-atomic-service-20.js';
const h=Array.from({length:70},(_,i)=>'UNUSED_'+i);
for(const [i,name] of [[0,'Company'],[2,'SCOPE_01'],[3,'Duration SCOPE_01'],
 [4,'SCOPE_02'],[5,'Duration SCOPE_02'],[18,'Total audit time in hours'],
 [19,'Total audit time in days'],[22,'Assigned to'],[24,'Date - Will Expire'],
 [25,'Extended Expiration Date'],[26,'Date - Planned'],[27,'Date - Approved'],
 [28,'Status'],[32,'Planning JSON'],[33,'Extension applied'],[34,'Audit ID'],
 [35,'Last manager decision'],[36,'Last decision timestamp'],[37,'Status since'],
 [38,'Company_UID'],[39,'Scopes_List'],[44,'Planning window from'],
 [45,'Planning window to'],[46,'Auditor_UID']])h[i]=name;
const source=Array(70).fill('');
source[0]='Example Farm';source[2]='X';source[4]='X';source[18]=11;
source[28]='Pending Planning';source[34]='A1';source[38]='company1';
const revision=createHash('sha256').update(['A1','Pending Planning','','','',''].join('|')).digest('hex').slice(0,24);
const blocks1=[{date:'2027-03-12',start:'08:00',end:'16:00',execLoc:'HQ'}];
const blocks2=[{date:'2027-03-13',start:'08:00',end:'11:00',execLoc:'HQ'}];
const body={auditId:'A1',composition:'SEPARATELY',sourceRevision:revision,
 visits:[{obligationId:'OB1',auditorEmail:'auditor@example.test',blocks:blocks1},
  {obligationId:'OB2',auditorEmail:'auditor@example.test',blocks:blocks2}]};
const actor={role:'manager',auditorId:'manager-1',email:'manager@example.test'};
const sourceCanonical={auditId:'A1',revision:1,snapshot:{auditId:'A1',status:'Pending Planning',
 sourceRevision:revision},pendingOperationId:null};
const fixture={
 actor,body,sourceCanonical,planningRows:[h,source],
 obligationRows:[['Obligation_ID','Company_UID','ScopeCode','Formal_Hours',
  'Planning_Window_From','Planning_Window_To','Obligation_State','Effective_Expiry_Date'],
  ['OB1','company1','ABC',8,'2027-01-01','2027-12-31','LINKED_TO_VISIT','2027-06-30'],
  ['OB2','company1','GRASP',3,'2027-01-01','2027-12-31','OPEN','2027-09-30']],
 linkRows:[['Audit_ID','Obligation_ID','Link_State','Migration_Batch_ID','Linked_At','Unlinked_At'],
  ['A1','OB1','ACTIVE','','',''],['A1','OB2','ACTIVE','','','']],
 scopeRows:[['SlotKey','ScopeCode','DisplayName','Active','Archived',
  'Min_Interval_Months','Rotation_Applies','Rotation_Normal_Maximum'],
  ['SCOPE_01','ABC','MPS-ABC','Yes','No',0,'No',3],
  ['SCOPE_02','GRASP','GRASP','Yes','No',0,'No',3]],
 auditorRows:[['E-mail','Auditor_UID','Role','Active','Name'],
  ['auditor@example.test','AUD-1','Auditor','Yes','Auditor One']],
 qualificationRows:[['Auditor_UID','ScopeCode','Qualified'],
  ['AUD-1','ABC','YES'],['AUD-1','GRASP','YES']],
 companyRows:[['Company_UID','Company'],['company1','Example Farm']],
 realizedRows:[['Company','Company_UID','Auditor_UID','Status','Year',
  'Date completed','SCOPE_01','SCOPE_02']],
 reservationRows:[['Audit ID','State','Released At','Released By','Release Reason',
  'Updated At'],['A1','ACTIVE','','','','']],
 availabilityRows:[['Date','Auditor_Email','Available',
  'First_Audit_Start_Time','First_Audit_End_Time','Audit_ID_1',
  'Second_Audit_Start_Time','Second_Audit_End_Time','Audit_ID_2',
  'Status_1','Status_2','Last_Updated']],
 availabilityVersions:{'AUD-1':0},now:'2026-11-11T22:00:00.000Z'
};
const result=prepareSeparateCompositionAuthority20(fixture);
assert.equal(result.success,true);
assert.equal(result.authorityPreflight,true);
assert.equal(result.visits.length,2);
assert.deepEqual(result.visits.map(x=>x.requiredMinutes),[480,180]);
assert.deepEqual(result.visits.map(x=>x.snapshot.status),['Approved','Approved']);
assert.equal(result.entities[0].remove,true);
assert.equal(result.sourceTombstone.status,'Pending Planning');
assert.equal(result.sourceTombstone.identityRetired,true);
const sourceWrite=result.projectionWrites.find(x=>x.range.startsWith('Audit planning!'));
assert.equal(JSON.parse(sourceWrite.values[0][32]).identityRetired,true);
assert.equal(sourceWrite.values[0][28],'Pending Planning');
assert.equal(result.projectionWrites.filter(x=>x.range.startsWith('Audit_Visit_Obligations!')).length,2);
assert.equal(result.projectionWrites.filter(x=>x.range.startsWith('Auditor Availability!')).length,2);
assert.equal(result.projectionWrites.filter(x=>x.range.startsWith('Concept Reservations!')).length,1);
assert.equal(result.appendIntents.find(x=>x.range==='Audit planning!A:CN').values.length,2);
assert.equal(result.appendIntents.find(x=>x.range==='Notification Queue!A:M').values.length,2);
assert.deepEqual(result.appendIntents.find(x=>x.range==='Audit planning!A:CN')
 .values.map(x=>x[24]),['2027-06-30','2027-09-30']);
const prepare=overrides=>prepareSeparateCompositionAuthority20({...fixture,...overrides});
assert.throws(()=>prepare({body:{...body,sourceRevision:'stale'}}),/REVISION_STALE/);
assert.throws(()=>prepare({linkRows:[...fixture.linkRows,['OTHER','OB1','ACTIVE','','','']]}),/ACTIVE_MEMBERSHIP_INVALID/);
assert.throws(()=>prepare({body:{...body,visits:[
 {...body.visits[0],auditorEmail:'other@example.test'},body.visits[1]]}}),/AUDITOR_IDENTITY_INVALID/);
assert.throws(()=>prepare({body:{...body,visits:[
 {...body.visits[0],blocks:[{date:'2028-03-12',start:'08:00',end:'16:00'}]},body.visits[1]]}}),/BLOCK_OUTSIDE_WINDOW/);
assert.throws(()=>prepare({availabilityVersions:{'AUD-1':null}}),/AVAILABILITY_VERSION_MISSING/);
let committed=0,projected=0,lease=0,outbox=null,gateHeld=false;
const store={
 async readAudit(id){return id==='A1'?sourceCanonical:null;},
 async readOutbox(){return outbox;},
 async commitMulti(x){assert.equal(x.entities.length,3);committed++;outbox={
  auditId:'A1',actorId:'manager-1',action:'VISIT_COMPOSITION_SEPARATELY',state:'PENDING'};return{replayed:false};},
 async markProjected(){projected++;outbox.state='PROJECTED';}
};
const gate={async acquire(){gateHeld=true;return{token:'g'};},
 async release(){gateHeld=false;},async uncertain(){throw Error('UNEXPECTED_UNCERTAINTY');}};
const availabilityService={
 async acquirePlanningLease(){lease++;return{token:'lease',version:1,document:{version:1,blocks:[],
  baselineExceptions:[],baselineReleases:[]}};},
 async releasePlanningLease(){lease--;},
 async markPlanningLeaseUncertain(){throw Error('UNEXPECTED_UNCERTAINTY');}
};
const projection={async apply(){},async inspect(){return{state:'MATCH',detail:[]}}};
const appended={async apply(){},async inspect(){return{state:'MATCH',count:4}}};
const service=createVisitCompositionAtomicService20({
 store,gate,availabilityService,hardGate:()=>true,
 preflight:async()=>prepareSeparateCompositionAuthority20(fixture),
 projector:projection,appendProjector:appended
});
const output=await service.commit({actor,body});
assert.equal(output.success,true);
assert.equal(committed,1);assert.equal(projected,1);assert.equal(lease,0);
assert.equal(gateHeld,false);
assert.deepEqual(output.auditIds,result.visits.map(x=>x.auditId));
console.log('VISIT_COMPOSITION_SEPARATE_AUTHORITY_20_PASS: full source-to-atomic outbox, Model C, 8+3 hour visits, availability and notifications');
