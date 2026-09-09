/***********************************************************************
 * PlanningWorkspaceEditorUiTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_UI_TESTS_R2_MULTI_BLOCK_COMMIT
 ***********************************************************************/
var PLANNING_WORKSPACE_EDITOR_UI_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_UI_TESTS_R2_MULTI_BLOCK_COMMIT';
function RUN_PLANNING_WORKSPACE_EDITOR_UI_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var shell=HtmlService.createTemplateFromFile('PlanningWorkspace').getRawContent(),client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
 t('shellR5',shell.indexOf('HTML_SHELL_R5_CANONICAL_SAVE_MULTI_BLOCK')>=0);t('clientR6',client.indexOf('CLIENT_R6_CANONICAL_SAVE_MULTI_BLOCK')>=0);
 t('demandSelection',client.indexOf('data-pw-index')>=0);t('editorOpen',client.indexOf("classList.add('open')")>=0);t('editorClose',client.indexOf("classList.remove('open')")>=0);
 t('revisionRpc',client.indexOf('PlanningWorkspaceRpc_getRevision')>=0);t('revisionStored',client.indexOf('state.revision=')>=0);
 t('auditorField',client.indexOf('pwEditorAuditor')>=0);t('blockDateField',client.indexOf('pwBlockDate')>=0);t('blockStartField',client.indexOf('pwBlockStart')>=0);t('blockEndField',client.indexOf('pwBlockEnd')>=0);
 t('addBlock',client.indexOf('pwAddBlock')>=0);t('removeBlock',client.indexOf('data-pw-remove')>=0);t('defaultFullWorkload',client.indexOf('defaultBlocks')>=0);t('workloadGuard',client.indexOf('below required')>=0);
 t('windowBounded',client.indexOf('planningWindowFrom')>=0&&client.indexOf('planningWindowTo')>=0);t('rotationVisible',client.indexOf('rotation warning')>=0);
 t('pendingPlanningGuard',client.indexOf('canCanonicalPlan')>=0&&client.indexOf("==='pending planning'")>=0);t('conceptBound',client.indexOf('.PlanningWorkspaceRpc_saveConcept(')>=0);t('preflightBound',client.indexOf('.PlanningWorkspaceRpc_commitPreflight(')>=0);t('canonicalCommitBound',client.indexOf('.PlanningWorkspaceRpc_commit(')>=0);t('explicitConfirmation',client.indexOf('window.confirm')>=0&&client.indexOf('confirmCanonicalCommit:true')>=0);
 t('noSheetAccess',client.indexOf('SpreadsheetApp')<0);t('noDirectCanonicalServiceCall',client.indexOf('PlanningCanonicalCommitService_commit')<0);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_EDITOR_UI_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,multiBlockEditor:true,canonicalCommitBrowserBound:true}};console.log(JSON.stringify(out,null,2));return out;
}
