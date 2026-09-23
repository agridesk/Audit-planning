/***********************************************************************
 * AMS03_Planning2RoadmapMasterAcceptance.js
 * BUILD: 2026-09-23_AMS03_PLANNING2_MASTER_GATE_R2_MATURATION
 * Consolidated non-destructive roadmap acceptance.
 ***********************************************************************/
function RUN_AMS03_PLANNING2_MASTER_ACCEPTANCE(){
 var calls=[
  ['phase2Workspace',function(){return RUN_AMS01_2_WORKSPACE_PHASE2_CLOSURE_ACCEPTANCE();}],
  ['phase3FastRead',function(){return RUN_AMS01_3_WORKSPACE_FAST_READ_BATCH_ACCEPTANCE();}],
  ['phase4AnnualPlanner',function(){return RUN_AMS03_ANNUAL_PLANNER_PHASE4_BATCH_ACCEPTANCE();}],
  ['phase5OperationalActions',function(){return RUN_AMS03_PHASE5_OPERATIONAL_ACTIONS_BATCH_ACCEPTANCE();}],
  ['phase6LifecycleReporting',function(){return RUN_AMS03_PHASE6_LIFECYCLE_REPORTING_ACCEPTANCE();}],
  ['phase7BatchPlanning',function(){return RUN_AMS03_PHASE7_BATCH_PLANNING_ACCEPTANCE();}],
  ['phase8to10Maturation',function(){return RUN_AMS03_PHASE8_10_MATURATION_BATCH_ACCEPTANCE();}]
 ],results=[];
 for(var i=0;i<calls.length;i++){try{var x=calls[i][1](),ok=!!(x&&(x.ok===true||x.success===true));results.push({name:calls[i][0],ok:ok,build:x&&x.build||'',passed:x&&x.passed,total:x&&x.total});}catch(e){results.push({name:calls[i][0],ok:false,error:String(e&&e.message||e)});}}
 var failed=results.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:'2026-09-23_AMS03_PLANNING2_MASTER_GATE_R2_MATURATION',total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,newSsot:false,roadmap:'Planning 2.0 phases 2-10',phase1CapacityCorrection:'previously closed',phase8to10Status:'MATURATION_FOUNDATION_NOT_FULL_PRODUCT_CLOSURE',legacyRetirementPolicy:'safe caller migration only'}};Logger.log(JSON.stringify(out,null,2));return out;
}
