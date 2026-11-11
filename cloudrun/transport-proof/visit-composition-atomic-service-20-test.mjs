import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVisitCompositionAtomicService20} from './visit-composition-atomic-service-20.js';
const blocks=[{date:'2027-03-12',start:'09:00',end:'12:00'}];
const splitId=obligationId=>'VIS-'+createHash('sha256').update(
 ['AMS_SPLIT_V1','source-1','company-1',obligationId].join('|')
).digest('hex').slice(0,20).toUpperCase();
const v=(id,ob,minutes=180)=>({auditId:id,obligationIds:ob,snapshot:{auditId:id,status:'Approved',
 allocations:ob.map(obligationId=>({blockId:'block-1',obligationId,minutes:minutes/ob.length}))},
 auditorId:'aud-1',auditorEmail:'auditor@example.test',companyUid:'company-1',
 requiredMinutes:minutes,blocks});
function testFixture(mode='TOGETHER'){
 const auditId='source-1';
 const visits=mode==='TOGETHER'?[v(auditId,['ob-1','ob-2'],180)]:
  [v(splitId('ob-1'),['ob-1']),{...v(splitId('ob-2'),['ob-2']),blocks:[{date:'2027-03-12',start:'12:00',end:'15:00'}]}];
 const entities=mode==='TOGETHER'?
  [{auditId,expectedRevision:1,remove:false,auditorId:'aud-1',blocks,nextSnapshot:visits[0].snapshot}]:
  [{auditId,expectedRevision:1,remove:true,auditorId:null,blocks:[],nextSnapshot:{auditId,status:'Completed'}},
   ...visits.map(x=>({auditId:x.auditId,expectedRevision:null,remove:false,
     auditorId:x.auditorId,blocks:x.blocks,nextSnapshot:x.snapshot}))];
 const preview={success:true,authorityPreflight:true,composition:mode,sourceAuditId:auditId,expectedSourceRevision:'rev-1',
  freshAvailabilityProvenance:true,qualificationsVerified:true,availabilityVersions:{'aud-1':0},
  modelCLinkTransferVerified:true,
  notificationIntentsVerified:true,sourceIdentityCollisionChecked:true,sourceRevisionChecked:true,
  projectionWrites:[{range:'Audit planning!A2:B2',values:[['x','y']]}],
  projectionPreconditions:[{range:'Audit planning!A2:B2',before:['a','b']}],
  appendIntents:[{range:'Notification Queue!A:M',values:[['PLAN']]}],
  visits,entities,activeObligationIds:['ob-1','ob-2'],sourceTombstone:{auditId},projectionPlan:{auditId},
  scopeAllocation:mode==='TOGETHER'?{
   auditId,composition:'TOGETHER',
   obligations:[{auditId,obligationId:'ob-1',scopeCode:'GAP',linkState:'ACTIVE',requiredMinutes:90},
    {auditId,obligationId:'ob-2',scopeCode:'GRASP',linkState:'ACTIVE',requiredMinutes:90}],
   blocks:[{...blocks[0],blockId:'block-1'}],
   allocations:[{blockId:'block-1',obligationId:'ob-1',minutes:90},
    {blockId:'block-1',obligationId:'ob-2',minutes:90}]
  }:null};
 let applied=0,leases=0,uncertain=0,locked=false,mark=0,fail='';
 const outbox=new Map();
 const store={
  async readAudit(id){if(id!==auditId)return null;return {revision:1,pendingOperationId:null,snapshot:{sourceRevision:'rev-1'}};},
  async readOutbox(id){return outbox.get(id)||null;},
  async commitMulti(x){if(fail==='commit')throw Error('WRITE_TIMEOUT');outbox.set(x.operationId,
    {auditId,actorId:'manager-1',action:'VISIT_COMPOSITION_'+mode,state:'PENDING'});
    return {replayed:false,entities:x.entities.map(e=>e.auditId)};},
  async markProjected(x){mark++;outbox.get(x.operationId).state='PROJECTED';},
  async markUncertain(){uncertain++;}
 };
 const gate={async acquire(){locked=true;return {token:'gate-1'};},
  async release(){locked=false;},async uncertain(){uncertain++;}};
 const availabilityService={
  async acquirePlanningLease(){leases++;return {token:'lease-1',version:1,document:{version:1}};},
  async releasePlanningLease(){leases--;},
  async markPlanningLeaseUncertain(){uncertain++;}
 };
 const projector={async apply(){applied++;if(fail==='project')throw Error('PROJECT_TIMEOUT');},
  async inspect(){return {state:'MATCH',detail:[]}}};
 const appendProjector={async apply(){},async inspect(){return {state:'MATCH',count:1}}};
 const service=createVisitCompositionAtomicService20({store,gate,availabilityService,hardGate:()=>{},
  preflight:async()=>preview,projector,appendProjector});
 return {service,preview,stats:()=>({applied,leases,uncertain,locked,mark}),setFail:x=>fail=x};
}
for(const mode of ['TOGETHER','SEPARATELY']){
 const f=testFixture(mode);
 const args={actor:{role:'manager',auditorId:'manager-1'},
  body:{auditId:'source-1',sourceRevision:'rev-1',composition:mode}};
 const result=await f.service.commit(args);
 assert.equal(result.success,true);assert.equal(result.projection,'PROJECTED');
 assert.equal(result.auditIds.length,mode==='TOGETHER'?1:2);
 assert.equal(f.stats().mark,1);assert.equal(f.stats().leases,0);assert.equal(f.stats().locked,false);
 assert.equal((await f.service.commit(args)).idempotent,true);
 const rejected=testFixture(mode);
 rejected.preview.freshAvailabilityProvenance=false;
 await assert.rejects(()=>rejected.service.commit(args),/AUTHORITY_PREFLIGHT_INCOMPLETE/);
 assert.equal(rejected.stats().applied,0);
 if(mode==='SEPARATELY'){
  const malformed=testFixture(mode);
  malformed.preview.visits[0].auditId='client-controlled-id';
  await assert.rejects(()=>malformed.service.commit(args),/SPLIT_IDENTITY_NOT_DETERMINISTIC/);
  assert.equal(malformed.stats().applied,0);
 }
 const drift=testFixture(mode);drift.preview.availabilityVersions['aud-1']=9;
 await assert.rejects(()=>drift.service.commit(args),/AVAILABILITY_VERSION_DRIFT/);
 assert.equal(drift.stats().leases,0);assert.equal(drift.stats().locked,false);
 const projectionFailure=testFixture(mode);projectionFailure.setFail('project');
 await assert.rejects(()=>projectionFailure.service.commit(args),/PROJECT_TIMEOUT/);
 assert.ok(projectionFailure.stats().uncertain>=2);
 assert.equal(projectionFailure.stats().locked,true);
}
console.log('VISIT_COMPOSITION_ATOMIC_SERVICE_20_PASS: Together, Separately, replay, preflight and uncertain recovery fencing');
