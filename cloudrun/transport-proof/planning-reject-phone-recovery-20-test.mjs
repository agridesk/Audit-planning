import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRejectPhoneRecovery20} from './planning-reject-phone-recovery-20.js';
import {devCutoverFreezeDecision20} from './dev-cutover-freeze-20.mjs';

const op='45b4763f8c3300eac8f6b82dad15efd41438ae119df815bb8e05d8d30e5048cb';
const ranges=['Audit planning!A95:BS95','Audit_Obligations!A173:AA173',
 'Audit_Visit_Obligations!A173:F173','Auditor Availability!A237:M237',
 'Auditor Availability!A240:M240','Companies!A84:Y84','Company_Scopes!A173:M173'];
function fixture(){
 const phone='+31-123456789',company=Array(25).fill('');
 company[4]=phone;company[18]='No';
 const entry={operationId:op,state:'UNCERTAIN',action:'REJECT',multi:true,auditId:'audit',
  entities:[{auditId:'audit',revision:4}],snapshot:{
   projectionWrites:ranges.map((range,i)=>({range,values:[i===5?company:['target']]})),
   projectionPreconditions:ranges.map((range,i)=>({range,before:i===5?[...company]:['before']})),
   successorSnapshots:[],
   appendIntents:[{range:'Rejected audits!A:M',values:[['reject']]},
    {range:'Notification Queue!A:M',values:[['one'],['two']]}]
  }};
 const events=[]; let state='UNCERTAIN',phase='CONFLICT',append='MISSING',formula='='+phone,
  numeric=31-123456789,header='Contactperson phone',failure='',reorder=false,changeAfterFence=false;
 const store={readOutbox:async()=>{
  const copy=structuredClone(entry);
  if(state==='RECOVERING'&&reorder)return Object.fromEntries(Object.entries(copy).reverse());
  if(state==='RECOVERING'&&changeAfterFence)copy.snapshot.appendIntents[0].values[0][0]='changed';
  return copy;
 },
  readAudit:async()=>({pendingOperationId:op,revision:4,snapshot:{status:'Rejected'}})};
 const gate={read:async()=>({holder:{state,operationId:op,token:'token'}}),
  async beginRecovery(){assert.equal(state,'UNCERTAIN');state='RECOVERING';events.push('begin');return {token:'token'};},
  async finishRecovery(){state='UNCERTAIN';events.push('finish');},
  async recordRecoveryFailure({stage}){events.push('failure:'+stage);}};
 const projector={
  async inspect(){return {state:phase};},
  async inspectDiff(){return ranges.map((range,i)=>({range,differingCount:i===5?1:0,differing:i===5?[{column:5}]:[]}));}
 };
 const appendProjector={inspect:async()=>({state:append,count:3}),
  async apply(){events.push('append');if(failure==='append')throw Error('TIMEOUT');append='MATCH';}};
 const recovery={async recoverOne(){assert.equal(state,'UNCERTAIN');events.push('settle');return {state:'PROJECTED'};}};
 const repair=createRejectPhoneRecovery20({store,gate,projector,appendProjector,recovery,
  readPhone:async()=>({header,formula,value:numeric,entered:{formulaValue:formula}}),
  async writePhone({value}){assert.equal(value,phone);events.push('phone');if(failure==='phone')throw Error('TIMEOUT');phase='MATCH';}
 });
 return {repair,entry,events,setFormula:x=>formula=x,setNumeric:x=>numeric=x,setHeader:x=>header=x,
  setFailure:x=>failure=x,setReorder:()=>reorder=true,setChangeAfterFence:()=>changeAfterFence=true,getState:()=>state};
}
{
 const f=fixture(),preview=await f.repair.preview({operationId:op});
 assert.equal(preview.phoneFormulaVerified,true);
 const diagnostic=await f.repair.diagnose({operationId:op});
 assert.equal(diagnostic.formulaMatchesWithPlus,true);
 assert.equal(diagnostic.numericMatches,true);
 assert.ok(!JSON.stringify(diagnostic).includes('+31-123456789'));
 assert.deepEqual(f.events,[]);
 assert.equal((await f.repair.commit({operationId:op})).state,'PROJECTED');
 assert.deepEqual(f.events,['begin','phone','append','finish','settle']);
}
{
 const f=fixture();f.setFormula('+31-123456789');
 assert.equal((await f.repair.preview({operationId:op})).phoneFormulaVerified,true);
}
{
 const f=fixture();f.setReorder();
 assert.equal((await f.repair.commit({operationId:op})).state,'PROJECTED');
}
{
 const f=fixture();f.setChangeAfterFence();
 await assert.rejects(f.repair.commit({operationId:op}),/OUTBOX_CHANGED/);
 assert.deepEqual(f.events,['begin','finish']);
}
for(const change of [
 f=>f.setFormula('=1+1'),f=>f.setNumeric(1),f=>f.setHeader('Other'),
 f=>f.entry.entities[0].revision=5,
 f=>f.entry.snapshot.projectionPreconditions[5].before[4]='+31-987654321',
 f=>f.entry.snapshot.appendIntents[0].values.push(['extra'])
]){
 const f=fixture();change(f);
 await assert.rejects(f.repair.commit({operationId:op}));
 assert.deepEqual(f.events,[]);
}
for(const stage of ['phone','append']){
 const f=fixture();f.setFailure(stage);
 await assert.rejects(f.repair.commit({operationId:op}),/REJECT_PHONE_RECOVERY_UNCERTAIN_/);
 assert.equal(f.getState(),'RECOVERING');
 assert.ok(f.events.includes('failure:'+(stage==='phone'?'RESTORE_PHONE':'APPEND')));
 assert.ok(!f.events.includes('finish'));
 assert.ok(!f.events.includes('settle'));
}
{
 const f=fixture();
 await assert.rejects(f.repair.commit({operationId:'other'}),/NOT_ALLOWLISTED/);
 assert.deepEqual(f.events,[]);
}
assert.equal(devCutoverFreezeDecision20({isDev:true,freezeEnabled:true,atomicPlanningEnabled:true,
 method:'POST',path:'/api/v1/planning/reject-phone-recovery'}).allow,true);
const server=readFileSync(new URL('./server-r15.js',import.meta.url),'utf8');
assert.ok(server.includes("input.confirm!=='RECOVER_VERIFIED_REJECT_PHONE'"));
assert.ok(server.includes("if(!runtime.isDev||!planningRejectPhoneRecovery)"));
console.log('Reject phone recovery: exact proof, scope, fence and failure handling passed');
