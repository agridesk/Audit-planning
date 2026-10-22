import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../CoreStatusMachine.js',import.meta.url),'utf8');
function env(releaseFails){
 const events=[],ctx=vm.createContext({Date,Logger:{log:()=>{}}});vm.runInContext(code,ctx);
 ctx.Status_releaseAvailability_=()=>{events.push('release');if(releaseFails)throw Error('AVAILABILITY_RELEASE_FAILED');return {success:true}};
 ctx.Status_snapshotProtectedPlanningFields_=()=>{events.push('snapshot');return {success:true}};
 ctx.Status_resetPlanning_=()=>{events.push('reset')};
 ctx.Status_restoreProtectedPlanningFields_=()=>({success:true});
 ctx.Status_lifecycleOnStatusChanged_=()=>({success:true});
 ctx.Status_invalidateAuditPlanningPack_=()=>{};
 ctx.Status_buildActionResult_=()=>({success:true});
 const row={auditId:'A1',rowIndex:2,col:{status:3},sheet:{getRange:()=>({setValue:v=>events.push('write:'+v)})}};
 const transition={afterStatusDisplay:'Pending Planning'};
 return{events,run:()=>ctx.Status_applyReopen_(row,transition,{releaseAvailability:true,actor:'MANAGER',action:'CANCEL'})};
}
let a=env(true);assert.throws(a.run,/AVAILABILITY_RELEASE_FAILED/);assert.deepEqual(a.events,['release']);
let b=env(false);assert.equal(b.run().success,true);assert.deepEqual(b.events.slice(0,4),['release','snapshot','reset','write:Pending Planning']);
console.log('CANONICAL_CANCEL_AVAILABILITY_FIRST: PASS');
