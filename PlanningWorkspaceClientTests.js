/***********************************************************************
 * PlanningWorkspaceClientTests.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_CLIENT_TESTS_R10_SINGLE_DECISION_RPC
 ***********************************************************************/
var PLANNING_WORKSPACE_CLIENT_TEST_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_CLIENT_TESTS_R10_SINGLE_DECISION_RPC';
function RUN_PLANNING_WORKSPACE_CLIENT_BINDING_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  t('clientPresent',!!src);
  t('buildMarker',src.indexOf('PLANNING_WORKSPACE_CLIENT_R11_SINGLE_DECISION_RPC')>=0);
  t('bootstrapRpc',src.indexOf('PlanningWorkspaceRpc_bootstrap')>=0);
  t('splitAdvisoryRpcRemoved',src.indexOf('PlanningWorkspaceRpc_getAdvisory')<0);
  t('splitOverlayRpcRemoved',src.indexOf('PlanningWorkspaceRpc_getOverlays')<0);
  t('successHandler',src.indexOf('withSuccessHandler')>=0);
  t('failureHandler',src.indexOf('withFailureHandler')>=0);
  t('loadGuard',src.indexOf('state.loading')>=0);
  t('operationalKpis',src.indexOf('renderKpis')>=0);
  t('plannerAttention',src.indexOf('renderAttention')>=0);
  t('auditorWorkload',src.indexOf('renderWorkload')>=0);
  t('batchSelection',src.indexOf('renderBatch')>=0);
  t('calendar',src.indexOf('renderCalendar')>=0);
  t('shellMetric',src.indexOf('PlanningWorkspace_open_to_shell_interactive')>=0);
  t('decisionMetricOpen',src.indexOf('PlanningWorkspace_open_to_decision_ready')>=0);
  t('decisionMetricReload',src.indexOf('PlanningWorkspace_load_to_decision_ready')>=0);
  t('availabilityMetric',src.indexOf('PlanningWorkspace_open_availability_visible')>=0&&src.indexOf('PlanningWorkspace_availability_to_visible')>=0);
  t('paintBoundary',src.indexOf('requestAnimationFrame')>=0);
  t('singleDecisionRpc',src.indexOf('.PlanningWorkspaceRpc_bootstrap(base)')>=0);
  t('singleRpcMarker',src.indexOf('singleRpc:true')>=0);
  t('serverDurationCaptured',src.indexOf('rpcDurationMs:r.durationMs||null')>=0);
  t('shellBeforeOpenLoad',src.indexOf("publishShell({type:'AMS01_BROWSER_PERF'")>=0&&src.indexOf("load('open')")>=0);
  t('navigationClock',src.indexOf("kind==='open'?now():now()-started")>=0);
  t('footerSplit',src.indexOf('Shell ')>=0&&src.indexOf('Decision-ready ')>=0&&src.indexOf('Availability ')>=0);
  t('noRawJsonRender',src.indexOf('JSON.stringify(advisory')<0&&src.indexOf('JSON.stringify(overlays')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noCanonicalBypass',src.indexOf('PlanningCanonicalCommitService_commit')<0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_CLIENT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,rpcInvocationPerformed:false,operationalRenderer:true,dataIndependentShell:true,shellInteractiveMetric:true,decisionReadyMetric:true,singleDecisionRpc:true,rawJsonShell:false}};console.log(JSON.stringify(out,null,2));return out;
}
