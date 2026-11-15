import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyVisitCompositionRecovery20} from './visit-composition-recovery-classifier-20.js';
const id='a'.repeat(64);
function fixture(){
 const ranges=['Audit planning!A74:BS74','Audit_Visit_Obligations!A144:F144','Audit_Visit_Obligations!A175:F175','Auditor Availability!A1069:M1069','Auditor Availability!A1070:M1070'];
 return {
  entry:{operationId:id,action:'VISIT_COMPOSITION_SEPARATELY',state:'UNCERTAIN',multi:true,
   snapshot:{projectionWrites:ranges.map(range=>({range,values:[[...Array(71).fill('')]]})),
    projectionPreconditions:ranges.map(range=>({range,before:[...Array(71).fill('')]})),
    appendIntents:Array(6).fill({range:'Notification Queue!A:M',values:[['x']]})}},
  gate:{holder:{operationId:id,state:'UNCERTAIN',uncertainAt:'2026-01-01T00:00:00Z'}},
  rows:{state:'CONFLICT',detail:ranges.map((range,i)=>({range,target:false,before:i!==0}))},
  append:{state:'MISSING'},
  renderParity:{allFormattedBefore:true,detail:ranges.map(range=>({range,formattedMatchesBefore:true}))},
  cellDiff:ranges.map((range,i)=>({range,differing:i===0?[{column:19,matchesBefore:false,actualType:'number'}]:[]}))
 };
}
test('only isolated numeric formatting drift is eligible for manual forward recovery',()=>{
 const x=fixture();assert.equal(classifyVisitCompositionRecovery20(x).eligible,true);
});
test('changed business cell fails closed',()=>{
 const x=fixture();x.cellDiff[0].differing.push({column:33,matchesBefore:false});
 assert.equal(classifyVisitCompositionRecovery20(x).eligible,false);
});
test('formatted source drift fails closed',()=>{
 const x=fixture();x.renderParity.allFormattedBefore=false;
 assert.equal(classifyVisitCompositionRecovery20(x).eligible,false);
});
test('different action or unlocked gate fails closed',()=>{
 const x=fixture();x.entry.action='PLAN';assert.equal(classifyVisitCompositionRecovery20(x).eligible,false);
 x.entry.action='VISIT_COMPOSITION_SEPARATELY';x.gate.holder.state='ACTIVE';
 assert.equal(classifyVisitCompositionRecovery20(x).eligible,false);
});
