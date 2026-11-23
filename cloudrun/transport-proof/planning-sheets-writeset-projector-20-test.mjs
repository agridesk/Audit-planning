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

{
 let rowCount=1,actualPlanning=['Company','','Pending Planning'],actualAvailability=[],mutations=0,unrelated400=false;
 let fillOnExpand=false,fenceChecks=0,failOnFence=0;
 const boundary=createPlanningSheetsWritesetProjector({
  spreadsheetId:'boundary',getToken:async()=> 'mock',verifyFence:async()=>{
   if(++fenceChecks===failOnFence)throw Error('FENCE_LOST');
  },
  fetchImpl:async(url,init={})=>{
   const u=new URL(url),method=init.method||'GET';
   const ok=data=>({ok:true,status:200,json:async()=>structuredClone(data)});
   if(method==='GET'&&u.pathname.endsWith('/values:batchGet')){
    const ranges=u.searchParams.getAll('ranges');
    if(unrelated400||ranges.includes('Auditor Availability!A2:C2')&&rowCount<2)
     return {ok:false,status:400};
    return ok({valueRanges:ranges.map(range=>({values:[range.startsWith('Audit planning!')?actualPlanning:actualAvailability]}))});
   }
   if(method==='GET')return ok({sheets:[
    {properties:{title:'Audit planning',sheetId:1,gridProperties:{rowCount:100}}},
    {properties:{title:'Auditor Availability',sheetId:2,gridProperties:{rowCount}}}
   ]});
   mutations++;
   if(u.pathname.endsWith(':batchUpdate')&&!u.pathname.endsWith('/values:batchUpdate')){
    rowCount+=JSON.parse(init.body).requests[0].appendDimension.length;
    if(fillOnExpand)actualAvailability=['other change'];
   }else{
    for(const item of JSON.parse(init.body).data)
     if(item.range.startsWith('Audit planning!'))actualPlanning=item.values[0];
     else actualAvailability=item.values[0];
   }
   return ok({});
  }
 });
 const opts={allowMissingAvailabilityRows:true};
 await assert.rejects(()=>boundary.inspect(plan),/SHEETS_PROJECTOR_HTTP_400/);
 assert.equal((await boundary.inspect(plan,opts)).state,'READY');
 assert.equal(mutations,0,'Inspection must not expand or write rows');
 const badBefore=structuredClone(plan);
 badBefore.projectionPreconditions[1].before=['unexpected'];
 await assert.rejects(()=>boundary.inspect(badBefore,opts),/SHEETS_PROJECTION_MISSING_ROW_CONFLICT/);
 const wrongSheet=structuredClone(plan);
 wrongSheet.projectionWrites[0].range='Audit planning!A101:C101';
 wrongSheet.projectionPreconditions[0]={range:'Audit planning!A101:C101',before:[]};
 await assert.rejects(()=>boundary.inspect(wrongSheet,opts),/SHEETS_PROJECTION_MISSING_ROW_CONFLICT/);
 actualPlanning=['Company','other auditor','Pending Planning'];
 await assert.rejects(()=>boundary.apply({operationId:'conflict',gateToken:'held',plan,...opts}),/SHEETS_PROJECTION_PRECONDITION_CONFLICT/);
 assert.equal(mutations,0,'A conflicting existing row must not expand the sheet');
 actualPlanning=['Company','','Pending Planning'];
 fenceChecks=0;failOnFence=2;
 await assert.rejects(()=>boundary.apply({operationId:'fence',gateToken:'held',plan,...opts}),/FENCE_LOST/);
 assert.equal(mutations,0,'Fence loss must prevent row expansion');
 fenceChecks=0;failOnFence=0;fillOnExpand=true;
 await assert.rejects(()=>boundary.apply({operationId:'race',gateToken:'held',plan,...opts}),/SHEETS_PROJECTION_CHANGED_DURING_WRITE/);
 assert.equal(mutations,1,'A newly occupied row must not receive values');
 rowCount=1;actualAvailability=[];mutations=0;fillOnExpand=false;
 await boundary.apply({operationId:'boundary',gateToken:'held',plan,...opts});
 assert.equal(rowCount,2);
 assert.equal((await boundary.inspect(plan)).state,'MATCH');
 assert.equal(mutations,2);
 unrelated400=true;
 await assert.rejects(()=>boundary.inspect(plan,opts),/SHEETS_PROJECTOR_HTTP_400/);
}
assert.equal((await projector.inspect(plan)).state,'READY');
const first=await projector.apply({operationId:'operation-7',gateToken:'token-7',plan});
assert.equal(first.projected,true);assert.equal(first.replayed,false);
assert.equal(rows,2);assert.equal(expanded,1);assert.equal(writeCount,1);
assert.equal((await projector.inspect(plan)).state,'MATCH');
const narrowPlan={projectionWrites:[{range:'Audit planning!A2:C2',values:[['Company','auditor@example.test','Accepted']]}],
 projectionPreconditions:[{range:'Audit planning!A2:C2',before:['Company','auditor@example.test','Approved']}]};
