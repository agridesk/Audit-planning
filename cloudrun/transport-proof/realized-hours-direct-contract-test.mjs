import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRealizedHoursAtomicService20} from './realized-hours-atomic-service-20.js';
const server=readFileSync(new URL('./server-r12.js',import.meta.url),'utf8');
const client=readFileSync(new URL('./manager-portal.js',import.meta.url),'utf8');
const dockerfile=readFileSync(new URL('./Dockerfile',import.meta.url),'utf8');
assert.match(dockerfile,/^COPY realized-hours-atomic-service-20\.js \.\/$/m,'The Cloud Run image must contain the atomic hours module');
const entry=readFileSync(new URL('../../EntryV5.js',import.meta.url),'utf8');
const route=server.split("u.pathname==='/api/v1/manager/realized-hours-direct'")[1]?.split("u.pathname==='/api/v1/manager/audit'")[0]||'';
assert.ok(route,'route missing');
for(const marker of ['innerSession(req)','ROLE_FORBIDDEN','REALIZED_HOURS_EXPECTED_VALUE_REQUIRED','DIRECT_SHEETS_ATOMIC','STALE_REALIZED_HOURS','REALIZED_HOURS_WRITE_IN_PROGRESS','PROD_REALIZED_HOURS_DIRECT_WRITER_DISABLED'])assert.ok(route.includes(marker),marker);
assert.ok(entry.includes("rawAction==='externalrealizedhours20'"),'GAS bridge missing');
assert.ok(route.includes('updateCells:')&&route.includes("fetch(root+':batchUpdate'"),'restored direct Sheets write missing');
assert.ok(route.includes('appendCells:')&&route.includes('auditTrail'),'atomic audit-trail batch missing');
assert.ok(client.includes('runRealizedHoursDirect(id,q,function(saved)'),'client should consume the durable receipt');
assert.ok(route.indexOf('REALIZED_HOURS_EXPECTED_VALUE_REQUIRED')<route.indexOf("fetch(root+':batchUpdate'"),'must reject missing expected value before write');
assert.ok(client.includes('readGridActionResult20(response,auditId,\'REALIZED_HOURS\',onCommitted)'));
assert.ok(client.includes('Refresh the completed audits before trying again.'));
assert.ok(route.includes('AUDIT_TRAIL_SIGNING_KEY_NOT_CONFIGURED'),'trail signing key must be mandatory');
assert.ok(server.includes("createHmac('sha256',WRITE_KEY)"),'trail must use configured signing key');
assert.ok(!route.includes("WRITE_KEY||'AMS_DEV'"),'hardcoded fallback signing key forbidden');
const events=[];
const atomic=createRealizedHoursAtomicService20({
 store:{readOutbox:async()=>null,readAudit:async()=>({revision:2,removed:true,snapshot:{status:'Completed'}}),
  commitRealizedHours:async input=>{
   assert.deepEqual(input.projectionPlan.projectionWrites,[{range:'Log realized audits!A2:D2',values:[['audit-1','Completed',5.25,'preserved']]}]);
   assert.equal(input.projectionPlan.appendIntents[0].values[0][2],'COMPLETED_HOURS_OVERRIDE');
   events.push('committed');return {replayed:false};
  },markProjected:async()=>events.push('verified')},
 gate:{acquire:async()=>({token:'token'}),release:async()=>events.push('released')},
 projector:{apply:async()=>events.push('archive'),inspect:async()=>({state:'MATCH'})},
 appendProjector:{apply:async()=>events.push('trail'),inspect:async()=>({state:'MATCH',count:1})},
 readLog:async()=>[['Audit ID','Status','Hours dedicated','Other'],['audit-1','Completed',5,'preserved']],
 roster:async()=>[{role:'manager',active:true,email:'manager@example.test'}],signingKey:'test-key'
});
const actor={role:'manager',auditorId:'manager-1',email:'manager@example.test'};
const body={auditId:'audit-1',expectedHoursDedicated:5,hoursDedicated:5.25,requestId:'ad74b1de-173b-4dc7-ab85-4a322d4e0afd'};
const corrected=await atomic.commit({actor,body,onCommitted:receipt=>{assert.equal(receipt.newHoursDedicated,5.25);events.push('receipt');}});
assert.equal(corrected.projection,'PROJECTED');
assert.deepEqual(events,['committed','receipt','archive','trail','verified','released']);
events.length=0;
await assert.rejects(()=>atomic.commit({actor,body:{...body,expectedHoursDedicated:4}}),error=>error.message==='STALE_REALIZED_HOURS'&&error.writeOutcome==='NOT_COMMITTED');
assert.deepEqual(events,['released']);
console.log('PASS: restored DEV direct realized-hours contracts');
