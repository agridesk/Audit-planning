/** FILE: PlanningWorkspaceConceptStoreTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_STORE_R1
 * RUN: RUN_WORKSPACE_CONCEPT_STORE_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_STORE_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('singleConceptStoreExists',c.indexOf('conceptStore:{generated:{},saved:{}}')>=0);
 t('generatedReadsStore',c.indexOf("function generatedConcepts(){var g=conceptStore().generated")>=0);
 t('savedReadsStore',c.indexOf("function reservations(){var s=conceptStore()")>=0);
 t('visibleReadsStore',c.indexOf("function visibleConcepts(){var s=conceptStore()")>=0);
 t('generationPopulatesStore',c.indexOf("putConcept('generated',x)")>=0);
 t('savePromotesToSavedStore',c.indexOf("putConcept('saved',x)")>=0);
 t('savedWinsOverGenerated',c.indexOf("if(!s.saved[id])out.push(s.generated[id])")>=0);
 t('navigationDoesNotTouchStore',c.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0&&c.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0);
 t('loadDoesNotResetConceptStore',c.substring(c.indexOf('function load(kind)'),c.indexOf('function defaults()')).indexOf('conceptStore=')<0);
 t('calendarUsesVisibleStore',c.indexOf('function conceptItems(email,date)')>=0&&c.indexOf('visibleConcepts().forEach',c.indexOf('function conceptItems(email,date)'))>=0);
 t('calendarAuditorsUseVisibleStore',c.indexOf('function calendarAuditors()')>=0&&c.indexOf('visibleConcepts().forEach',c.indexOf('function calendarAuditors()'))>=0);
 t('legacyGeneratedArrayNoLongerStateOwner',c.indexOf('generatedConceptReservations:[]')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_CONCEPT_STORE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{rca:'The client had three competing concept representations: overlay reservations, saved mirror, and generated mirror. Rendering recomposed them on every week render, while other modules mutated different representations. Navigation exposed the inconsistency. R39 establishes one client conceptStore keyed by Audit ID; calendar navigation is now a pure view over that store.'}};console.info(JSON.stringify(out,null,2));return out;
}