import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningAtomicRecovery} from './planning-atomic-recovery-20.js';

const id='a'.repeat(64),now=()=>new Date(Date.now()-3600000).toISOString();
function harness({failLease=false,projected=false}={}){
 let state=projected?'PROJECTED':'UNCERTAIN',gateHeld=true,marked=0,released=0,leases=0;
 const entry={auditId:'source',operationId:id,action:'VISIT_COMPOSITION_SEPARATELY',
  state,multi:true,entities:[{auditId:'source',revision:2},{auditId:'successor',revision:1}],
  snapshot:{auditId:'source',availabilityLeaseAuditors:['auditor1','auditor2'],
   projectionWrites:[{range:'Audit planning!A74:BS74',values:[['target']]}],
   projectionPreconditions:[{range:'Audit planning!A74:BS74',before:['before']}],
   appendIntents:[{range:'Notification Queue!A:M',values:[['intent']]}]}};
 const store={
  async listOutbox(){return {entries:[{...entry,state}],nextPageToken:null};},
  async readAudit(auditId){return {revision:auditId==='source'?2:1,
   pendingOperationId:state==='UNCERTAIN'?id:null,
   lastProjectedOperationId:state==='PROJECTED'?id:null};},
  async markProjected(){assert.equal(state,'UNCERTAIN');state='PROJECTED';marked++;}
 };
 const gate={
  async read(){return {holder:gateHeld?{token:'fence',operationId:id,state:'UNCERTAIN',
   acquiredAt:now(),uncertainAt:now()}:null};},
  async release({token,verified}){assert.equal(token,'fence');assert.equal(verified,true);gateHeld=false;released++;}
 };
 const projector={async inspect(plan){assert.equal(plan.projectionWrites[0].values[0][0],'normalized');return {state:'MATCH',detail:[{target:true}]};}};
 const appendProjector={async inspect(){return {state:'MATCH',count:6};}};
 const availabilityService={
  async read(_actor,auditorId){return {planningLease:{auditId:'source',token:auditorId,
   state:'UNCERTAIN',uncertainAt:now(),acquiredAt:now()}};},
  async reconcilePlanningLease(){if(failLease)throw Error('LEASE_CAS_CONFLICT');leases++;}
 };
 const recovery=createPlanningAtomicRecovery({store,gate,projector,appendProjector,availabilityService});
 const normalizedPlan={...entry.snapshot,projectionWrites:[{range:'Audit planning!A74:BS74',values:[['normalized']]}]};
 return {entry,recovery,normalizedPlan,get:()=>({state,gateHeld,marked,released,leases}),
  stopFailing:()=>{failLease=false;}};
}
test('fully verified composition settles two leases and releases gate once',async()=>{
 const h=harness();
 const result=await h.recovery.recoverOne(h.entry,{normalizedPlan:h.normalizedPlan});
 assert.equal(result.state,'PROJECTED');
 assert.deepEqual(h.get(),{state:'PROJECTED',gateHeld:false,marked:1,released:1,leases:2});
});
test('failed lease CAS leaves gate fenced and PROJECTED receipt recoverable',async()=>{
 const h=harness({failLease:true});
 await assert.rejects(()=>h.recovery.recoverOne(h.entry,{normalizedPlan:h.normalizedPlan}),/LEASE_CAS_CONFLICT/);
 assert.deepEqual(h.get(),{state:'PROJECTED',gateHeld:true,marked:1,released:0,leases:0});
 h.stopFailing();
 const next={...h.entry,state:'PROJECTED'};
 const result=await h.recovery.recoverOne(next,{normalizedPlan:h.normalizedPlan});
 assert.equal(result.state,'PROJECTED');
 assert.deepEqual(h.get(),{state:'PROJECTED',gateHeld:false,marked:1,released:1,leases:2});
});
test('missing or invalid roster never releases gate',async()=>{
 const h=harness();
 const bad={...h.entry,snapshot:{...h.entry.snapshot,availabilityLeaseAuditors:[]}};
 await assert.rejects(()=>h.recovery.recoverOne(bad,{normalizedPlan:{...h.normalizedPlan,availabilityLeaseAuditors:[]}}),/LEASE_METADATA_MISSING/);
 assert.equal(h.get().gateHeld,true);
});
