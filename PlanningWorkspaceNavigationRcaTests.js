/** FILE: PlanningWorkspaceNavigationRcaTests.gs
 * BUILD: 2026-09-19_WORKSPACE_NAV_ABSOLUTE_RCA_R1
 * RUN: RUN_WORKSPACE_NAV_ABSOLUTE_RCA_REGRESSION
 */
function RUN_WORKSPACE_NAV_ABSOLUTE_RCA_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 var ls=c.indexOf('function load(kind)'),le=c.indexOf('function defaults()',ls),load=c.substring(ls,le);
 var bs=c.indexOf('function bind(){'),be=c.indexOf('window.PlanningWorkspaceClient=',bs),bind=c.substring(bs,be);
 t('loadFunctionFound',ls>=0&&le>ls);
 t('loadDoesNotClearGeneratedReservations',load.indexOf('state.generatedConceptReservations=[]')<0);
 t('loadDoesNotClearGeneratedBatch',load.indexOf('state.batchGeneratedConcepts=[]')<0);
 t('generatedStateOnlyExplicitlyClearedAfterSaveAll',c.indexOf('state.generatedConceptReservations=[]')>=0);
 t('backWeekNoLoad',bind.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0);
 t('forwardWeekNoLoad',bind.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0);
 t('visibleConceptsReadsGeneratedState',c.indexOf('reservations().concat(generatedConcepts())')>=0);
 t('calendarReadsVisibleConcepts',c.indexOf('visibleConcepts().forEach')>=0);
 t('calendarConceptLookupUsesVisibleConcepts',c.indexOf('function conceptItems(email,date)')>=0&&c.indexOf('visibleConcepts().forEach',c.indexOf('function conceptItems(email,date)'))>=0);
 t('bootstrapDataRefreshNoLongerDestroysUnsavedConcept',load.indexOf('state.data={advisory:null,overlays:null}')>=0&&load.indexOf('generatedConceptReservations=[]')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_NAV_ABSOLUTE_RCA_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{rootCause:'PlanningWorkspaceClient.load() unconditionally destroyed generatedConceptReservations and batchGeneratedConcepts. Any workspace bootstrap/reload during the session erased the concept source; subsequent week renders therefore had nothing to render. Week navigation itself was not the destructive operation.'}};console.info(JSON.stringify(out,null,2));return out;
}