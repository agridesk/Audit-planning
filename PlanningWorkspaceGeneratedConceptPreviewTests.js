/** FILE: PlanningWorkspaceGeneratedConceptPreviewTests.gs
 * BUILD: 2026-09-19_WORKSPACE_GENERATED_CONCEPT_PREVIEW_R1
 * RUN: RUN_WORKSPACE_GENERATED_CONCEPT_PREVIEW_REGRESSION
 */
function RUN_WORKSPACE_GENERATED_CONCEPT_PREVIEW_REGRESSION(){
 var api=getBatchPlanningConceptV5.toString(),helper=BatchPlanningManagerApi_reservations_.toString(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('apiReturnsConceptReservations',api.indexOf('conceptReservations:BatchPlanningManagerApi_reservations_')>=0);
 t('reservationPayloadUsesScheduledDays',helper.indexOf('result.days')>=0&&helper.indexOf('day.conceptAudits')>=0);
 t('reservationPayloadCarriesAuditIdentity',helper.indexOf("auditId:String(a.auditId")>=0);
 t('reservationPayloadCarriesAuditor',helper.indexOf('auditorEmail:email')>=0);
 t('reservationPayloadCarriesDateTimeBlocks',helper.indexOf("date:String(day.date")>=0&&helper.indexOf("start:String(a.startTime")>=0&&helper.indexOf("end:String(a.endTime")>=0);
 t('reservationPayloadIsReadOnly',helper.indexOf('readOnlyGenerated:true')>=0);
 t('clientStoresGeneratedPreview',c.indexOf('generatedConceptReservations')>=0);
 t('calendarMergesSavedAndGeneratedConcepts',c.indexOf('function visibleConcepts()')>=0&&c.indexOf('visibleConcepts().forEach')>=0);
 t('generatedPreviewTriggersCalendarRender',c.indexOf('window.__AMS_WORKSPACE_LAST_BATCH_GENERATED_CONCEPT=res;renderCalendar()')>=0);
 t('uiCallsItPreview',c.indexOf('Concept preview:')>=0);
 t('generationStillNoSaveRpc',c.substring(c.indexOf('function generateSelectedConcept()'),c.indexOf('function metricWall')).indexOf('PlanningWorkspaceRpc_saveConcept')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_GENERATED_CONCEPT_PREVIEW_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Generated period batch concept is immediately visible in the planning grid as a read-only preview. Generation itself performs no planning or concept-reservation write.'}};console.info(JSON.stringify(out,null,2));return out;
}