import assert from 'node:assert/strict';
import {createAtomicSelfPlanningService20} from './planning-atomic-self-planning-service-20.js';
import {readFileSync} from 'node:fs';
const row=['audit-1','Pending Planning','No'];
const headers=['Audit ID','Status','Allow self planning'];
const before={auditId:'audit-1',revision:7,pendingOperationId:null,
 claimIds:[],blocks:[],snapshot:{auditId:'audit-1',status:'Pending Planning',
 sourceRevision:'rev-before',headers,row,managerCommentLast:'preserve this comment'}};
const after=['audit-1','Pending Planning','Yes'];
const proof={success:true,authorityPreflight:true,auditId:'audit-1',allowSelfPlanning:true,
 expectedSourceRevision:'rev-before',
 canonicalSnapshot:{auditId:'audit-1',status:'Pending Planning',
 sourceRevision:'rev-after',headers,row:after,sourceRow:2},
 projectionWrites:[{range:'Audit planning!A2:C2',values:[after]}],
 projectionPreconditions:[{range:'Audit planning!A2:C2',before:row}],
 appendIntents:[]};
const actor={role:'manager',auditorId:'manager-1'};
const body={auditId:'audit-1',expectedRevision:'rev-before',
 expectedAllowSelfPlanning:false,allowSelfPlanning:true};
function mock({preview=proof,old=before,inspection='MATCH',outbox=null}={}){
 const events=[];
 const service=createAtomicSelfPlanningService20({
  store:{
   readAudit:async()=>{events.push('readAudit');return old},
   readOutbox:async()=>outbox,
   commit:async args=>{events.push('firestoreCommit');assert.equal(args.nextSnapshot.managerCommentLast,'preserve this comment');assert.equal(args.action,'SELF_PLANNING');
    assert.deepEqual(args.blocks,[]);assert.equal(args.expectedRevision,7);return{revision:8}},
   markProjected:async()=>events.push('markProjected'),
   markUncertain:async()=>events.push('markUncertain')
  },
  gate:{
   acquire:async()=>{events.push('gateAcquire');return{token:'token-1'}},
   release:async()=>events.push('gateRelease'),
   uncertain:async()=>events.push('gateUncertain')
  },
  preflight:async()=>{events.push('preflight');return preview},
  projector:{
   apply:async()=>events.push('projectorApply'),
   inspect:async()=>{events.push('projectorInspect');return{state:inspection,detail:{matched:true}}}
  }
 });
 return {service,events};
}
{
 const {service,events}=mock(),out=await service.commit({actor,body});
 assert.equal(out.success,true);assert.equal(out.projection,'PROJECTED');
 assert.deepEqual(events,['gateAcquire','readAudit','preflight','firestoreCommit',
  'projectorApply','projectorInspect','markProjected','gateRelease']);
}
{
 const {service,events}=mock({preview:{...proof,projectionPreconditions:[{
  range:'Audit planning!A2:C2',before:['audit-1','Pending Planning','Yes']}]}});
 await assert.rejects(service.commit({actor,body}),/PREFLIGHT_NOT_AUTHORITATIVE/);
 assert.ok(!events.includes('firestoreCommit'));assert.ok(events.includes('gateRelease'));
}
{
 const {service,events}=mock({inspection:'MISMATCH'});
 await assert.rejects(service.commit({actor,body}),/PROJECTION_NOT_VERIFIED/);
 assert.ok(events.includes('markUncertain'));assert.ok(events.includes('gateUncertain'));
 assert.ok(!events.includes('markProjected'));
}
{
 const {service,events}=mock({outbox:{auditId:'audit-1',actorId:'manager-1',state:'PROJECTED'}});
 const out=await service.commit({actor,body});
 assert.equal(out.idempotent,true);assert.equal(events.length,0);
}
{
 const {service,events}=mock();
 await assert.rejects(service.commit({actor:{...actor,role:'auditor'},body}),/INPUT_INVALID/);
 assert.equal(events.length,0);
}
{
 const {service,events}=mock();
 const noChange={...body,allowSelfPlanning:false};
 const out=await service.commit({actor,body:noChange});
 assert.equal(out.unchanged,true);assert.ok(!events.includes('firestoreCommit'));
}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const r4=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
assert.ok(r15.includes("u.pathname==='/api/v1/manager/self-planning-direct'&&planningAtomicSelfPlanning"));
assert.ok(r4.includes("owner:'CLOUD_RUN_DEV_SELF_PLANNING_ATOMIC_PREFLIGHT'"));
assert.ok(r4.includes("function selfPlanningAtomicReadOnlyPreflight20(cfg,body)"));
assert.ok(r4.includes("const atomicPreflight=selfPlanningAtomicReadOnlyPreflight20(cfg,body)"));
assert.ok(r4.includes("SELF_PLANNING_ATOMIC_LEGACY_WRITERS_NOT_FROZEN"));
assert.ok(r4.includes("SELF_PLANNING_LEGACY_WRITER_FROZEN"));
assert.ok(r4.includes("if(atomicPreflight){"));
assert.ok(r4.includes("const values=atomicPreflight?await readCanonicalPlanningRowsForAtomic20():result[0]?.values||[]"),
 'Self planning must compare the same formatted row and header as R15 backfill');
assert.ok(r4.includes("encodeURIComponent('Audit planning!A1:BW2000')"),
 'Canonical atomic snapshot range must match R15');

console.log('Issue #87 atomic Self planning: commit / CAS / uncertain / replay / no-op PASS');