let narrowReads=0,returnWriteEvidence=true;
const narrow=createPlanningSheetsWritesetProjector({spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',verifyFence:async()=>{},
 fetchImpl:async(url,init={})=>{
  assert.ok(!new URL(url).pathname.endsWith('/spreadsheets/dev-sheet'),'Existing row projection skips tab metadata');
  if((init.method||'GET')==='POST'){
   const request=JSON.parse(init.body);
   assert.equal(request.valueInputOption,'USER_ENTERED');
   assert.equal(request.includeValuesInResponse,true);
   assert.deepEqual(request.data,[{range:'Audit planning!C2:C2',values:[['Accepted']]}]);
   values.get('Audit planning!A2:C2')[2]='Accepted';
   return {ok:true,json:async()=>returnWriteEvidence?{responses:[{updatedData:{range:"'Audit planning'!C2",values:[['Accepted']]}}]}:{}};
  }
  narrowReads++;
  return fetchImpl(url,init);
 }});
const acceptArgs={operationId:'accept',gateToken:'token',plan:narrowPlan};
const existingRowsProof=await narrow.prepareExistingPlanningRows(acceptArgs);
assert.equal((await narrow.apply({...acceptArgs,changedPlanningCellsOnly:true,existingRowsProof})).verification.state,'MATCH');
assert.equal(narrowReads,1,'The exact Sheets write response is sufficient for the changed cells');
values.get('Audit planning!A2:C2')[2]='Approved';
returnWriteEvidence=false;
const fallbackProof=await narrow.prepareExistingPlanningRows(acceptArgs);
assert.equal((await narrow.apply({...acceptArgs,changedPlanningCellsOnly:true,existingRowsProof:fallbackProof})).verification.state,'MATCH');
assert.equal(narrowReads,3,'Missing evidence triggers a full readback');
values.get('Audit planning!A2:C2')[2]='Approved';
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
let dateValue='2027-06-19', serialValue;
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
   {valueRanges:[{values:[[url.includes('SERIAL_NUMBER')?serialValue:dateValue]]}]}:
   {sheets:[{properties:{title:'Audit_Obligations',sheetId:3,gridProperties:{rowCount:200}}}]}};
 }
});
const extensionPlan={scopeExtension:{},
 projectionWrites:[{range:extensionDate,values:[['2028-06-19']]}],
 projectionPreconditions:[{range:extensionDate,before:['2027-06-19']}]};
assert.equal((await dateProjector.apply({operationId:'ext',gateToken:'held',plan:extensionPlan})).projected,true);
assert.deepEqual(dateWrites,['RAW']);
assert.equal((await dateProjector.inspect(extensionPlan)).state,'MATCH');

dateValue='19/06/2028';
serialValue=(Date.UTC(2028,5,19)-Date.UTC(1899,11,30))/86400000;
const recoveryPlan=await dateProjector.prepareExtensionDateRecovery(extensionPlan);
assert.deepEqual(recoveryPlan.projectionPreconditions[0].before,['19/06/2028']);
serialValue++;
await assert.rejects(dateProjector.prepareExtensionDateRecovery(extensionPlan),/EXT_RECOVERY_SOURCE_CONFLICT/);
serialValue--;
await dateProjector.apply({operationId:'ext',gateToken:'held',plan:recoveryPlan});
assert.equal((await dateProjector.inspect(extensionPlan)).state,'MATCH');

// Lifecycle projections must not re-enter unrelated company data as formulas.
const companyBefore=Array(25).fill('');
companyBefore[0]='Example';
companyBefore[4]='+31-123456789';
companyBefore[18]='Yes';
const companyAfter=[...companyBefore];
companyAfter[18]='No';
let companyRow=[...companyBefore];
const companyWrites=[];
const companyProjector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',verifyFence:async()=>{},
 fetchImpl:async(url,init={})=>{
  const u=new URL(url),method=init.method||'GET';
  if(method==='GET'&&u.pathname.endsWith('/values:batchGet'))
   return {ok:true,json:async()=>({valueRanges:[{values:[companyRow]}]})};
  if(method==='GET')
   return {ok:true,json:async()=>({sheets:[{properties:{title:'Companies',sheetId:4,gridProperties:{rowCount:100}}}]})};
  if(u.pathname.endsWith('/values:batchUpdate')){
   const body=JSON.parse(init.body);
   companyWrites.push(body);
   for(const item of body.data){
    const match=/^Companies!([A-Z]+)84:([A-Z]+)84$/.exec(item.range);
    assert.ok(match);
    const start=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;
    for(let i=0;i<item.values[0].length;i++)companyRow[start+i]=item.values[0][i];
   }
   return {ok:true,json:async()=>({})};
  }
  throw Error('UNEXPECTED_COMPANY_PROJECTOR_HTTP');
 }
});
const companyPlan={projectionWrites:[{range:'Companies!A84:Y84',values:[companyAfter]}],
 projectionPreconditions:[{range:'Companies!A84:Y84',before:companyBefore}]};
