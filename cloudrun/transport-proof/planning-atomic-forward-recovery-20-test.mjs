import assert from 'node:assert/strict';
import {createPlanningAtomicForwardRecovery20} from './planning-atomic-forward-recovery-20.js';
import {readFileSync} from 'node:fs';
const operationId='a'.repeat(64),auditId='audit-safe-1';
const entry={operationId,auditId,action:'PLAN',state:'UNCERTAIN',revision:2,snapshot:{
 projectionWrites:[{range:'Audit planning!A65:B65',values:[['audit-safe-1','Approved']]}],
 projectionPreconditions:[{range:'Audit planning!A65:B65',before:['audit-safe-1','Pending Planning']}],
 appendIntents:[{range:'Notification Queue!A:M',values:[['one'],['two']]}]
}};
function mock({rowState='READY',appendState='MISSING',rowError=false,auditorId=null,leaseMinutes=31,action='PLAN',multi=false}={}){
 const events=[],gate={state:'UNCERTAIN',holder:{operationId,token:'t',state:'UNCERTAIN'}};
 const candidate={...entry,action,multi,auditorId};
 const store={readOutbox:async()=>candidate,readAudit:async()=>({revision:2,pendingOperationId:operationId})};
 const gateApi={
  async read(){return {holder:gate.holder};},
  async beginRecovery({operationId:id}){assert.equal(id,operationId);assert.equal(gate.state,'UNCERTAIN');
   gate.state='RECOVERING';gate.holder.state='RECOVERING';events.push('begin');return {...gate.holder};},
  async recordRecoveryFailure({stage,code}){events.push('failure:'+stage+':'+code);},
  async finishRecovery({operationId:id,token}){assert.equal(id,operationId);assert.equal(token,'t');assert.equal(gate.state,'RECOVERING');
   gate.state='UNCERTAIN';gate.holder.state='UNCERTAIN';events.push('finish');}
 };
 const projector={
  async inspect(_plan,options){if(!events.includes('rowApply'))assert.equal(options?.allowMissingAvailabilityRows,candidate.action==='PLAN');events.push('rowInspect');return {state:rowState};},
  async apply(options){assert.equal(options.allowMissingAvailabilityRows,candidate.action==='PLAN');events.push('rowApply');if(rowError)throw Error('SHEETS_TIMEOUT');rowState='MATCH';}
 };
 const appendProjector={
  async inspect(){events.push('appendInspect');return {state:appendState};},
  async apply(){events.push('appendApply');appendState='MATCH';}
 };
 const recovery={async recoverOne(input){assert.equal(input,candidate);assert.equal(gate.state,'UNCERTAIN');
  assert.equal(rowState,'MATCH');assert.equal(appendState,'MATCH');events.push('settle');return {state:'PROJECTED'};}};
 const availabilityService={async read(){return {planningLease:{auditId,token:'lease',state:'UNCERTAIN',uncertainAt:new Date(Date.now()-leaseMinutes*60000).toISOString()}};}};
 return {service:createPlanningAtomicForwardRecovery20({store,gate:gateApi,projector,appendProjector,recovery,availabilityService}),events,gate};
}
{const x=mock();const outcome=await x.service.commit({operationId});assert.equal(outcome.state,'PROJECTED');
 assert.deepEqual(x.events,['begin','rowInspect','appendInspect','rowApply','rowInspect','appendApply','appendInspect','finish','settle']);}
{const x=mock({action:'CANCEL'});assert.equal((await x.service.commit({operationId})).state,'PROJECTED');
 assert.deepEqual(x.events,['begin','rowInspect','appendInspect','rowApply','rowInspect','appendApply','appendInspect','finish','settle']);}
{const x=mock({action:'CANCEL',multi:true});await assert.rejects(x.service.commit({operationId}),/OUTBOX_UNSUPPORTED/);
 assert.equal(x.events.length,0);}
{const x=mock({rowState:'CONFLICT'});await assert.rejects(x.service.commit({operationId}),/SOURCE_CONFLICT/);
 assert.equal(x.gate.state,'UNCERTAIN');assert.ok(!x.events.includes('rowApply'));assert.ok(!x.events.includes('settle'));}
{const x=mock({auditorId:'auditor-1',leaseMinutes:5});
 await assert.rejects(x.service.commit({operationId}),/LEASE_QUARANTINE_ACTIVE/);
 assert.equal(x.events.length,0);}
{const x=mock({rowError:true});await assert.rejects(x.service.commit({operationId}),/ATOMIC_FORWARD_RECOVERY_OUTCOME_UNCERTAIN_APPLY_ROWS_SHEETS_TIMEOUT/);
 assert.equal(x.gate.state,'RECOVERING');assert.ok(x.events.includes('failure:APPLY_ROWS:SHEETS_TIMEOUT'));assert.ok(!x.events.includes('finish'));assert.ok(!x.events.includes('settle'));}
{const x=mock();await assert.rejects(x.service.commit({operationId:'invalid'}),/ID_INVALID/);
 assert.equal(x.events.length,0);}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const freeze=readFileSync(new URL('./dev-cutover-freeze-20.mjs',import.meta.url),'utf8');
assert.ok(r15.includes("u.pathname==='/api/v1/planning/atomic-forward-recover'"));
assert.ok(r15.includes("u.pathname==='/manager/atomic-forward-recovery'"));
assert.ok(r15.includes("input.confirm!=='RECOVER_VERIFIED_OPERATION'"));
assert.ok(freeze.includes("'/api/v1/planning/atomic-forward-recover'"));
console.log('ATOMIC_FORWARD_RECOVERY_FENCED_PASS');
