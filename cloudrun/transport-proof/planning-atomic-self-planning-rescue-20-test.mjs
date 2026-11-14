import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtomicSelfPlanningRescue20} from './planning-atomic-self-planning-rescue-20.js';

const OP='fa914e8c46ad1ded6d364868f7154059b48af2c36ba51609a6cae1838f35dec4';
const row='Audit planning!A7:BS7',cell='Audit planning!AD7';
const before=Array(71).fill('');before[18]='8,00';before[29]='No';
const after=[...before];after[29]='Yes';
const snapshot={projectionWrites:[{range:row,values:[after]}],
 projectionPreconditions:[{range:row,before}],appendIntents:[]};
function fixture({diffChanged=false,gateState='UNCERTAIN',hour=8,wrongHeader=false,wrongOperation=false}={}){
 const calls=[];let toggle='No',outbox='UNCERTAIN',pending=OP,revision=12;
 let holder={operationId:OP,token:'fence',state:gateState};
 const store={
  readOutbox:async()=>({state:outbox,action:'SELF_PLANNING',auditId:'audit',revision,snapshot}),
  readAudit:async()=>({revision,pendingOperationId:pending}),
  markProjected:async args=>{calls.push('markProjected');assert.equal(toggle,'Yes');outbox='PROJECTED';pending=null;return args;}
 };
 const gate={
  read:async()=>({holder}),
  beginRecovery:async()=>{calls.push('beginRecovery');holder={...holder,state:'RECOVERING'};return holder;},
  finishRecovery:async()=>{calls.push('finishRecovery');holder={...holder,state:'UNCERTAIN'};},
  release:async()=>{calls.push('release');holder=null;}
 };
 const projector={
  inspect:async narrow=>({state:toggle===narrow.projectionWrites[0].values[0][0]?'MATCH':'READY'}),
  inspectDiff:async()=>[{range:row,differingCount:toggle==='No'?2:1,differing:toggle==='No'?
   [{column:19,actualType:'number'},{column:30,matchesBefore:true}]:
   [{column:19,actualType:'number'}]}]
 };
 const service=createAtomicSelfPlanningRescue20({store,gate,projector,
  readHeaders:async()=>({S:wrongHeader?'Different':'Total audit time in hours',AD:'Allow self planning'}),
  readHour:async()=>hour,
  writeToggle:async({cell:target,value,operationId,token})=>{
   calls.push('writeToggle');assert.equal(target,cell);assert.equal(value,'Yes');
   assert.equal(operationId,OP);assert.equal(token,'fence');toggle=value;
  }
 });
 return {service,calls,getState:()=>({toggle,outbox,holder})};
}
{
 const f=fixture();const result=await f.service.commit({operationId:OP});
 assert.equal(result.recovered,true);
 assert.deepEqual(f.calls,['beginRecovery','writeToggle','markProjected','finishRecovery','release']);
 assert.equal(f.getState().toggle,'Yes');assert.equal(f.getState().outbox,'PROJECTED');
 assert.equal(f.getState().holder,null);
}
for(const [name,options,error] of [
 ['wrong header',{wrongHeader:true},/SCHEMA_CHANGED/],
 ['gate not uncertain',{gateState:'RECOVERING'},/GATE_NOT_UNCERTAIN/],
 ['non numeric hour',{hour:'8'},/HOUR_NOT_NUMERIC/]
]){
 const f=fixture(options);await assert.rejects(f.service.commit({operationId:OP}),error,name);
 assert.equal(f.calls.length,0,name+' unexpectedly mutated data');
}
{
 const f=fixture();
 await assert.rejects(f.service.commit({operationId:'another-operation'}),/OPERATION_DENIED/);
 assert.deepEqual(f.calls,[]);
}
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
for(const marker of [
 "createAtomicSelfPlanningRescue20",
 "/api/v1/planning/atomic-self-planning-rescue",
 "RECOVER_ONLY_SELF_PLANNING_AD7",
 "cell!=='Audit planning!AD7'",
 "valueInputOption=RAW",
 "SELF_PLANNING_RESCUE_POST_FENCE_LOST"
]) assert.ok(server.includes(marker),'Missing R15 recovery wiring: '+marker);
console.log('PASS: Self planning recovery AD7-only, fenced and DEV-routed');
