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
 const gate={read:async()=>({holder:{operationId:id,state:'UNCERTAIN'}}),resumeRecovery:async()=>{events.push('resume');return {token:'rotated'};},beginRecovery:async()=>{events.push('begin');return {token:'fence'};},
  finishRecovery:async()=>{events.push('finish');},recordRecoveryFailure:async()=>events.push('failure')};
 const projector={normalizeCommittedTargetHours:async()=>{events.push('normalize-target');return plan;},normalizeLegacySourceHours:async()=>{events.push('normalize');return plan;},
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

test('RECOVERING resume verifies rows before writing only missing appends',async()=>{
 const x=setup();
 x.gate.read=async()=>({holder:{operationId:id,state:'RECOVERING'}});
 x.projector.inspect=async()=>({state:'MATCH'});
 let appended=false;
 x.appendProjector.inspect=async()=>({state:appended?'MATCH':'MISSING'});
 x.appendProjector.apply=async()=>{appended=true;x.events.push('appends');};
 const result=await createVisitCompositionForwardRecovery20(x).commit({operationId:id});
 assert.equal(result.resumed,true);
 assert.deepEqual(x.events,['normalize-target','resume','normalize-target','appends','finish','settle']);
});
test('RECOVERING resume refuses a row conflict without gate takeover or mutation',async()=>{
 const x=setup();
 x.gate.read=async()=>({holder:{operationId:id,state:'RECOVERING'}});
 x.projector.normalizeCommittedTargetHours=async()=>{throw Error('COMPOSITION_TARGET_RECOVERY_RENDER_MISMATCH');};
 await assert.rejects(()=>createVisitCompositionForwardRecovery20(x).commit({operationId:id}),/RENDER_MISMATCH/);
 assert.deepEqual(x.events,[]);
});
test('RECOVERING resume retains fence when append write is uncertain',async()=>{
 const x=setup();
 x.gate.read=async()=>({holder:{operationId:id,state:'RECOVERING'}});
 x.projector.inspect=async()=>({state:'MATCH'});
 x.appendProjector.apply=async()=>{throw Error('network');};
 await assert.rejects(()=>createVisitCompositionForwardRecovery20(x).commit({operationId:id}),/UNCERTAIN_APPENDS/);
 assert.deepEqual(x.events,['normalize-target','resume','normalize-target','failure']);
});

test('PROJECTED receipt retries lease settlement without any Sheets write',async()=>{
 const x=setup();x.entry.state='PROJECTED';
 x.gate.read=async()=>({holder:{operationId:id,state:'UNCERTAIN',uncertainAt:'2026-01-01T00:00:00Z'}});
 x.projector.inspect=async()=>({state:'MATCH'});
 x.appendProjector.inspect=async()=>({state:'MATCH'});
 const result=await createVisitCompositionForwardRecovery20(x).commit({operationId:id});
 assert.equal(result.settlementOnly,true);
 assert.deepEqual(x.events,['normalize-target','settle']);
});
test('PROJECTED receipt refuses settlement when append proof is incomplete',async()=>{
 const x=setup();x.entry.state='PROJECTED';
 x.gate.read=async()=>({holder:{operationId:id,state:'UNCERTAIN',uncertainAt:'2026-01-01T00:00:00Z'}});
 x.appendProjector.inspect=async()=>({state:'MISSING'});
 await assert.rejects(()=>createVisitCompositionForwardRecovery20(x).commit({operationId:id}),/APPENDS_MISSING/);
 assert.deepEqual(x.events,['normalize-target']);
});
