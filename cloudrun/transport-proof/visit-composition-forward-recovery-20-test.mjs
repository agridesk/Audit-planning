import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisitCompositionForwardRecovery20} from './visit-composition-forward-recovery-20.js';
const id='a'.repeat(64);
function setup(){
 const events=[],snapshot={auditId:'source',availabilityLeaseAuditors:['auditor'],projectionWrites:[],appendIntents:[]};
 const entry={operationId:id,action:'VISIT_COMPOSITION_SEPARATELY',state:'UNCERTAIN',multi:true,
  auditId:'source',snapshot,entities:[{auditId:'source',revision:2},{auditId:'successor',revision:1}]};
 const plan=structuredClone(snapshot);
 const store={readOutbox:async()=>entry,readAudit:async auditId=>({pendingOperationId:id,revision:auditId==='source'?2:1})};
 const gate={beginRecovery:async()=>{events.push('begin');return {token:'fence'};},
  finishRecovery:async()=>{events.push('finish');},recordRecoveryFailure:async()=>events.push('failure')};
 const projector={normalizeLegacySourceHours:async()=>{events.push('normalize');return plan;},
  inspect:async()=>({state:'READY'}),apply:async()=>events.push('rows')};
 const appendProjector={inspect:async()=>({state:'MISSING'}),apply:async()=>events.push('appends')};
 const recovery={recoverOne:async(_entry,{normalizedPlan})=>{assert.equal(normalizedPlan,plan);events.push('settle');return {state:'PROJECTED'};}};
 const availabilityService={read:async()=>({planningLease:{auditId:'source',state:'UNCERTAIN',
  token:'lease',uncertainAt:'2026-01-01T00:00:00Z'}})};
 return {events,entry,store,gate,projector,appendProjector,recovery,availabilityService};
}
test('forward recovery never mutates until exclusive fence is held',async()=>{
 const x=setup();let calls=0;
 x.projector.inspect=async()=>({state:++calls===1?'READY':'MATCH'});
 x.appendProjector.inspect=async()=>({state:'MATCH'});
 const result=await createVisitCompositionForwardRecovery20(x).commit({operationId:id});
 assert.equal(result.state,'PROJECTED');
 assert.deepEqual(x.events,['normalize','begin','normalize','rows','appends','finish','settle']);
});
test('source conflict prevents fence and writes',async()=>{
 const x=setup();x.projector.inspect=async()=>({state:'CONFLICT'});
 await assert.rejects(()=>createVisitCompositionForwardRecovery20(x).commit({operationId:id}),
  /SOURCE_CONFLICT/);
 assert.deepEqual(x.events,['normalize']);
});
test('uncertain row write leaves recovery gate locked',async()=>{
 const x=setup();x.projector.apply=async()=>{throw Error('network');};
 await assert.rejects(()=>createVisitCompositionForwardRecovery20(x).commit({operationId:id}),
  /UNCERTAIN_ROWS/);
 assert.deepEqual(x.events,['normalize','begin','normalize','failure']);
});
