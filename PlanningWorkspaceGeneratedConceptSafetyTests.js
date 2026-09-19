/** FILE: PlanningWorkspaceGeneratedConceptSafetyTests.gs
 * BUILD: 2026-09-19_WORKSPACE_GENERATED_CONCEPT_SAFETY_R1
 * RUN: RUN_WORKSPACE_GENERATED_CONCEPT_SAFETY_REGRESSION
 */
function RUN_WORKSPACE_GENERATED_CONCEPT_SAFETY_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),api=getBatchPlanningConceptV5.toString(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('generatedConceptIsPreviewOnly',c.indexOf('read-only concept')>=0&&c.indexOf('preview only')>=0);
 t('generatedConceptNotInSavedReservationSource',b.indexOf('function reservations()')>=0&&b.indexOf('generatedConceptReservations')<0);
 t('batchConfirmationUsesSavedConceptsOnly',b.indexOf('Preview saved concepts')>=0);
 t('generationNoSaveRpc',c.substring(c.indexOf('function generateSelectedConcept()'),c.indexOf('function metricWall')).indexOf('PlanningWorkspaceRpc_saveConcept')<0);
 t('generationNoCommitRpc',c.substring(c.indexOf('function generateSelectedConcept()'),c.indexOf('function metricWall')).indexOf('PlanningWorkspaceRpc_batchCommit')<0);
 t('apiNoWrites',api.indexOf('writesPerformed:false')>=0);
 t('weekendOverrideNotHardcoded',b.indexOf('allowWeekendOverride:true')<0);
 t('explicitConfirmationStillPresent',b.indexOf('Confirm plan selected')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_GENERATED_CONCEPT_SAFETY_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Generated batch concepts remain preview-only until separately persisted/reviewed; canonical batch confirmation only consumes saved concepts; weekend override is never silently granted.'}};console.info(JSON.stringify(out,null,2));return out;
}