import assert from 'node:assert/strict';
import {createPartialTimestampRepair20} from './planning-atomic-partial-timestamp-repair-20.js';
import {readFileSync} from 'node:fs';
const op='b7e8afcd18ca5c98fdd8c494924c1b79db28daffcfb4afc7daffaf4d6977416e';
const rows=['Auditor Availability!A1067:M1067','Auditor Availability!A1068:M1068'];
const stamp='2026-11-14 20:04:45';
const entry={operationId:op,auditId:'audit-1',revision:2,state:'UNCERTAIN',action:'PLAN',snapshot:{
 projectionWrites:[
  {range:'Audit planning!A65:BS65',values:[['audit-1','Approved']]},
  ...rows.map(range=>({range,values:[Array.from({length:13},(_,i)=>i===11?stamp:'ok')]}))],
 projectionPreconditions:[
  {range:'Audit planning!A65:BS65',before:['audit-1','Pending Planning']},
  ...rows.map(range=>({range,before:Array(13).fill('')}))],
 appendIntents:[{range:'Notification Queue!A:M',values:[['one'],['two']]}]
}};
const diff=(wrongColumn=12)=>[
 {range:'Audit planning!A65:BS65',differingCount:0,differing:[],matchedTarget:47},
 ...rows.map(range=>({range,differingCount:1,differing:[{column:wrongColumn}],matchedTarget:12}))
];
function fixture({wrongColumn=12,failedWrite=false}={}){
 const events=[];let phase='CONFLICT',append='MISSING',state='RECOVERING',header='Last_Updated';
 const store={readOutbox:async()=>entry,readAudit:async()=>({revision:2,pendingOperationId:op})};
 const gate={
  read:async()=>({holder:{operationId:op,state,token:'token2'}}),
  async resumeRecovery(){events.push('resume');return {operationId:op,token:'token2',state:'RECOVERING'};},
  async finishRecovery(){events.push('finish');state='UNCERTAIN';},
  async recordRecoveryFailure({stage,code}){events.push('failure:'+stage+':'+code);}
 };
 const projector={inspect:async()=>({state:phase}),inspectDiff:async()=>diff(wrongColumn)};
 const appendProjector={
  inspect:async()=>({state:append}),
  async apply(){events.push('append');append='MATCH';}
 };
 const recovery={async recoverOne(){assert.equal(state,'UNCERTAIN');events.push('settle');return {state:'PROJECTED'};}};
 const repair=createPartialTimestampRepair20({
  store,gate,projector,appendProjector,recovery,
  readHeader:async()=>header,
  async writeRaw({replacement}){events.push('raw');assert.deepEqual(replacement.map(x=>x.range),[
    'Auditor Availability!L1067','Auditor Availability!L1068']);
   assert.ok(replacement.every(x=>x.value===stamp));
   if(failedWrite)throw Error('RAW_HTTP_503');
   phase='MATCH';}
 });
 return {repair,events};
}
{
 const x=fixture(),result=await x.repair.commit({operationId:op});
 assert.equal(result.projected,true);
 assert.deepEqual(x.events,['resume','raw','append','finish','settle']);
}
{
 const x=fixture({wrongColumn:11});
 await assert.rejects(x.repair.commit({operationId:op}),/NOT_TIMESTAMP_ONLY/);
 assert.deepEqual(x.events,[]);
}
{
 const x=fixture({failedWrite:true});
 await assert.rejects(x.repair.commit({operationId:op}),/BLOCKED_REPAIR_LAST_UPDATED_RAW_HTTP_503/);
 assert.ok(x.events.includes('failure:REPAIR_LAST_UPDATED:RAW_HTTP_503'));
 assert.ok(!x.events.includes('finish'));
 assert.ok(!x.events.includes('settle'));
}
{
 const x=fixture();
 await assert.rejects(x.repair.commit({operationId:'other'}),/NOT_ALLOWLISTED/);
 assert.deepEqual(x.events,[]);
}
const r15=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
const freeze=readFileSync(new URL('./dev-cutover-freeze-20.mjs',import.meta.url),'utf8');
assert.ok(r15.includes("u.pathname==='/manager/atomic-partial-repair'"));
assert.ok(r15.includes("u.pathname==='/api/v1/planning/atomic-partial-repair'"));
assert.ok(r15.includes("input.confirm!=='REPAIR_ONLY_TWO_LAST_UPDATED_CELLS'"));
assert.ok(freeze.includes("'/api/v1/planning/atomic-partial-repair'"));
console.log('PARTIAL_TIMESTAMP_REPAIR_SCOPED_PASS');
