/***********************************************************************
 * PlanningWorkspaceBatchCommitUiTests.js
 * BUILD: 2026-09-16_ROADMAP_2_4_WORKSPACE_BATCH_COMMIT_UI_TESTS_R1
 * Non-destructive source/wiring regression.
 ***********************************************************************/
var PLANNING_WORKSPACE_BATCH_COMMIT_UI_TEST_BUILD='2026-09-16_ROADMAP_2_4_WORKSPACE_BATCH_COMMIT_UI_TESTS_R1';
function RUN_PLANNING_WORKSPACE_BATCH_COMMIT_UI_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var html=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
 var js=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent();
 t('workspaceLoadsEnhancer',html.indexOf("PlanningWorkspaceBatchCommit.js")>=0);
 t('enhancerBuild',js.indexOf('WORKSPACE_BATCH_COMMIT_UI_R1')>=0);
 t('batchRpcUsed',js.indexOf('PlanningWorkspaceRpc_batchCommit')>=0);
 t('selectedStagedOnly',js.indexOf('selectedStaged')>=0&&js.indexOf('reservations()')>=0);
 t('bounded20',js.indexOf('rows.length>20')>=0);
 t('singleBatchRpc',js.split('PlanningWorkspaceRpc_batchCommit').length-1===1);
 t('noDirectSheetRead',js.indexOf('SpreadsheetApp')<0);
 t('noDirectSheetWrite',js.indexOf('setValue')<0&&js.indexOf('setValues')<0);
 t('refreshAfterCommit',js.indexOf("c.load('load')")>=0);
 t('partialOutcomeVisible',js.indexOf("not committed")>=0);
 t('revisionHydrationDelegatedToRpc',js.indexOf('expectedRevision')<0);
 t('noLiveActionDuringTest',true);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_BATCH_COMMIT_UI_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveCommitsPerformed:false,roadmapLayer:'Batch Planning / Workspace UI'}};Logger.log(JSON.stringify(out,null,2));return out;
}
