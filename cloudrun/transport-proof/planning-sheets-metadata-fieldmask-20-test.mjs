import assert from 'node:assert/strict';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';
let row=['old'],written=false,metaCalls=0;
const fakeFetch=async(url,options={})=>{
 const u=new URL(url);
 if(u.searchParams.has('fields')){
  metaCalls++;
  assert.equal(u.searchParams.get('fields'),'sheets(properties(sheetId,title,gridProperties(rowCount)))');
  return {ok:true,json:async()=>({sheets:[{properties:{sheetId:7,title:'Audit planning',gridProperties:{rowCount:20}}}]})};
 }
 if(u.pathname.endsWith('/values:batchGet')){assert.equal(u.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');assert.equal(u.searchParams.get('dateTimeRenderOption'),'FORMATTED_STRING');return {ok:true,json:async()=>({valueRanges:[{values:[row]}]})};}
 if(u.pathname.endsWith('/values:batchUpdate')){
  assert.equal(options.method,'POST');
  const data=JSON.parse(options.body);
  assert.deepEqual(data.data[0].values,[['new']]);
  row=['new'];written=true;
  return {ok:true,json:async()=>({responses:[{}]})};
 }
 throw Error('UNEXPECTED_REQUEST_'+u.pathname);
};
const projector=createPlanningSheetsWritesetProjector({spreadsheetId:'dev-only-test',getToken:async()=> 'fake-token',verifyFence:async()=>true,fetchImpl:fakeFetch});
const plan={projectionWrites:[{range:'Audit planning!A2:A2',values:[['new']]}],projectionPreconditions:[{range:'Audit planning!A2:A2',before:['old']}]};
const result=await projector.apply({operationId:'op-test',gateToken:'gate-test',plan});
assert.equal(result.projected,true);
assert.equal(written,true);
assert.equal(metaCalls,1);
assert.equal((await projector.inspect(plan)).state,'MATCH');
console.log('PLANNING_SHEETS_METADATA_PROJECTION_PASS');
