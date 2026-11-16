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
await assert.rejects(()=>projector.inspect({
 projectionWrites:[plan.projectionWrites[0],{range:'Audit planning!B2:D2',values:[['x','y','z']]}],
 projectionPreconditions:[plan.projectionPreconditions[0],{range:'Audit planning!B2:D2',before:['a','b','c']}]
}),/SHEETS_PROJECTION_OVERLAPPING_TARGET/);
await assert.rejects(()=>projector.inspect({
 projectionWrites:[{range:'Audit planning!A1:C1',values:[['x','y','z']]}],
 projectionPreconditions:[{range:'Audit planning!A1:C1',before:['a','b','c']}]
}),/SHEETS_PROJECTION_RANGE_INVALID/);
await assert.rejects(()=>projector.inspect({
 projectionWrites:[{range:'Audit planning!A2:C2',values:[['1','2','3','4']]}],
 projectionPreconditions:[{range:'Audit planning!A2:C2',before:['1','2','3']}]
}),/SHEETS_PROJECTION_RANGE_INVALID/);
// Read-only forensic comparison returns column positions, never cell contents.
values.set('Audit planning!A2:C2',['Company','alternate-auditor','Approved']);
const diagnostic=await projector.inspectDiff(plan);
assert.equal(diagnostic[0].range,'Audit planning!A2:C2');
assert.equal(diagnostic[0].differingCount,1);
assert.equal(diagnostic[0].differing[0].column,2);
assert.ok(!JSON.stringify(diagnostic).includes('alternate-auditor'));
assert.ok(!JSON.stringify(diagnostic).includes('auditor@example.test'));

// Single-cell AD7 recovery is a valid fenced write set, including replay.
deny=false;loseFenceAfterWrite=false;
values.set('Audit planning!AD7',['No']);
const toggle={projectionWrites:[{range:'Audit planning!AD7',values:[['Yes']]}],
 projectionPreconditions:[{range:'Audit planning!AD7',before:['No']}]};
assert.equal((await projector.inspect(toggle)).state,'READY');
assert.equal((await projector.inspectDiff(toggle))[0].differing[0].column,1);
const beforeToggleWrites=writeCount;
await projector.apply({operationId:'self-planning-rescue',gateToken:'token-rescue',plan:toggle});
assert.equal(values.get('Audit planning!AD7')[0],'Yes');
assert.equal((await projector.inspect(toggle)).state,'MATCH');
await projector.apply({operationId:'self-planning-rescue',gateToken:'token-rescue',plan:toggle});
assert.equal(writeCount,beforeToggleWrites+1);
await assert.rejects(()=>projector.inspect({
 projectionWrites:[{range:'Audit planning!AD7',values:[['Yes','unexpected']]}],
 projectionPreconditions:[{range:'Audit planning!AD7',before:['No']}]
}),/SHEETS_PROJECTION_RANGE_INVALID/);
// Read-only render parity must expose only column positions and match flags.
const rendered=await projector.inspectRenderParity(plan);
assert.equal(rendered.detail.length,2);
assert.equal(typeof rendered.allFormattedBefore,'boolean');
assert.ok(!JSON.stringify(rendered).includes('auditor@example.test'));
assert.ok(!JSON.stringify(rendered).includes('alternate-auditor'));
console.log('Sheets writeset projection: raw idempotence, row expansion, replay, conflict and fencing passed');

const extensionDate='Audit_Obligations!K151:K151';
let dateValue='2027-06-19';
const dateWrites=[];
const dateProjector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',verifyFence:async()=>{},
 fetchImpl:async(url,init={})=>{
  const payload=init.body&&JSON.parse(init.body);
  if(payload){
   dateWrites.push(payload.valueInputOption);
   dateValue=payload.valueInputOption==='RAW'?payload.data[0].values[0][0]:'19/06/2028';
  }
  return {ok:true,json:async()=>url.includes('values:batchGet')?
   {valueRanges:[{values:[[dateValue]]}]}:
   {sheets:[{properties:{title:'Audit_Obligations',sheetId:3,gridProperties:{rowCount:200}}}]}};
 }
});
const extensionPlan={scopeExtension:{},
 projectionWrites:[{range:extensionDate,values:[['2028-06-19']]}],
 projectionPreconditions:[{range:extensionDate,before:['2027-06-19']}]};
assert.equal((await dateProjector.apply({operationId:'ext',gateToken:'held',plan:extensionPlan})).projected,true);
assert.deepEqual(dateWrites,['RAW']);
assert.equal((await dateProjector.inspect(extensionPlan)).state,'MATCH');
