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
  'Min_Interval_Months','Rotation_Applies','Rotation_Normal_Maximum','Max_Offsite_Hours','Recurring'],
  ['SCOPE_01','ABC','MPS-ABC','Yes','No',0,'No',3,1,'Yes'],
  ['SCOPE_02','GRASP','GRASP','Yes','No',0,'No',3,1,'Yes']],
 auditorRows:[['E-mail','Auditor_UID','Role','Active','Name'],
  ['auditor@example.test','AUD-1','Auditor','Yes','Auditor One']],
 qualificationRows:[['Auditor_UID','ScopeCode','Qualified'],
  ['AUD-1','ABC','YES'],['AUD-1','GRASP','YES']],
 companyRows:[['Company_UID','Company','Locations_JSON'],['company1','Example Farm',JSON.stringify([{code:'HQ',active:true},{code:'S1',active:true},{code:'S2',active:false}])]],
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
const partialBody={...body,visits:[body.visits[0]]};
const partial=prepareSeparateCompositionAuthority20({...fixture,body:partialBody});
assert.equal(partial.visits.length,1);
assert.equal(partial.sourceTombstone.identityRetired,undefined);
assert.equal(partial.sourceTombstone.partialScopePlanning,true);
assert.deepEqual(partial.remainingObligationIds,['OB2']);
assert.equal(partial.entities[0].remove,false);
const partialSource=partial.projectionWrites.find(x=>x.range.startsWith('Audit planning!')).values[0];
assert.equal(partialSource[18],3);
assert.equal(partialSource[2],'');
assert.equal(partialSource[4],'X');
const partialJson=JSON.parse(partialSource[32]);
assert.equal(partialJson.partialScopePlanning,true);
assert.deepEqual(partialJson.remainingObligationIds,['OB2']);
assert.equal(partial.projectionWrites.filter(x=>x.range.startsWith('Audit_Visit_Obligations!')).length,1);
const sequentialLinks=structuredClone(fixture.linkRows);
sequentialLinks[1][2]='INACTIVE';
sequentialLinks.push(['VIS-'+createHash('sha256').update('AMS_SPLIT_V1|A1|company1|OB1').digest('hex').slice(0,20).toUpperCase(),'OB1','ACTIVE','','','']);
const secondSourceCanonical={...fixture.sourceCanonical,revision:2,
 snapshot:{...fixture.sourceCanonical.snapshot,sourceRevision:partial.sourceTombstone.sourceRevision}};
const secondBody={...body,sourceRevision:partial.sourceTombstone.sourceRevision,visits:[body.visits[1]]};
const finalScope=prepareSeparateCompositionAuthority20({...fixture,body:secondBody,
 planningRows:[h,partialSource],linkRows:sequentialLinks,sourceCanonical:secondSourceCanonical});
assert.equal(finalScope.visits.length,1);
assert.deepEqual(finalScope.remainingObligationIds,[]);
assert.equal(finalScope.entities[0].remove,true);
assert.equal(finalScope.sourceTombstone.identityRetired,true);
assert.equal(finalScope.sourceTombstone.successorAuditIds.length,2);
const prepare=overrides=>prepareSeparateCompositionAuthority20({...fixture,...overrides});
const offsiteBlocks=[
 {date:'2027-03-12',start:'08:00',end:'09:00',executionType:'OFFSITE',execLoc:''},
 {date:'2027-03-12',start:'09:00',end:'16:00',executionType:'ONSITE',execLoc:'S1'}
];
const withOffsite=structuredClone(body);
withOffsite.visits[0].blocks=offsiteBlocks;
const scopedOffsite=prepareSeparateCompositionAuthority20({...fixture,body:withOffsite});
assert.equal(scopedOffsite.visits[0].blocks[0].executionType,'OFFSITE');
assert.equal(scopedOffsite.visits[0].blocks[1].execLoc,'S1');
const overCap=structuredClone(body);
overCap.visits[0].blocks=[
 {date:'2027-03-12',start:'08:00',end:'10:00',executionType:'OFFSITE',execLoc:''},
 {date:'2027-03-12',start:'10:00',end:'16:00',executionType:'ONSITE',execLoc:'HQ'}
];
assert.throws(()=>prepareSeparateCompositionAuthority20({...fixture,body:overCap}),/OFFSITE_SCOPE_MAX_EXCEEDED/);
const badLocation=structuredClone(body);
badLocation.visits[0].blocks[0].execLoc='S2';
assert.throws(()=>prepareSeparateCompositionAuthority20({...fixture,body:badLocation}),/LOCATION_NOT_CANONICAL/);

const localizedRows=structuredClone(fixture.obligationRows);
localizedRows[1][4]='01/01/2027';localizedRows[1][5]='31/12/2027';localizedRows[1][7]='30/06/2027';
const localized=prepare({obligationRows:localizedRows});
assert.deepEqual(localized.appendIntents.find(x=>x.range==='Audit planning!A:CN')
 .values.map(x=>x[24]),['2027-06-30','2027-09-30']);
const absentExpiry=structuredClone(fixture.obligationRows);
absentExpiry[1][7]='';
assert.throws(()=>prepare({obligationRows:absentExpiry}),/OBLIGATION_CYCLE_DATES_MISSING/);
const malformedDate=structuredClone(fixture.obligationRows);
malformedDate[1][7]='31/02/2027';
assert.throws(()=>prepare({obligationRows:malformedDate}),/DATE_INVALID/);
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
const partialStore={
 async readAudit(id){return id==='A1'?sourceCanonical:null;},
 async readOutbox(){return null;},
 async commitMulti(x){assert.equal(x.entities.length,2);assert.equal(x.entities[0].remove,false);return {replayed:false};},
 async markProjected(){}
};
const partialService=createVisitCompositionAtomicService20({
 store:partialStore,gate,availabilityService,hardGate:()=>true,
 preflight:async()=>partial,projector:projection,appendProjector:appended
});
const partialOutcome=await partialService.commit({actor,body:partialBody});
assert.equal(partialOutcome.success,true);
assert.equal(partialOutcome.auditIds.length,1);
assert.equal(lease,0);
const finalStore={
 async readAudit(id){return id==='A1'?secondSourceCanonical:null;},
 async readOutbox(){return null;},
 async commitMulti(x){assert.equal(x.entities.length,2);assert.equal(x.entities[0].remove,true);return {replayed:false};},
 async markProjected(){}
};
const finalService=createVisitCompositionAtomicService20({
 store:finalStore,gate,availabilityService,hardGate:()=>true,
 preflight:async()=>finalScope,projector:projection,appendProjector:appended
});
const finalOutcome=await finalService.commit({actor,body:secondBody});
assert.equal(finalOutcome.success,true);
assert.equal(finalOutcome.auditIds.length,1);
assert.equal(lease,0);
console.log('VISIT_COMPOSITION_SEPARATE_AUTHORITY_20_PASS: full source-to-atomic outbox, Model C, 8+3 hour visits, availability and notifications');
