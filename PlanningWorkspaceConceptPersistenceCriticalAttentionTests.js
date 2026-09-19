/** FILE: PlanningWorkspaceConceptPersistenceCriticalAttentionTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_PERSISTENCE_CRITICAL_R1
 * RUN: RUN_WORKSPACE_CONCEPT_PERSISTENCE_CRITICAL_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_PERSISTENCE_CRITICAL_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('criticalAttentionSurfacePresent',h.indexOf('id="batchCriticalAttention"')>=0);
 t('criticalAttentionRenderedSeparately',c.indexOf('function renderCriticalBatchAttention')>=0);
 t('criticalAttentionSaysActionRequired',c.indexOf('ACTION REQUIRED')>=0);
 t('criticalAttentionSaysNotPlanned',c.indexOf('NOT PLANNED')>=0);
 t('exclusionReasonsListed',c.indexOf("issues.map(function(x)")>=0);
 t('calendarAuditorsIncludeVisibleConcepts',c.indexOf('function calendarAuditors()')>=0&&c.indexOf('visibleConcepts().forEach')>=0);
 t('calendarUsesConceptAwareAuditors',c.indexOf('var auditors=calendarAuditors(),focus=')>=0);
 t('savedReservationsRemainVisibleSource',c.indexOf('reservations().concat(generatedConcepts())')>=0);
 t('weekNavigationNoReload',c.indexOf("state.gridStart=addDays(state.gridStart,7);load(")<0);
 t('saveAllLocalReservationsRetained',c.indexOf('d.localApplyReservation(x)')>=0);
 t('generatedDragRetained',c.indexOf('function moveGeneratedConcept')>=0);
 t('noExtraRpcForWeekSwitch',c.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_CONCEPT_PERSISTENCE_CRITICAL_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}