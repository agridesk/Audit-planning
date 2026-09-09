/***********************************************************************
 * PlanningWorkspaceConceptActionsTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_ACTIONS_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_ACTIONS_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_ACTIONS_TESTS_R1';
function RUN_PLANNING_WORKSPACE_CONCEPT_ACTIONS_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  t('clientR4',src.indexOf('CLIENT_R4_CONCEPT_ACTIONS')>=0);
  t('saveFunction',src.indexOf('function saveConcept()')>=0);
  t('releaseFunction',src.indexOf('function releaseConcept()')>=0);
  t('saveRpc',src.indexOf('PlanningWorkspaceRpc_saveConcept(p)')>=0);
  t('releaseRpc',src.indexOf('PlanningWorkspaceRpc_releaseConcept({auditId:state.selected.auditId')>=0);
  t('revisionRequired',src.indexOf("if(!state.revision)throw new Error('Revision not loaded')")>=0);
  t('auditorRequired',src.indexOf("if(!auditor)throw new Error('Select an auditor')")>=0);
  t('dateRequired',src.indexOf("if(!date)throw new Error('Select a date')")>=0);
  t('timeRequired',src.indexOf("if(!start||!end)throw new Error('Enter start and end time')")>=0);
  t('timeOrderGuard',src.indexOf("if(end<=start)throw new Error('End time must be after start time')")>=0);
  t('sourceRevision',src.indexOf('sourceRevision:state.revision')>=0);
  t('saveClosesEditor',src.indexOf("status('Concept saved');closeEditor();load();")>=0);
  t('releaseClosesEditor',src.indexOf("closeEditor();load();")>=0);
  t('saveButtonBound',src.indexOf("el('pwSaveConcept').addEventListener('click',saveConcept)")>=0);
  t('releaseButtonBound',src.indexOf("el('pwReleaseConcept').addEventListener('click',releaseConcept)")>=0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noDirectCanonicalWrite',src.indexOf('Planning_executeWrite_')<0&&src.indexOf('planAuditV5_')<0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_CONCEPT_ACTIONS_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,conceptActionsBound:true,nextStep:'Run one controlled DEV concept save/release lifecycle test before exposing canonical Save planning.'}};console.log(JSON.stringify(out,null,2));return out;
}
