import assert from 'node:assert/strict';
import {processEmailAction20} from './notification-email-action-flow-20.mjs';
const audit={auditId:'audit-1',auditorUid:'uid-1',status:'Approved',origin:'MANAGER',revision:'rev-3'};
let writes=0;
const services={
 currentSession:async()=>({uid:'uid-1',role:'AUDITOR',environment:'DEV'}),
 currentAudit:async()=>audit,
 actorCapability:async()=>true,
 executeCanonical:async({actor,expectedRevision,action})=>{
  assert.equal(actor.uid,'uid-1');assert.equal(expectedRevision,'rev-3');
  assert.equal(action,'ACCEPT');writes++;return {ok:true};
 }
};
const request=(method,overrides={},input={})=>processEmailAction20({method,auditId:'audit-1',action:'ACCEPT',environment:'DEV',services:{...services,...overrides},input});
const preview=await request('GET');
assert.equal(preview.ok,true);assert.equal(preview.readOnly,true);assert.equal(writes,0);
assert.deepEqual(await request('POST'),{ok:false,error:'CONFIRMATION_REQUIRED'});
assert.equal(writes,0);
assert.deepEqual(await request('POST',{}, {confirmed:true}),{ok:true});
assert.equal(writes,1);
assert.deepEqual(await request('GET',{currentSession:async()=>null}),{ok:false,error:'AUTHENTICATION_REQUIRED'});
assert.deepEqual(await request('GET',{currentSession:async()=>({uid:'different',role:'AUDITOR',environment:'DEV'})}),{ok:false,error:'FORBIDDEN'});
assert.deepEqual(await request('GET',{actorCapability:async()=>false}),{ok:false,error:'FORBIDDEN'});
assert.deepEqual(await request('GET',{currentSession:async()=>({uid:'uid-1',role:'AUDITOR',environment:'PROD'})}),{ok:false,error:'ENVIRONMENT_MISMATCH'});
assert.deepEqual(await request('GET',{currentAudit:async()=>({...audit,revision:null})}),{ok:false,error:'AUDIT_UNAVAILABLE'});
assert.deepEqual(await request('GET',{currentAudit:async()=>({...audit,status:'Completed'})}),{ok:false,error:'ACTION_NOT_ALLOWED'});
assert.deepEqual(await request('DELETE'),{ok:false,error:'METHOD_NOT_ALLOWED'});
assert.equal(writes,1);
const managerServices={...services,currentSession:async()=>({uid:'manager-1',role:'MANAGER',environment:'DEV'}),executeCanonical:async()=>({ok:true})};
const manager=await processEmailAction20({method:'GET',auditId:'audit-1',action:'APPROVE',environment:'DEV',services:managerServices});
assert.equal(manager.ok,true);
assert.equal(manager.readOnly,true);
assert.equal(writes,1);
console.log('notification-email-action-flow-20: PASS');
