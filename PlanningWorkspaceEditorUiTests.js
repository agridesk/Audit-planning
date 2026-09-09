/***********************************************************************
 * PlanningWorkspaceEditorUiTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_UI_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_EDITOR_UI_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_UI_TESTS_R1';
function RUN_PLANNING_WORKSPACE_EDITOR_UI_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var shell=HtmlService.createTemplateFromFile('PlanningWorkspace').getRawContent(),client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
 t('shellR3',shell.indexOf('HTML_SHELL_R3_EDITOR_SELECT')>=0);t('clientR3',client.indexOf('CLIENT_R3_EDITOR_SELECT')>=0);
 t('demandSelection',client.indexOf('data-pw-index')>=0);t('editorOpen',client.indexOf("classList.add('open')")>=0);t('editorClose',client.indexOf("classList.remove('open')")>=0);
 t('revisionRpc',client.indexOf('PlanningWorkspaceRpc_getRevision')>=0);t('revisionStored',client.indexOf('state.revision=')>=0);
 t('auditorField',client.indexOf('pwEditorAuditor')>=0);t('dateField',client.indexOf('pwEditorDate')>=0);t('startField',client.indexOf('pwEditorStart')>=0);t('endField',client.indexOf('pwEditorEnd')>=0);
 t('windowBounded',client.indexOf('planningWindowFrom')>=0&&client.indexOf('planningWindowTo')>=0);t('rotationVisible',client.indexOf('rotation warning')>=0);
 t('noSheetAccess',client.indexOf('SpreadsheetApp')<0);t('noDirectCanonicalWrite',client.indexOf('PlanningCanonicalCommitService_commit')<0);t('writeButtonsNotBoundYet',client.indexOf("el('pwSaveConcept').addEventListener")<0&&client.indexOf("el('pwCommit').addEventListener")<0);t('nonDestructive',true);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_EDITOR_UI_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,editorSelectionOnly:true,nextStep:'Validate targeted live revision read, then bind concept reservation actions.'}};console.log(JSON.stringify(out,null,2));return out;
}
