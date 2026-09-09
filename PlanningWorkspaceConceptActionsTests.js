/***********************************************************************
 * PlanningWorkspaceConceptActionsTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_ACTIONS_TESTS_R2_MULTI_BLOCK
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_ACTIONS_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_ACTIONS_TESTS_R2_MULTI_BLOCK';
function RUN_PLANNING_WORKSPACE_CONCEPT_ACTIONS_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  t('clientR6',src.indexOf('CLIENT_R6_CANONICAL_SAVE_MULTI_BLOCK')>=0);
  t('saveFunction',src.indexOf('function saveConcept()')>=0);t('releaseFunction',src.indexOf('function releaseConcept()')>=0);
  t('saveRpc',src.indexOf('PlanningWorkspaceRpc_saveConcept(p)')>=0);t('releaseRpc',src.indexOf('PlanningWorkspaceRpc_releaseConcept({auditId:state.selected.auditId')>=0);
  t('revisionRequired',src.indexOf("if(!state.revision)throw new Error('Revision not loaded')")>=0);t('auditorRequired',src.indexOf("if(!auditor)throw new Error('Select an auditor')")>=0);
  t('multiBlockCollection',src.indexOf('function collectBlocks()')>=0);t('atLeastOneBlock',src.indexOf("if(!blocks.length)throw new Error('Add at least one planning block')")>=0);t('validBlockTimes',src.indexOf('Enter a valid start and end time for every block')>=0);t('fullWorkloadGuard',src.indexOf('is below required')>=0);
  t('sourceRevision',src.indexOf('sourceRevision:state.revision')>=0);t('saveClosesEditor',src.indexOf("status('Concept saved');closeEditor();refreshOverlays();")>=0);t('releaseClosesEditor',src.indexOf('closeEditor();refreshOverlays();')>=0);
  t('saveButtonBound',src.indexOf("el('pwSaveConcept').addEventListener('click',saveConcept)")>=0);t('releaseButtonBound',src.indexOf("el('pwReleaseConcept').addEventListener('click',releaseConcept)")>=0);
  t('pendingPlanningGuard',src.indexOf('canCanonicalPlan(state.selected)')>=0);t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);t('noLegacyPlanningWrite',src.indexOf('Planning_executeWrite_')<0&&src.indexOf('planAuditV5_')<0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_CONCEPT_ACTIONS_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,conceptActionsBound:true,multiBlock:true}};console.log(JSON.stringify(out,null,2));return out;
}
