import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const server=readFileSync(new URL('./server-r4.js',import.meta.url),'utf8');
const a=server.indexOf('function normalizeDevModelCDateCells20(');
const b=server.indexOf('async function readIsolatedDevModelCExt20(',a);
assert(a>=0&&b>a,'DEV Model C Sheets date normalizer exists');
const sandbox={Date,Error,Number,Array};
vm.createContext(sandbox);
vm.runInContext(server.slice(a,b),sandbox);
const f=sandbox.normalizeDevModelCDateCells20;
assert.equal(typeof f,'function');
const data=[
 {values:[['Obligation_ID','Base_Expiry_Date','Formal_Hours','Effective_Expiry_Date','Planning_Window_From','Planning_Window_To'],
          ['OB1',46262,8,46262,46139,46231],
          ['OB2','2027-02-15',6,'2027-02-15','2026-11-15','2027-02-15']]},
 {values:[['Audit_ID','Obligation_ID','Link_State'],['A1','OB1','ACTIVE']]},
 {values:[['Audit ID','Extended Expiration Date','Total audit time in hours','Planning window from','Planning window to'],
          ['A1',46262,8,46139,46231]]}
];
const clone=JSON.parse(JSON.stringify(data));
const result=f(data);
const iso=n=>new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);
assert.equal(result.obligations[1][1],iso(46262));
assert.equal(result.obligations[1][3],iso(46262));
assert.equal(result.obligations[1][4],iso(46139));
assert.equal(result.obligations[2][1],'2027-02-15');
assert.equal(result.obligations[1][2],8,'Formal hours must never be converted');
assert.equal(result.planning[1][1],iso(46262));
assert.equal(result.planning[1][2],8,'Planning hours must remain numeric');
assert.equal(result.planning[1][3],iso(46139));
assert.equal(result.planning[1][4],iso(46231));
assert.deepEqual(data,clone,'Source reads must remain immutable');
assert.throws(()=>f([{values:[['Base_Expiry_Date'],[46262.5]]},null,{values:[['Audit ID']]}]),/EXT_DEV_DATE_SERIAL_INVALID/);
assert(server.includes('obligationRows:dates.obligations')&&server.includes('const planningRows=atomicPreflight?canonicalPlanningRows:dates.planning')&&server.includes('return {obligationRows:dates.obligations,linkRows:r[1]?.values||[],planningRows,scopeRows,sharedExpiryPairs,cbOutboxRows:r[6]?.values}')&&server.includes('inspectDevScopeExtension20({...source,companyUid})')&&server.includes('inspectDevScopeExtension20({...await readIsolatedDevModelCExt20(),companyUid})'),'Both normalized datasets must reach the Model C inspector and post-write readback; atomic preflight must use canonical planning rows');
console.log('DEV Model C numeric Sheets serial date conversion and immutable readback PASS');

