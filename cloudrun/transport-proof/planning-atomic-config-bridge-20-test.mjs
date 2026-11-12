import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicConfigurationBridge20,atomicConfigurationRoutes20} from './planning-atomic-config-bridge-20.js';
const route='/api/v1/manager/company-management/save';
function fixture({failForward=false,mismatch=false,rejected=false,conflict=false,partialConflict=false,partialUnrelatedConflict=false}={}){
 const events=[];let value='Before',region='North';
 const bridge=createAtomicConfigurationBridge20({
  gate:{
   acquire:async()=>{events.push('lock');return{token:'token'}},
   release:async()=>events.push('release'),
   uncertain:async()=>events.push('uncertain')
  },
  readRows:async tab=>{
   events.push('read');assert.equal(tab,'Companies');
   return [['Company_UID','Comments','Region'],['company-1',mismatch?'Before':value,region]];
  },
  forward:async()=>{
   events.push('forward');if(failForward)throw Error('TRANSPORT_UNCERTAIN');
   if(rejected)return {status:400,payload:{ok:false,error:'INVALID_CHANGE_VALUE'}};
   if(conflict){if(partialConflict)value='Partial';if(partialUnrelatedConflict)region='South';return {status:409,payload:{ok:false,error:'STALE_COMPANY_FIELD'}};}
   value='After';return {status:200,payload:{ok:true,updated:1}};
  }
 });
 return {bridge,events};
}
const actor={role:'manager',auditorId:'manager-1'};
const body={companyUid:'company-1',changes:{Comments:{expected:'Before',value:'After'}}};
{
 const {bridge,events}=fixture();
 const response=await bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'});
 assert.equal(response.status,200);assert.equal(response.payload.updated,1);
 assert.deepEqual(events,['lock','read','forward','read','release']);
}
{
 const {bridge,events}=fixture({rejected:true});
 const outcome=await bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'});
 assert.equal(outcome.status,400);
 assert.equal(outcome.payload.error,'INVALID_CHANGE_VALUE');
 assert.deepEqual(events,['lock','read','forward','read','release']);
}
{
 const {bridge,events}=fixture({conflict:true});
 const result=await bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'});
 assert.equal(result.status,409);
 assert.deepEqual(events,['lock','read','forward','read','release']);
}
{
 const {bridge,events}=fixture({conflict:true,partialConflict:true});
 await assert.rejects(bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'}),
 /INNER_WRITE_UNCONFIRMED/);
 assert.deepEqual(events,['lock','read','forward','read','uncertain']);
}
{
 const {bridge,events}=fixture({conflict:true,partialUnrelatedConflict:true});
 await assert.rejects(bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'}),
 /INNER_WRITE_UNCONFIRMED/);
 assert.deepEqual(events,['lock','read','forward','read','uncertain']);
}
{
 const {bridge,events}=fixture({failForward:true});
 await assert.rejects(bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'}),/TRANSPORT_UNCERTAIN/);
 assert.deepEqual(events,['lock','read','forward','uncertain']);
}
{
 const {bridge,events}=fixture({mismatch:true});
 await assert.rejects(bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'}),/READBACK_MISMATCH/);
 assert.deepEqual(events,['lock','read','forward','read','uncertain']);
}
{
 const {bridge,events}=fixture();
 await assert.rejects(bridge.commit({actor,path:route,
  body:{companyUid:'company-1',changes:{'Planning JSON':{expected:'x',value:'y'}}},
  cookie:'sid=abc',origin:'https://dev.example'}),/FIELD_UNSUPPORTED/);
 assert.equal(events.length,0);
}
{
 const {bridge,events}=fixture();
 await assert.rejects(bridge.commit({actor:{role:'auditor',auditorId:'id'},path:route,body,
  cookie:'sid=abc',origin:'https://dev.example'}),/MANAGER_REQUIRED/);
 assert.equal(events.length,0);
}
{
 const {bridge,events}=fixture();
 await assert.rejects(bridge.commit({actor,path:route,
  body:{companyUid:'company-1',changes:{Comments:{expected:'Stale',value:'After'}}},
  cookie:'sid=abc',origin:'https://dev.example'}),/STALE_EXPECTED/);
 assert.deepEqual(events,['lock','read','release']);
}
{
 const events=[];let current='Before';
 const bridge=createAtomicConfigurationBridge20({
  gate:{acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),uncertain:async()=>events.push('uncertain')},
  readRows:async()=>{events.push('read');return [['Company_UID','Comments'],['company-1',current]]},
  forward:async()=>{events.push('forward');current='Partial';return {status:400,payload:{ok:false,error:'INVALID_CHANGE_VALUE'}}}
 });
 await assert.rejects(bridge.commit({actor,path:route,body,cookie:'sid=abc',origin:'https://dev.example'}),/INNER_WRITE_UNCONFIRMED/);
 assert.deepEqual(events,['lock','read','forward','read','uncertain']);
}
assert.equal(atomicConfigurationRoutes20.length,6);
assert.ok(atomicConfigurationRoutes20.includes('/api/v1/auditor/company-management/save'));
{
 const events=[],auditorRoute='/api/v1/auditor/company-management/save';
 const auditorBridge=createAtomicConfigurationBridge20({
  gate:{acquire:async()=>({token:'a'}),release:async()=>events.push('release'),uncertain:async()=>events.push('uncertain')},
  readRows:async()=>[['Company_UID','Auditor comments'],['company-1',events.includes('forward')?'Updated':'Original']],
  forward:async()=>{events.push('forward');return {status:200,payload:{ok:true,updated:1}}}
 });
 const result=await auditorBridge.commit({
  actor:{role:'auditor',auditorId:'auditor-1'},path:auditorRoute,
  body:{companyUid:'company-1',changes:{'Auditor comments':{expected:'Original',value:'Updated'}}},
  cookie:'sid=abc',origin:'https://dev.example'
 });
 assert.equal(result.status,200);
 assert.deepEqual(events,['forward','release']);
 await assert.rejects(auditorBridge.commit({
  actor:{role:'auditor',auditorId:'auditor-1'},path:auditorRoute,
  body:{companyUid:'company-1',changes:{Region:{expected:'old',value:'new'}}},
  cookie:'sid=abc',origin:'https://dev.example'
 }),/AUDITOR_FIELD_FORBIDDEN/);
}

// Both auditor governance mutations share the same fenced Auditors row owner.
for(const scenario of [
 {path:'/api/v1/manager/auditor-management/role/save',
  body:{email:'auditor@example.com',role:'Auditor',expected:'Manager'},
  field:'Role',start:'Manager',end:'Auditor'},
 {path:'/api/v1/manager/auditor-management/active/save',
  body:{email:'auditor@example.com',active:false,expected:true},
  field:'Active',start:'Yes',end:'No'}
]){
 const events=[];let current=scenario.start;
 const bridge=createAtomicConfigurationBridge20({
  gate:{acquire:async()=>{events.push('lock');return {token:'t'}},
   release:async()=>events.push('release'),uncertain:async()=>events.push('uncertain')},
  readRows:async tab=>{
   assert.equal(tab,'Auditors');events.push('read');
   return [['E-mail',scenario.field],['auditor@example.com',current]];
  },
  forward:async()=>{events.push('forward');current=scenario.end;
   return {status:200,payload:{ok:true,updated:1}}}
 });
 const result=await bridge.commit({actor,path:scenario.path,body:scenario.body,
  cookie:'sid=abc',origin:'https://dev.example'});
 assert.equal(result.status,200);
 assert.deepEqual(events,['lock','read','forward','read','release']);
 const rejected={...scenario.body,expected:scenario.field==='Role'?'Manager':false};
 if(scenario.field==='Active'){
  await assert.rejects(bridge.commit({actor,path:scenario.path,body:rejected,
   cookie:'sid=abc',origin:'https://dev.example'}),/STALE_EXPECTED/);
 }
}
{
 const {bridge,events}=fixture();
 await assert.rejects(bridge.commit({actor,path:'/api/v1/manager/auditor-management/profile/save',
  body:{email:'auditor@example.com',changes:{Role:{expected:'Auditor',value:'Manager'}}},
  cookie:'sid=abc',origin:'https://dev.example'}),/PRIVILEGED_AUDITOR_FIELD_FORBIDDEN/);
 assert.deepEqual(events,[]);
}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.ok(r15.includes('planningAtomicConfigBridge&&atomicConfigurationRoutes20.includes(u.pathname)'));
assert.ok(r15.includes('planningAtomicConfigBridge.commit({actor,path:u.pathname,body'));
assert.ok(r15.includes('res.writeHead(result.status,'),'HTTP error status must be preserved');
// Guard that both additional manager configuration mutations are fenced
// at the live R15 entrypoint, not just via helper-only tests.
const eventStart=r15.indexOf('async function notificationEventMutation');
const cbStart=r15.indexOf('async function notificationCbSettingMutation');
const proxyStart=r15.indexOf('async function proxy');
assert.ok(eventStart>0&&cbStart>eventStart&&proxyStart>cbStart);
const eventSrc=r15.slice(eventStart,cbStart),cbSrc=r15.slice(cbStart,proxyStart);
for(const source of [eventSrc,cbSrc]){
 assert.match(source,/planningGlobalGate\.acquire/);
 assert.match(source,/planningGlobalGate\.uncertain/);
 assert.match(source,/planningGlobalGate\.release/);
 assert.match(source,/ReadbackVerified=true/);
 assert.ok(source.indexOf('planningGlobalGate.acquire')<source.indexOf("method:'POST'")||
  source.indexOf('planningGlobalGate.acquire')<source.indexOf('notificationGasCall(actor,\'updateEvent\''));
}
assert.match(eventSrc,/NOTIFICATION_EVENT_READBACK_MISMATCH/);
assert.match(cbSrc,/CB_SETTING_EMAIL_VERIFICATION_READBACK_FAILED/);
console.log('Atomic metadata: 6 routes serialized, actor permissions, stale CAS and readback PASS');
