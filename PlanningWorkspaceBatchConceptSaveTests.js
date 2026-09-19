/** FILE: PlanningWorkspaceBatchConceptSaveTests.gs
 * BUILD: 2026-09-19_WORKSPACE_BATCH_CONCEPT_SAVE_R1
 * RUN: RUN_WORKSPACE_BATCH_CONCEPT_SAVE_REGRESSION
 */
function RUN_WORKSPACE_BATCH_CONCEPT_SAVE_REGRESSION(){
 var html=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),rpc=String(PlanningWorkspaceRpc_saveConceptsBatch),svc=String(ConceptReservationCommandService_upsertBatch),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('saveAllButtonPresent',html.indexOf('id="saveAllGeneratedConcepts"')>=0);
 t('saveAllStartsDisabled',html.indexOf('id="saveAllGeneratedConcepts" class="btn" type="button" disabled')>=0);
 t('clientUsesSingleBatchRpc',client.indexOf('.PlanningWorkspaceRpc_saveConceptsBatch(payload)')>=0);
 t('clientDoesNotLoopSingleSave',client.substring(client.indexOf('function saveAllGeneratedConcepts'),client.indexOf('function generatedConceptById')).indexOf('PlanningWorkspaceRpc_saveConcept(')<0);
 t('rpcBulkRevisionRead',rpc.indexOf('PlanningRevisionTokenService_getMany')>=0);
 t('rpcCanonicalPreflightEach',rpc.indexOf('PWR_conceptPreflight_')>=0);
 t('batchMax20',svc.indexOf('maximum 20 batch items')>=0);
 t('singleBatchLock',svc.indexOf("Platform_withLock('concept-reservation:batch'")>=0);
 t('singleExistingSheetRead',svc.indexOf("sh.getRange(2,1,last-1,width).getValues()")>=0);
 t('singleBulkSheetWrite',svc.indexOf("sh.getRange(2,1,all.length,width).setValues")>=0);
 t('noFinalPlanningWrites',svc.indexOf('finalPlanningWrites:false')>=0);
 t('localMicrorefreshAfterSave',client.indexOf("d.localApplyReservation(x)")>=0&&client.indexOf("state.generatedConceptReservations=[]")>=0);
 t('noWorkspaceReloadAfterSave',client.substring(client.indexOf('function saveAllGeneratedConcepts'),client.indexOf('function generatedConceptById')).indexOf("load(")<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_BATCH_CONCEPT_SAVE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{performanceContract:'One browser RPC, one bulk revision read, one concept sheet read/write, one lock, local UI refresh; max 20 concepts.'}};console.info(JSON.stringify(out,null,2));return out;
}