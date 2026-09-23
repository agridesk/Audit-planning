/***********************************************************************
 * AMS03_AnnualPlannerPhase4BatchAcceptance.js
 * BUILD: 2026-09-23_AMS03_ANNUAL_PLANNER_PHASE4_BATCH_R1
 ***********************************************************************/
var AMS03_ANNUAL_PHASE4_BATCH_BUILD='2026-09-23_AMS03_ANNUAL_PLANNER_PHASE4_BATCH_R1';
function RUN_AMS03_ANNUAL_PLANNER_PHASE4_BATCH_ACCEPTANCE(){
 var a=RUN_AMS03_ANNUAL_PLANNING_INTEGRATED_ACCEPTANCE(),b=RUN_AMS03_ANNUAL_PHASE4_CONTRACT_REGRESSION(),c=RUN_AMS03_ANNUAL_PLANNER_PHASE4_ACCEPTANCE(),items=[{name:'integratedBaseline',ok:!!(a&&a.ok),build:a&&a.build||''},{name:'ownershipContract',ok:!!(b&&b.ok),build:b&&b.build||''},{name:'drilldownLaunch',ok:!!(c&&c.ok),build:c&&c.build||''}],failed=items.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS03_ANNUAL_PHASE4_BATCH_BUILD,total:items.length,passed:items.length-failed,failed:failed,results:items,summary:c&&c.summary||{},drilldown:c&&c.drilldown||{},meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false,phase:'4 integrated annual planner'}};Logger.log(JSON.stringify(out,null,2));return out;
}
