/***********************************************************************
 * AMS01_PlanningWorkspacePhase3BatchAcceptance.js
 * BUILD: 2026-09-23_AMS01_3_WORKSPACE_FAST_READ_BATCH_R2_SHARED_CONTEXT_TELEMETRY
 * One larger read-only validation batch for Phase 3 fast-read integration.
 ***********************************************************************/
var AMS01_PW_PHASE3_BATCH_BUILD='2026-09-23_AMS01_3_WORKSPACE_FAST_READ_BATCH_R2_SHARED_CONTEXT_TELEMETRY';
function RUN_AMS01_3_WORKSPACE_FAST_READ_BATCH_ACCEPTANCE(){
 var results=[];function run(name,fn){var x=fn();results.push({name:name,ok:!!(x&&x.ok===true),build:x&&x.build||'',failed:x&&x.failed||0,performance:x&&x.performance||null});}
 run('decisionContract',RUN_AMS01_3_WORKSPACE_DECISION_READ_MODEL_REGRESSION);
 run('decisionIntegration',RUN_AMS01_3_WORKSPACE_DECISION_INTEGRATION_REGRESSION);
 run('decisionLive',RUN_AMS01_3_WORKSPACE_DECISION_LIVE_ACCEPTANCE);
 run('bootstrapFastPath',RUN_PLANNING_WORKSPACE_BOOTSTRAP_FAST_PATH_ACCEPTANCE);
 run('bootstrapDistribution',RUN_AMS01_2_WORKSPACE_BOOTSTRAP_PERFORMANCE_ACCEPTANCE);
 var failed=results.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:AMS01_PW_PHASE3_BATCH_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,newSsot:false,purpose:'Consolidated runtime gate after compact Workspace decision-model integration.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
