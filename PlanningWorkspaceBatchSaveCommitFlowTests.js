/** FILE: PlanningWorkspaceBatchSaveCommitFlowTests.gs
 * BUILD: 2026-09-19_WORKSPACE_BATCH_SAVE_COMMIT_FLOW_R1
 * RUN: RUN_WORKSPACE_BATCH_SAVE_COMMIT_FLOW_REGRESSION
 */
function RUN_WORKSPACE_BATCH_SAVE_COMMIT_FLOW_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),d=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('saveAllIsBatchRpc',c.indexOf('.PlanningWorkspaceRpc_saveConceptsBatch(payload)')>=0);
 t('savedConceptsAppliedLocally',c.indexOf('d.localApplyReservation(x)')>=0);
 t('generatedStateClearedAfterBatchSave',c.indexOf('state.generatedConceptReservations=[]')>=0&&c.indexOf('state.batchGeneratedConcepts=[]')>=0);
 t('savedConceptsRemainSelectableForBatchCommit',b.indexOf('function selectedConcept()')>=0&&b.indexOf('reservations().forEach')>=0);
 t('batchCommitStillRequiresPreview',b.indexOf('PlanningWorkspaceRpc_batchPreflight')>=0&&b.indexOf('Confirm plan selected')>=0);
 t('batchCommitStillBounded20',b.indexOf('Maximum 20 concepts per batch.')>=0);
 t('individualPlanStillAvailable',d.indexOf("btn.textContent='Plan'")>=0);
 t('saveAllDoesNotFinalPlan',c.substring(c.indexOf('function saveAllGeneratedConcepts'),c.indexOf('function generatedConceptById')).indexOf('PlanningWorkspaceRpc_commit')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_BATCH_SAVE_COMMIT_FLOW_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{contract:'Save all persists preliminary concepts only; canonical planning remains explicit Preview -> Confirm, with individual Plan retained.'}};console.info(JSON.stringify(out,null,2));return out;
}