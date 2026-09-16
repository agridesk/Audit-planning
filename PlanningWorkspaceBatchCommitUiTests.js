/***********************************************************************
 * PlanningWorkspaceBatchCommitUiTests.js
 * BUILD: 2026-09-16_ROADMAP_2_4_WORKSPACE_BATCH_COMMIT_UI_TESTS_R3_PREFLIGHT_FLOW_ASSERTION
 * Non-destructive source/wiring regression.
 ***********************************************************************/
var PLANNING_WORKSPACE_BATCH_COMMIT_UI_TEST_BUILD='2026-09-16_ROADMAP_2_4_WORKSPACE_BATCH_COMMIT_UI_TESTS_R3_PREFLIGHT_FLOW_ASSERTION';
function RUN_PLANNING_WORKSPACE_BATCH_COMMIT_UI_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var html=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
 var js=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent();
 var commitFn=js.indexOf('function commit()'),preflightCall=js.indexOf('PlanningWorkspaceRpc_batchPreflight',commitFn),doCommitCall=js.indexOf('doCommit(rows,b,wall)',commitFn),doCommitFn=js.indexOf('function doCommit('),batchCommitCall=js.indexOf('PlanningWorkspaceRpc_batchCommit',doCommitFn);
 t('workspaceLoadsEnhancer',html.indexOf("PlanningWorkspaceBatchCommit.js")>=0);
 t('enhancerBuild',js.indexOf('WORKSPACE_BATCH_COMMIT_UI_R2_PREFLIGHT_FIRST')>=0);
 t('preflightRpcUsed',preflightCall>=0);
 t('batchRpcUsed',batchCommitCall>=0);
 t('preflightControlsCommit',commitFn>=0&&preflightCall>commitFn&&doCommitCall>preflightCall&&doCommitFn>=0&&batchCommitCall>doCommitFn,'commitFn='+commitFn+' preflight='+preflightCall+' doCommitCall='+doCommitCall+' doCommitFn='+doCommitFn+' batchCommit='+batchCommitCall);
 t('allReadyRequired',js.indexOf('d.allReady!==true',preflightCall)>=0);
 t('blockedStopsCommit',js.indexOf("Preview: ")>=0&&js.indexOf('blockedSummary')>=0);
 t('selectedStagedOnly',js.indexOf('selectedStaged')>=0&&js.indexOf('reservations()')>=0);
 t('bounded20',js.indexOf('rows.length>20')>=0);
 t('singlePreflightRpc',js.split('PlanningWorkspaceRpc_batchPreflight').length-1===1);
 t('singleBatchRpc',js.split('PlanningWorkspaceRpc_batchCommit').length-1===1);
 t('noDirectSheetRead',js.indexOf('SpreadsheetApp')<0);
 t('noDirectSheetWrite',js.indexOf('setValue')<0&&js.indexOf('setValues')<0);
 t('refreshAfterCommit',js.indexOf("c.load('load')")>=0);
 t('partialOutcomeVisible',js.indexOf("not committed")>=0);
 t('revisionHydrationDelegatedToRpc',js.indexOf('expectedRevision')<0);
 t('previewTelemetry',js.indexOf('__AMS_WORKSPACE_LAST_BATCH_PREFLIGHT')>=0);
 t('commitTelemetry',js.indexOf('__AMS_WORKSPACE_LAST_BATCH_COMMIT')>=0);
 t('noLiveActionDuringTest',true);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_BATCH_COMMIT_TEST_BUILD||PLANNING_WORKSPACE_BATCH_COMMIT_UI_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveCommitsPerformed:false,roadmapLayer:'Batch Planning / Workspace UI preflight-first'}};Logger.log(JSON.stringify(out,null,2));return out;
}
