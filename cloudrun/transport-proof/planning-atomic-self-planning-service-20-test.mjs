import assert from 'node:assert/strict';
import {createAtomicSelfPlanningService20} from './planning-atomic-self-planning-service-20.js';
import {readFileSync} from 'node:fs';
const row=Array(30).fill('');row[0]='audit-1';row[1]='Pending Planning';row[18]='8,00';row[29]='No';
const headers=Array.from({length:30},(_,i)=>i===29?'Allow self planning':i===18?'Total audit time in hours':i===0?'Audit ID':i===1?'Status':'Column '+i);
const before={auditId:'audit-1',revision:7,pendingOperationId:null,
 claimIds:[],blocks:[],snapshot:{auditId:'audit-1',status:'Pending Planning',
 sourceRevision:'rev-before',headers,row,managerCommentLast:'preserve this comment'}};
const after=[...row];after[29]='Yes';
const proof={success:true,authorityPreflight:true,auditId:'audit-1',allowSelfPlanning:true,
 expectedSourceRevision:'rev-before',
 canonicalSnapshot:{auditId:'audit-1',status:'Pending Planning',
 sourceRevision:'rev-after',headers,row:after,sourceRow:2},
 projectionWrites:[{range:'Audit planning!AD2',values:[['Yes']]}],
 projectionPreconditions:[{range:'Audit planning!AD2',before:['No']}],
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
    assert.deepEqual(args.blocks,[]);assert.equal(args.expectedRevision,7);
    assert.equal(args.nextSnapshot.row[18],old.snapshot.row[18]);return{revision:8}},
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
 const trailingBlankHeader={...proof,canonicalSnapshot:{...proof.canonicalSnapshot,headers:[...proof.canonicalSnapshot.headers,'','']}};
 const {service,events}=mock({preview:trailingBlankHeader});
 const result=await service.commit({actor,body});
 assert.equal(result.success,true);
 assert.ok(events.includes('firestoreCommit'));
}
{
 const spacedHeader={...proof,canonicalSnapshot:{...proof.canonicalSnapshot,headers:proof.canonicalSnapshot.headers.map((x,i)=>i===0?' Audit ID ':i===29?'Allow self planning ':x)}};
 const {service,events}=mock({preview:spacedHeader});
 const result=await service.commit({actor,body});
 assert.equal(result.success,true);
 assert.ok(events.includes('firestoreCommit'));
}
{
 const paddedOld={...before,snapshot:{...before.snapshot,row:[...row,'','','']}};
 const {service,events}=mock({old:paddedOld});
 const result=await service.commit({actor,body});
 assert.equal(result.success,true);
 assert.ok(events.includes('firestoreCommit'));
}
{
 const {service,events}=mock({preview:{...proof,projectionPreconditions:[{
  range:'Audit planning!AD2',before:['Yes']}]}});
 await assert.rejects(service.commit({actor,body}),/PREFLIGHT_CELL_CONTRACT_INVALID/);
 assert.ok(!events.includes('firestoreCommit'));assert.ok(events.includes('gateRelease'));
}
{
 const numericRow=row.slice();numericRow[18]=8;
 const old={...before,snapshot:{...before.snapshot,row:numericRow}};
 const {service,events}=mock({old,preview:{...proof,sourceUnformattedRow:numericRow}});
 assert.equal((await service.commit({actor,body})).projection,'PROJECTED');
 assert.ok(events.includes('firestoreCommit'));
}
{
 const differentRow=row.slice();differentRow[18]=9;
 const old={...before,snapshot:{...before.snapshot,row:differentRow}};
 const {service,events}=mock({old,preview:{...proof,sourceUnformattedRow:row}});
 await assert.rejects(service.commit({actor,body}),/PREFLIGHT_SOURCE_ROW_MISMATCH/);
 assert.ok(!events.includes('firestoreCommit'));
 assert.ok(events.includes('gateRelease'));
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
assert.ok(r4.includes("projectionWrites:[{range:targetRange,values:[[updated[index]]]}]"));
assert.ok(r4.includes("const values=atomicPreflight?formattedRows:result[0]?.values||[]"),
 'Self planning must compare the same formatted row and header as R15 backfill');
assert.ok(r4.includes("encodeURIComponent('Audit planning!A1:BW2000')"),
 'Canonical atomic snapshot range must match R15');

console.log('Issue #87 atomic Self planning: commit / CAS / uncertain / replay / no-op PASS');