await companyProjector.apply({operationId:'reject',gateToken:'held',plan:companyPlan});
assert.equal(companyRow[4],'+31-123456789');
assert.equal(companyRow[18],'No');
assert.deepEqual(companyWrites.map(x=>x.data.map(y=>y.range)),[['Companies!S84:S84']]);
assert.equal((await companyProjector.inspect(companyPlan)).state,'MATCH');
await companyProjector.apply({operationId:'reject',gateToken:'held',plan:companyPlan});
assert.equal(companyWrites.length,1);

companyRow=[...companyBefore];
const multipleAfter=[...companyBefore];
multipleAfter[0]='';
multipleAfter[1]='Inactive';
multipleAfter[18]='No';
const multiplePlan={projectionWrites:[{range:'Companies!A84:Y84',values:[multipleAfter]}],
 projectionPreconditions:[{range:'Companies!A84:Y84',before:companyBefore}]};
await companyProjector.apply({operationId:'reject-2',gateToken:'held',plan:multiplePlan});
assert.deepEqual(companyWrites[1].data.map(x=>x.range),['Companies!A84:B84','Companies!S84:S84']);
assert.equal(companyRow[0],'');
assert.equal(companyRow[4],'+31-123456789');
assert.equal((await companyProjector.inspect(multiplePlan)).state,'MATCH');

companyRow=[...companyBefore,'','before'];
const widerAfter=[...companyBefore,'','after'];
const widerPlan={projectionWrites:[{range:'Companies!A84:AA84',values:[widerAfter]}],
 projectionPreconditions:[{range:'Companies!A84:AA84',before:[...companyRow]}]};
await companyProjector.apply({operationId:'reject-3',gateToken:'held',plan:widerPlan});
assert.deepEqual(companyWrites[2].data.map(x=>x.range),['Companies!AA84:AA84']);
assert.equal(companyRow[4],'+31-123456789');
assert.equal((await companyProjector.inspect(widerPlan)).state,'MATCH');

let firstReadStarted;
const firstRead=new Promise(resolve=>{firstReadStarted=resolve});
let concurrentValue='before',concurrentWrites=0,metadataFailed=false;
const concurrentProjector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',verifyFence:async()=>{},
 fetchImpl:async(url,init={})=>{
  const u=new URL(url),method=init.method||'GET';
  if(method==='GET'&&u.pathname.endsWith('/values:batchGet')){
   firstReadStarted();
   return {ok:true,json:async()=>({valueRanges:[{values:[[concurrentValue]]}]})};
  }
  if(method==='GET'){
   await Promise.race([firstRead,new Promise((_,reject)=>setTimeout(()=>reject(Error('READ_NOT_CONCURRENT')),500))]);
   if(metadataFailed)throw Error('METADATA_UNAVAILABLE');
   return {ok:true,json:async()=>({sheets:[{properties:{title:'Audit planning',sheetId:1,gridProperties:{rowCount:100}}}]})};
  }
  concurrentWrites++;concurrentValue=JSON.parse(init.body).data[0].values[0][0];
  return {ok:true,json:async()=>({})};
 }
});
const concurrentPlan={projectionWrites:[{range:'Audit planning!A2',values:[['after']]}],
 projectionPreconditions:[{range:'Audit planning!A2',before:['before']}]};
assert.equal((await concurrentProjector.apply({operationId:'parallel',gateToken:'held',plan:concurrentPlan,prefetchMetadata:true})).projected,true);
assert.equal(concurrentWrites,1);
metadataFailed=true;
assert.equal((await concurrentProjector.apply({operationId:'replay',gateToken:'held',plan:concurrentPlan,prefetchMetadata:true})).replayed,true,'replay does not depend on unnecessary metadata');
concurrentValue='before';
await assert.rejects(()=>concurrentProjector.apply({operationId:'failure',gateToken:'held',plan:concurrentPlan,prefetchMetadata:true}),/METADATA_UNAVAILABLE/);
assert.equal(concurrentWrites,1,'metadata failure must not write');
