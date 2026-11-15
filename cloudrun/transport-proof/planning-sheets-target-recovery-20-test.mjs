import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlanningSheetsWritesetProjector} from './planning-sheets-writeset-projector-20.js';

const ranges=['Audit planning!A74:BS74','Audit_Visit_Obligations!A144:F144',
 'Audit_Visit_Obligations!A175:F175','Auditor Availability!A1069:M1069',
 'Auditor Availability!A1070:M1070'];
const target=[
 Array.from({length:71},(_,i)=>i===18?'19':i===32?'DONE':''),
 ['a','b','c','d','e','f'],['g','h','i','j','k','l'],
 Array.from({length:13},(_,i)=>'a'+i),Array.from({length:13},(_,i)=>'b'+i)
];
const before=target.map(row=>row.slice());
before[0][32]='OLD';
before[1][2]='OLD';
before[2][2]='OLD';
before[3][0]='OLD';
before[4][0]='OLD';
const plan={projectionWrites:ranges.map((range,i)=>({range,values:[target[i]]})),
 projectionPreconditions:ranges.map((range,i)=>({range,before:before[i]}))};
let raw=target.map(row=>row.slice()),formatted=target.map(row=>row.slice());
raw[0][18]=19;
const ok=x=>({ok:true,async json(){return structuredClone(x)}});
const fetchImpl=async(url)=>{
 const u=new URL(url);
 assert.ok(u.pathname.endsWith('/values:batchGet'));
 const mode=u.searchParams.get('valueRenderOption');
 return ok({valueRanges:u.searchParams.getAll('ranges').map(range=>{
  const i=ranges.indexOf(range);assert.ok(i>=0);
  return {range,values:[(mode==='FORMATTED_VALUE'?formatted:raw)[i]]};
 })});
};
const projector=createPlanningSheetsWritesetProjector({
 spreadsheetId:'dev-sheet',getToken:async()=> 'test-token',fetchImpl,
 verifyFence:async()=>{}
});
test('committed target normalizes only a verified USER_ENTERED hour cell',async()=>{
 assert.equal((await projector.inspect(plan)).state,'CONFLICT');
 const normalized=await projector.normalizeCommittedTargetHours(plan);
 assert.equal(normalized.projectionWrites[0].values[0][18],19);
 assert.equal(plan.projectionWrites[0].values[0][18],'19');
 assert.equal((await projector.inspect(normalized)).state,'MATCH');
});
test('committed target rejects unrelated raw cell drift',async()=>{
 raw[1][4]='UNRELATED';
 await assert.rejects(()=>projector.normalizeCommittedTargetHours(plan),/OTHER_CELL_DRIFT/);
 raw[1][4]=target[1][4];
});
test('committed target rejects changed formatted business data',async()=>{
 formatted[0][32]='UNRELATED';
 await assert.rejects(()=>projector.normalizeCommittedTargetHours(plan),/RENDER_MISMATCH/);
 formatted[0][32]=target[0][32];
});
