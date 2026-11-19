import assert from 'node:assert/strict';
import {createPlanningSheetsAppendProjector} from './planning-sheets-append-projector-20.js';

// R1C/R4: partial append, timeout after committed write, duplicate, 429, 503.
// No live Google API or Firestore calls.
const sheets={'Audit_Visit_Obligations':[['Visit_ID','Obligation_ID']], 'Notification Queue':[['Event','Visit_ID']]};
const ids={'Audit_Visit_Obligations':21,'Notification Queue':22};
const notification=(status,visit)=>[status,visit,'','','','','','','','','hash-'+visit];
const intents=[
 {range:'Audit_Visit_Obligations!A:Z',values:[['VIS-A','OB-A'],['VIS-B','OB-B']]},
 {range:'Notification Queue!A:M',values:[notification('SENT_DEV_REDIRECT','VIS-A'),notification('SENT_DEV_REDIRECT','VIS-B')]}
];
let writes=0,failAfterWrite=false,failStatus=0;
const ok=x=>({ok:true,status:200,json:async()=>structuredClone(x)});
const httpError=status=>({ok:false,status,json:async()=>({})});
const fetchImpl=async(url,init={})=>{
 const u=new URL(url),path=decodeURIComponent(u.pathname);
 if(path.endsWith('/values:batchGet')){
  return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>({values:sheets[range.split('!')[0]]}))});
 }
 if(path.endsWith('/spreadsheets/dev-sheet'))return ok({sheets:Object.entries(ids).map(([title,sheetId])=>({properties:{title,sheetId}}))});
 if(path.endsWith(':batchUpdate')){
  if(failStatus)return httpError(failStatus);
  for(const {appendCells:req} of JSON.parse(init.body).requests){
   const sheet=Object.keys(ids).find(k=>ids[k]===req.sheetId);
   assert.ok(sheet);
   for(const item of req.rows){
    sheets[sheet].push(item.values.map(({userEnteredValue:v})=>v.stringValue??v.numberValue??v.boolValue??''));
    writes++;
   }
  }
  if(failAfterWrite){failAfterWrite=false;throw Error('NETWORK_TIMEOUT_AFTER_COMMIT');}
  return ok({replies:[{}]});
 }
 throw Error('UNEXPECTED_HTTP');
};
const projector=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,verifyFence:async()=>{}});
// A legacy partial append exists; the remaining batch commits before a timeout.
sheets['Audit_Visit_Obligations'].push(['VIS-A','OB-A']);
failAfterWrite=true;
await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents}),/NETWORK_TIMEOUT_AFTER_COMMIT/);
assert.equal(writes,3);
assert.equal((await projector.inspect(intents)).missing.length,0);
// Resume must recognize the committed batch without duplicating any row.
assert.equal((await projector.apply({operationId:'op',gateToken:'fence',intents})).confirmed,true);
assert.equal(writes,3);
assert.equal((await projector.inspect(intents)).state,'MATCH');
assert.equal((await projector.apply({operationId:'op',gateToken:'fence',intents})).replayed,true);
assert.equal(writes,3);
// Duplicate stored row is a hard failure.
sheets['Notification Queue'].push(notification('SENT_DEV_REDIRECT','VIS-A'));
await assert.rejects(()=>projector.inspect(intents),/APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT/);
await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents}),/APPEND_NOTIFICATION_LOGICAL_DUPLICATE_PRESENT/);
sheets['Notification Queue'].pop();
// HTTP 429/503 must never be interpreted as a successful append.
for(const status of [429,503]){
 const extra=[{range:'Notification Queue!A:M',values:[notification('PENDING','VIS-C')]}];
 failStatus=status;
 await assert.rejects(()=>projector.apply({operationId:'op',gateToken:'fence',intents:extra}),new RegExp('APPEND_PROJECTOR_HTTP_'+status));
 assert.equal(writes,3);
 failStatus=0;
}
// R4: a full 5000-row scan is not proof of absence; fail closed.
const originalQueue=sheets['Notification Queue'];
sheets['Notification Queue']=[originalQueue[0],...Array.from({length:4999},(_,i)=>['ROW-'+i])];
await assert.rejects(()=>projector.inspect([{range:'Notification Queue!A:M',values:[notification('PENDING','VIS-Z')]}]),/APPEND_PROJECTION_SOURCE_TRUNCATED/);
sheets['Notification Queue']=originalQueue;
// Fence lost after a committed write: recovery may inspect, but must not replay blindly.
let fenceChecks=0,injectFenceFailure=true;
const fenced=createPlanningSheetsAppendProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'token',fetchImpl,
 verifyFence:async()=>{if(injectFenceFailure&&++fenceChecks===3)throw Error('R4_FENCE_LOST');}});
const fenceIntent=[{range:'Notification Queue!A:M',values:[notification('PENDING','VIS-FENCE')]}];
const beforeFence=writes;
await assert.rejects(()=>fenced.apply({operationId:'fence-op',gateToken:'fence',intents:fenceIntent}),/R4_FENCE_LOST/);
assert.equal(writes,beforeFence);
injectFenceFailure=false;
assert.equal((await fenced.apply({operationId:'fence-op',gateToken:'new-fence',intents:fenceIntent})).confirmed,true);
assert.equal(writes,beforeFence+1);
assert.equal((await fenced.apply({operationId:'fence-op',gateToken:'new-fence',intents:fenceIntent})).replayed,true);
assert.equal(writes,beforeFence+1);
console.log('R1C append failure-injection: partial write, timeout, replay, duplicate, 429/503 PASS');