const readerEnd=server.indexOf('function isolatedExtPilot20(',b);
const readerSource=server.slice(b,readerEnd)+'\nreadIsolatedDevModelCExt20';
const dependencies=[['Parent_ScopeCode','Child_ScopeCode'],['MPS-GAP','GRASP']];
for(const render of ['FORMATTED_VALUE','UNFORMATTED_VALUE']){
 for(const obligationCount of [1,2]){
  let batchFinished=false,canonicalStarted=false,releaseBatch;
  const waiting=new Promise(resolve=>{releaseBatch=resolve});
  const ranges=[
   {values:[['Obligation_ID','Effective_Expiry_Date'],...Array.from({length:obligationCount},(_,i)=>['OB'+i,46262])]},
   data[1],data[2],
   {values:[['ScopeCode'],['MPS-GAP'],['GRASP']]},
   {values:[['KEY','DEV','PROD'],['ENV','DEV','PROD'],['ALLOW_DEV_WRITES','FALSE','TRUE'],['DEV_WRITE_MODE','BLOCK','LIVE']]},
   {values:dependencies},{values:[['Event_ID']]}
  ];
  const canonical=[['Audit ID','Effective expiry','Hours'],['A1','2027-01-01',render==='UNFORMATTED_VALUE'?8:'8']];
  const reader=vm.runInNewContext(readerSource,{
   SID:'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',
   isolatedExtDirect20:()=>false,isolatedExtAtomicPreflight20:()=>true,
   verifiedAuditorLockDevProject:async()=> 'audit-management-system-dev',
   sheetsBatchGet:async()=>{await waiting;batchFinished=true;return ranges},
   readCanonicalPlanningRowsForAtomic20:async option=>{
    canonicalStarted=true;assert.equal(option,render);
    assert.equal(batchFinished,false,'canonical read starts before batch completes');
    return canonical;
   },
   normalizeDevModelCDateCells20:f,clean:x=>String(x??'').trim(),
   requiredTogetherScopePairs20:({dependencies:actual})=>{assert.strictEqual(actual,dependencies);return ['pair']}
  });
  const pending=reader(render);
  // Release even on failure, so a sequential implementation fails instead of hanging.
  releaseBatch();
  assert.equal(canonicalStarted,true,'independent Sheets requests must overlap');
  const actual=await pending;
  assert.strictEqual(actual.planningRows,canonical,'preserve canonical types, values and row boundary');
  assert.equal(actual.obligationRows.length,obligationCount+1);
  assert.equal(actual.obligationRows[1][1],iso(46262));
  assert.strictEqual(actual.cbOutboxRows,ranges[6].values);
 }
}
for(const failure of ['project','config','batch','canonical']){
 let canonicalCalls=0;
 const reader=vm.runInNewContext(readerSource,{
  SID:'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',
  isolatedExtDirect20:()=>false,isolatedExtAtomicPreflight20:()=>true,
  verifiedAuditorLockDevProject:async()=>failure==='project'?'other-project':'audit-management-system-dev',
  sheetsBatchGet:async()=>{
   if(failure==='batch')throw Error('BATCH_READ_FAILED');
   return [data[0],data[1],data[2],{values:[['ScopeCode']]},
    {values:[['KEY','DEV','PROD'],['ENV','DEV'],['ALLOW_DEV_WRITES',failure==='config'?'TRUE':'FALSE'],['DEV_WRITE_MODE','BLOCK']]},
    {values:dependencies},{values:[]}];
  },
  readCanonicalPlanningRowsForAtomic20:async()=>{
   canonicalCalls++;if(failure==='canonical')throw Error('CANONICAL_READ_FAILED');return data[2].values;
  },
  normalizeDevModelCDateCells20:f,clean:x=>String(x??'').trim(),
  requiredTogetherScopePairs20:()=>[]
 });
 const expected={project:/ISOLATION_REQUIRED/,config:/WRITERS_NOT_FROZEN/,batch:/BATCH_READ_FAILED/,canonical:/CANONICAL_READ_FAILED/};
 await assert.rejects(reader(),expected[failure]);
 assert.equal(canonicalCalls,1);
}
{
 let canonicalCalls=0;
 const reader=vm.runInNewContext(readerSource,{
  SID:'1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs',
  isolatedExtDirect20:()=>true,isolatedExtAtomicPreflight20:()=>false,
  verifiedAuditorLockDevProject:async()=> 'audit-management-system-dev',
  sheetsBatchGet:async()=>[data[0],data[1],data[2],{values:[['ScopeCode']]},{values:[['KEY','DEV','PROD']]},{values:dependencies},{values:[]}],
  readCanonicalPlanningRowsForAtomic20:async()=>{canonicalCalls++;throw Error('UNEXPECTED_ATOMIC_READ')},
  devManagerDirectWritesConfigAllowed20:()=>true,
  normalizeDevModelCDateCells20:f,clean:x=>String(x??'').trim(),
  requiredTogetherScopePairs20:()=>[]
 });
 const actual=await reader();
 assert.equal(canonicalCalls,0,'non-atomic path keeps its existing reads');
 assert.equal(actual.planningRows[1][1],iso(46262));
}
console.log('EXT parallel reads: single/paired, formatted/numeric parity, direct fallback and fail-closed guards PASS');
