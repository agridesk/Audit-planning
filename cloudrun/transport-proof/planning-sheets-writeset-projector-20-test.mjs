import assert from 'node:assert/strict';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';
const values=new Map([['Audit planning!A2:C2',['Company','','Pending Planning']],['Auditor Availability!A2:C2',[]]]);
let writeCount=0,expanded=0,checks=0,deny=false,loseFenceAfterWrite=false,rows=1;
const fetchImpl=async(url,init={})=>{
 const method=init.method||'GET',u=new URL(url),p=u.pathname;
 const ok=x=>({ok:true,status:200,async json(){return structuredClone(x)}});
 if(method==='GET'&&p.endsWith('/values:batchGet')){
  return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>({range,values:values.get(range)?.length?[values.get(range)]:[]}))});
 }
 if(method==='GET'&&p.endsWith('/spreadsheets/dev-sheet')){
  return ok({sheets:[{properties:{title:'Audit planning',sheetId:1,gridProperties:{rowCount:100}}},{properties:{title:'Auditor Availability',sheetId:2,gridProperties:{rowCount:rows}}}]});
 }
 if(method==='POST'&&p.endsWith('/spreadsheets/dev-sheet:batchUpdate')){
  const requests=JSON.parse(init.body).requests;
  expanded+=requests.length;rows+=requests[0]?.appendDimension.length||0;
  return ok({});
 }
 if(method==='POST'&&p.endsWith('/values:batchUpdate')){
  writeCount++;
  for(const item of JSON.parse(init.body).data)values.set(item.range,item.values[0]);
  if(loseFenceAfterWrite)deny=true;
  return ok({totalUpdatedRows:2});
 }
 throw Error('UNEXPECTED_PROJECTOR_HTTP '+method+' '+p);
};
const projector=createPlanningSheetsWritesetProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',fetchImpl,verifyFence:async()=>{checks++;if(deny)throw Error('FENCE_LOST')}});
const plan={projectionWrites:[
 {range:'Audit planning!A2:C2',values:[['Company','auditor@example.test','Approved']]},
 {range:'Auditor Availability!A2:C2',values:[['2027-03-01','auditor@example.test','NO']]}
],projectionPreconditions:[
 {range:'Audit planning!A2:C2',before:['Company','','Pending Planning']},
 {range:'Auditor Availability!A2:C2',before:[]}
]};
assert.equal((await projector.inspect(plan)).state,'READY');
const first=await projector.apply({operationId:'operation-7',gateToken:'token-7',plan});
assert.equal(first.projected,true);assert.equal(first.replayed,false);
assert.equal(rows,2);assert.equal(expanded,1);assert.equal(writeCount,1);
assert.equal((await projector.inspect(plan)).state,'MATCH');
const replay=await projector.apply({operationId:'operation-7',gateToken:'token-7',plan});
assert.equal(replay.replayed,true);assert.equal(writeCount,1);
values.set('Audit planning!A2:C2',['Company','someone-else','Accepted']);
assert.equal((await projector.inspect(plan)).state,'CONFLICT');
await assert.rejects(()=>projector.apply({operationId:'operation-8',gateToken:'token-7',plan}),/SHEETS_PROJECTION_PRECONDITION_CONFLICT/);
values.set('Audit planning!A2:C2',['Company','','Pending Planning']);deny=true;
await assert.rejects(()=>projector.apply({operationId:'operation-8',gateToken:'token-7',plan}),/FENCE_LOST/);
assert.equal(writeCount,1);assert.ok(checks>=4);
deny=false;loseFenceAfterWrite=true;
await assert.rejects(()=>projector.apply({operationId:'operation-9',gateToken:'token-9',plan}),/FENCE_LOST/);
assert.equal(writeCount,2);
assert.equal((await projector.inspect(plan)).state,'MATCH');
await assert.rejects(()=>projector.inspect({projectionWrites:[plan.projectionWrites[0],plan.projectionWrites[0]],projectionPreconditions:[plan.projectionPreconditions[0],plan.projectionPreconditions[0]]}),/SHEETS_PROJECTION_DUPLICATE_TARGET/);
let replayChecks=0;
const lostReplay=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',fetchImpl,
 verifyFence:async()=>{if(++replayChecks===2)throw Error('REPLAY_FENCE_LOST');}
});
await assert.rejects(()=>lostReplay.apply({operationId:'late',gateToken:'token',plan}),/REPLAY_FENCE_LOST/);
assert.equal(writeCount,2);
console.log('Sheets writeset projection: raw idempotence, row expansion, replay, conflict and fencing passed');
