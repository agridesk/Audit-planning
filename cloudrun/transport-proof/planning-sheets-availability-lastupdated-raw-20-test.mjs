import assert from 'node:assert/strict';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';
const range='Auditor Availability!A1067:M1067';
const before=['2026-11-20','auditor@example.test','YES','','','','','','','','','',''];
const after=[...before];after[2]='NO';after[11]='2026-11-14 20:04:45';
let actual=[...before],userEntered=0,raw=0;
const json=x=>({ok:true,status:200,async json(){return structuredClone(x)}});
const fakeFetch=async(url,opts={})=>{
 const u=new URL(url),path=u.pathname,method=opts.method||'GET';
 if(method==='GET'&&path.endsWith('/values:batchGet'))
  return json({valueRanges:[{range,values:[actual]}]});
 if(method==='GET'&&u.searchParams.has('fields'))
  return json({sheets:[{properties:{title:'Auditor Availability',sheetId:42,gridProperties:{rowCount:1500}}}]});
 if(method==='POST'&&path.endsWith('/values:batchUpdate')){
  const payload=JSON.parse(opts.body);
  if(payload.valueInputOption==='USER_ENTERED'){
   userEntered++;assert.equal(payload.data.length,1);
   actual=[...payload.data[0].values[0]];actual[11]='14-11-2026 20:04:45'; // Sheets converted timestamp
  }else if(payload.valueInputOption==='RAW'){
   raw++;assert.deepEqual(payload.data,[{range:'Auditor Availability!L1067',values:[['2026-11-14 20:04:45']]}]);
   actual[11]=payload.data[0].values[0][0];
  }else throw Error('UNSUPPORTED_INPUT_OPTION');
  return json({totalUpdatedCells:payload.valueInputOption==='RAW'?1:13});
 }
 throw Error('UNEXPECTED_REQUEST '+method+' '+path);
};
const projector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'dev-token',fetchImpl:fakeFetch,
 verifyFence:async()=>true
});
const plan={projectionWrites:[{range,values:[after]}],projectionPreconditions:[{range,before}]};
assert.equal((await projector.inspect(plan)).state,'READY');
assert.equal((await projector.apply({operationId:'operation',gateToken:'token',plan})).projected,true);
assert.equal(userEntered,1);assert.equal(raw,1);
assert.equal((await projector.inspect(plan)).state,'MATCH');
assert.equal((await projector.apply({operationId:'operation',gateToken:'token',plan})).replayed,true);
assert.equal(userEntered,1);assert.equal(raw,1);
console.log('AVAILABILITY_LAST_UPDATED_RAW_PROJECTION_PASS');
