/***********************************************************************
 * AMS03_Phase7BatchPlanningBatchAcceptance.js
 * BUILD: 2026-09-23_AMS03_PHASE7_BATCH_PLANNING_GATE_R1
 ***********************************************************************/
var AMS03_PHASE7_GATE_BUILD='2026-09-23_AMS03_PHASE7_BATCH_PLANNING_GATE_R1';
function RUN_AMS03_PHASE7_BATCH_PLANNING_ACCEPTANCE(){
 var a=RUN_PLANNING_BATCH_PREFLIGHT_REGRESSION(),b=RUN_PLANNING_BATCH_COMMIT_REGRESSION(),c=RUN_BATCH_PLANNING_MANAGER_UI_CONTRACT_REGRESSION(),d=RUN_AMS03_PHASE7_BATCH_MATURATION_ACCEPTANCE(),items=[{name:'preflight',ok:!!(a&&a.ok),build:a&&a.build||''},{name:'commit',ok:!!(b&&b.ok),build:b&&b.build||''},{name:'managerUi',ok:!!(c&&c.ok),build:c&&c.build||''},{name:'maturation',ok:!!(d&&d.ok),build:d&&d.build||''}],failed=items.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS03_PHASE7_GATE_BUILD,total:items.length,passed:items.length-failed,failed:failed,results:items,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,phase:'7 batch planning maturation',boundedMaxItems:20,canonicalCommitOwner:'PlanningCanonicalCommitService_commit'}};Logger.log(JSON.stringify(out,null,2));return out;
}
