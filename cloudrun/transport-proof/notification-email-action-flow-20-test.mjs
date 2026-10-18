import assert from 'node:assert/strict';
import {createActionToken,hashActionToken} from './notification-email-action-policy-20.mjs';
import {processEmailAction20} from './notification-email-action-flow-20.mjs';

const token=createActionToken(),hash=hashActionToken(token);
const record={tokenHash:hash,auditorUid:'uid-1',auditId:'audit-1',action:'ACCEPT',status:'Approved',origin:'MANAGER',revision:3,environment:'DEV',expiresAt:Date.now()+60000};
const audit={auditId:'audit-1',auditorUid:'uid-1',status:'Approved',revision:3};
let writes=0,lookups=0,consumed=false;
const services={
 currentSession:async()=>({uid:'uid-1',role:'AUDITOR',deviceVerified:true}),
 findByTokenHash:async h=>(++lookups,h===hash&&!consumed?record:null),
 currentAudit:async()=>audit,
 actorCapability:async()=>true,
 executeAtomically:async ({expectedRevision,actor,action,tokenHash})=>{
  assert.equal(expectedRevision,audit.revision);
  assert.equal(actor.uid,'uid-1');
  assert.equal(action,'ACCEPT');
  assert.equal(tokenHash,hash);
  if(consumed)return {ok:false,error:'TOKEN_CONSUMED'};
  consumed=true;writes++;return {ok:true,action:'ACCEPT'};
 }
};
const call=(method,input={},overrides={})=>processEmailAction20({method,token,environment:'DEV',input,services:{...services,...overrides}});
const landing=await call('GET');
assert.equal(landing.ok,true);assert.equal(landing.readOnly,true);assert.equal(writes,0);
assert.deepEqual(await call('POST'),{ok:false,error:'CONFIRMATION_REQUIRED'});
assert.equal(writes,0);
assert.deepEqual(await call('POST',{confirmed:true},{currentSession:async()=>null}),{ok:false,error:'AUTHENTICATION_REQUIRED'});
assert.equal(writes,0);
assert.deepEqual(await call('GET',{}, {actorCapability:async()=>false}),{ok:false,error:'AUTHENTICATION_REQUIRED'});
assert.equal(writes,0);
assert.deepEqual(await call('GET',{}, {currentAudit:async()=>({...audit,revision:4})}),{ok:false,error:'STALE_AUDIT'});
assert.equal(writes,0);
assert.deepEqual(await processEmailAction20({method:'GET',token,environment:'PROD',services}),{ok:false,error:'ENVIRONMENT_MISMATCH'});
assert.equal(writes,0);
assert.deepEqual(await call('POST',{confirmed:true}),{ok:true,action:'ACCEPT'});
assert.equal(writes,1);
assert.deepEqual(await call('POST',{confirmed:true}),{ok:false,error:'ACTION_UNAVAILABLE'});
assert.equal(writes,1);
assert.ok(lookups>=2);
console.log('notification-email-action-flow-20: PASS');
