/***********************************************************************
 * PlanningWorkspaceWorkloadSummaryTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_TEST_R2_SCOPE
 ***********************************************************************/
function RUN_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_REGRESSION(){
  var results=[];
  function check(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});}
  var c=PlanningWorkspaceWorkloadSummary_contract();
  var rpc=PlanningWorkspaceRpc_contract();
  check('readOnly',c.readOnly===true);
  check('planningDemandOwner',c.owner==='PlanningDemandService');
  check('noNewSsot',c.newSsot===false);
  check('existingFunctionalityPreserved',c.existingFunctionalityPreserved===true);
  check('auditorEmailField',c.fields.indexOf('auditorEmail')>=0);
  check('auditsToPlanField',c.fields.indexOf('auditsToPlan')>=0);
  check('hoursToPlanField',c.fields.indexOf('hoursToPlan')>=0);
  check('dedicatedAuditsField',c.fields.indexOf('auditsDedicated')>=0);
  check('dedicatedHoursField',c.fields.indexOf('hoursDedicated')>=0);
  check('scopeBreakdownField',c.fields.indexOf('scopeBreakdown')>=0);
  check('scopeBreakdownContract',c.scopeBreakdown===true);
  check('rpcEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_loadWorkloadSummary')>=0);
  check('rpcOwner',rpc.meta.workloadSummaryOwner==='PlanningWorkspaceWorkloadSummary via PlanningDemandService');
  check('legacyPlanningPreserved',rpc.meta.legacyPlanningEntrypointsPreserved===true);
  var passed=results.filter(function(x){return x.ok;}).length;
  var out={ok:passed===results.length,build:'2026-09-09_PLANNING_WORKSPACE_WORKLOAD_SUMMARY_TEST_R2_SCOPE',total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,scopeBreakdown:true}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
