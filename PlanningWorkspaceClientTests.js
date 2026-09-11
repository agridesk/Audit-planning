/***********************************************************************
 * PlanningWorkspaceClientTests.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_CLIENT_TESTS_R4_SPLIT_WALL_PERF
 ***********************************************************************/
var PLANNING_WORKSPACE_CLIENT_TEST_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_CLIENT_TESTS_R4_SPLIT_WALL_PERF';
function RUN_PLANNING_WORKSPACE_CLIENT_BINDING_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  t('clientPresent',!!src);
  t('buildMarker',src.indexOf('PLANNING_WORKSPACE_CLIENT_R5_SPLIT_WALL_PERF')>=0);
  t('advisoryRpc',src.indexOf('PlanningWorkspaceRpc_getAdvisory')>=0);
  t('overlayRpc',src.indexOf('PlanningWorkspaceRpc_getOverlays')>=0);
  t('bootstrapNotPrimary',src.indexOf('.PlanningWorkspaceRpc_bootstrap(')<0);
  t('successHandler',src.indexOf('withSuccessHandler')>=0);
  t('failureHandler',src.indexOf('withFailureHandler')>=0);
  t('loadGuard',src.indexOf('state.loading')>=0);
  t('operationalKpis',src.indexOf('renderKpis')>=0);
  t('plannerAttention',src.indexOf('renderAttention')>=0);
  t('auditorWorkload',src.indexOf('renderWorkload')>=0);
  t('batchSelection',src.indexOf('renderBatch')>=0);
  t('calendar',src.indexOf('renderCalendar')>=0);
  t('workspaceWallPerf',src.indexOf('PlanningWorkspace_load_to_usable')>=0);
  t('availabilityWallPerf',src.indexOf('PlanningWorkspace_availability_to_visible')>=0);
  t('paintBoundary',src.indexOf('requestAnimationFrame')>=0);
  t('candidateBounding',src.indexOf('candidateEmails()')>=0);
  t('noRawJsonRender',src.indexOf('JSON.stringify(advisory')<0&&src.indexOf('JSON.stringify(overlays')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noCanonicalBypass',src.indexOf('PlanningCanonicalCommitService_commit')<0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_CLIENT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,rpcInvocationPerformed:false,operationalRenderer:true,splitFirstPaint:true,rawJsonShell:false}};console.log(JSON.stringify(out,null,2));return out;
}
