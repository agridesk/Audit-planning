import assert from 'node:assert/strict';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';
const rows={'Notification Queue':[['Stamp','State','Event']], 'Rejected audits':[['Audit ID','Status']]};
let appended=0,fenceChecks=0,deny=false,loseFenceAfterAppend=false;
const ok=result=>({ok:true,status:200,async json(){return structuredClone(result)}});
const fetchImpl=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname),method=init.method||'GET';
 if(method==='GET'&&path.includes('/values/')){
  const range=path.split('/values/')[1],sheet=range.split('!')[0];
  return ok({values:rows[sheet]});
 }
 if(method==='POST'&&path.endsWith(':append')){
  const sheet=path.split('/values/')[1].split('!')[0];
  rows[sheet].push(...JSON.parse(init.body).values);appended++;
  if(loseFenceAfterAppend)deny=true;
  return ok({updates:{updatedRows:1}});
 }
 throw Error('HTTP_FIXTURE_UNKNOWN');
};
const service=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,verifyFence:async()=>{fenceChecks++;if(deny)throw Error('FENCE_LOST')}});
const intents=[{range:'Notification Queue!A:M',values:[['2026-10-29','PENDING','PLANNED','','audit-1','','','','','','hash-1']]}];
assert.equal((await service.inspect(intents)).state,'MISSING');
assert.equal((await service.apply({operationId:'op',gateToken:'token',intents})).confirmed,true);
assert.equal(appended,1);
assert.equal((await service.inspect(intents)).state,'MATCH');
assert.equal((await service.apply({operationId:'op',gateToken:'token',intents})).replayed,true);
assert.equal(appended,1);
deny=true;
await assert.rejects(()=>service.apply({operationId:'op2',gateToken:'token',intents:[{range:'Rejected audits!A:Z',values:[['audit-2','Rejected']]}]}),/FENCE_LOST/);
assert.equal(appended,1);
await assert.rejects(()=>service.inspect([{range:'Unsafe!A:Z',values:[['x']]}]),/APPEND_INTENT_UNSUPPORTED/);
assert.ok(fenceChecks>=3);
deny=false;loseFenceAfterAppend=true;
await assert.rejects(()=>service.apply({operationId:'op3',gateToken:'token',intents:[{range:'Rejected audits!A:Z',values:[['audit-3','Rejected']]}]}),/FENCE_LOST/);
assert.equal(appended,2);
assert.equal((await service.inspect([{range:'Rejected audits!A:Z',values:[['audit-3','Rejected']]}])).state,'MATCH');

await assert.rejects(()=>service.inspect([
 {range:'Notification Queue!A:C',values:[['event-a']]},
 {range:'Notification Queue!A:M',values:[['event-b']]}
]),/APPEND_INTENT_MIXED_RANGES/);
console.log('Append projector: dedupe, replay, fence and unsupported-target guards passed');
