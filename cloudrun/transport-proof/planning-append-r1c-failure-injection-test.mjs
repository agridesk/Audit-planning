import assert from 'node:assert/strict';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';

// R1C/R4: partial append, timeout after committed write, duplicate, 429, 503.
// No live Google API or Firestore calls.
const sheets={'Audit_Visit_Obligations':[['Visit_ID','Obligation_ID']], 'Notification Queue':[['Event','Visit_ID']]};
const ids={'Audit_Visit_Obligations':21,'Notification Queue':22};
const intents=[
 {range:'Audit_Visit_Obligations!A:Z',values:[['VIS-A','OB-A'],['VIS-B','OB-B']]},
 {range:'Notification Queue!A:M',values:[['SENT_DEV_REDIRECT','VIS-A'],['SENT_DEV_REDIRECT','VIS-B']]}
];
let writes=0,failAfterWrite=false,failStatus=0;
const ok=x=>({ok:true,status:200,json:async()=>structuredClone(x)});
const httpError=status=>({ok:false,status,json:async()=>({})});
const fetchImpl=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname);
 if(path.includes('/values/')){
  const sheet=path.split('/values/')[1].split('!')[0];
  return ok({values:sheets[sheet]});
 }
 if(path.endsWith('/spreadsheets/dev-sheet'))return ok({sheets:Object.entries(ids).map(([title,sheetId])=>({properties:{title,sheetId}}))});
 if(path.endsWith(':batchUpdate')){
  if(failStatus)return httpError(failStatus);
  const req=JSON.parse(init.body).requests[0].appendCells;
  const sheet=Object.keys(ids).find(k=>ids[k]===req.sheetId);
  assert.ok(sheet);
  for(const item of req.rows){
   sheets[sheet].push(item.values.map(({userEnteredValue:v})=>v.stringValue??v.numberValue??v.boolValue??''));
   writes++;
  }
  if(failAfterWrite){failAfterWrite=false;throw Error('NETWORK_TIMEOUT_AFTER_COMMIT');}
  return ok({replies:[{}]});
 }
 throw Error('UNEXPECTED_HTTP');
};
const projector=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,verifyFence:async()=>{}});
// One row committed before an ambiguous transport failure.
failAfterWrite=true;
await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents}),/NETWORK_TIMEOUT_AFTER_COMMIT/);
assert.equal(writes,1);
assert.equal((await projector.inspect(intents)).missing.length,3);
// Resume must append only the remaining three, not duplicate the first.
assert.equal((await projector.apply({operationId:'op',gateToken:'fence',intents})).confirmed,true);
assert.equal(writes,4);
assert.equal((await projector.inspect(intents)).state,'MATCH');
assert.equal((await projector.apply({operationId:'op',gateToken:'fence',intents})).replayed,true);
assert.equal(writes,4);
// Duplicate stored row is a hard failure.
sheets['Notification Queue'].push(['SENT_DEV_REDIRECT','VIS-A']);
await assert.rejects(()=>projector.inspect(intents),/APPEND_PROJECTION_DUPLICATE_ALREADY_PRESENT/);
await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents}),/APPEND_PROJECTION_DUPLICATE_ALREADY_PRESENT/);
sheets['Notification Queue'].pop();
// HTTP 429/503 must never be interpreted as a successful append.
for(const status of [429,503]){
 const extra=[{range:'Notification Queue!A:M',values:[['PENDING','VIS-C']]}];
 failStatus=status;
 await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents:extra}),new RegExp('APPEND_PROJECTOR_HTTP_'+status));
 assert.equal(writes,4);
 failStatus=0;
}
// R4: a full 5000-row scan is not proof of absence; fail closed.
const originalQueue=sheets['Notification Queue'];
sheets['Notification Queue']=[originalQueue[0],...Array.from({length:4999},(_,i)=>['ROW-'+i])];
await assert.rejects(()=>projector.inspect([{range:'Notification Queue!A:M',values:[['PENDING','VIS-Z']]}]),/APPEND_PROJECTION_SOURCE_TRUNCATED/);
sheets['Notification Queue']=originalQueue;
// Fence lost after a committed write: recovery may inspect, but must not replay blindly.
let fenceChecks=0,injectFenceFailure=true;
const fenced=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,
 verifyFence:async()=>{if(injectFenceFailure&&++fenceChecks===3)throw Error('R4_FENCE_LOST');}});
const fenceIntent=[{range:'Notification Queue!A:M',values:[['PENDING','VIS-FENCE']]}];
const beforeFence=writes;
await assert.rejects(()=>fenced.apply({operationId:'fence-op',gateToken:'fence',intents:fenceIntent}),/R4_FENCE_LOST/);
assert.equal(writes,beforeFence);
injectFenceFailure=false;
assert.equal((await fenced.apply({operationId:'fence-op',gateToken:'new-fence',intents:fenceIntent})).confirmed,true);
assert.equal(writes,beforeFence+1);
assert.equal((await fenced.apply({operationId:'fence-op',gateToken:'new-fence',intents:fenceIntent})).replayed,true);
assert.equal(writes,beforeFence+1);
console.log('R1C append failure-injection: partial write, timeout, replay, duplicate, 429/503 PASS');
