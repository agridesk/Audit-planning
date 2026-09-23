/** FILE: PlanningWorkspaceGeneratedNavigationTests.gs
 * BUILD: 2026-09-19_WORKSPACE_GENERATED_NAVIGATION_R2_CONCEPT_STORE
 * RUN: RUN_WORKSPACE_GENERATED_NAVIGATION_REGRESSION
 */
function RUN_WORKSPACE_GENERATED_NAVIGATION_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('generatedStateOwnedOutsideOverlay',c.indexOf('conceptStore:{generated:{},saved:{}}')>=0);
 t('generatedGetterUsesPersistentState',c.indexOf('function generatedConcepts(){var g=conceptStore().generated')>=0);
 t('applyGeneratedWritesPersistentState',c.indexOf('conceptStore().generated={}')>=0&&c.indexOf("putConcept('generated',x)")>=0);
 t('weekNavigationOnlyRenders',c.indexOf("el('nextMonth').addEventListener('click',function(){state.gridStart=addDays(state.gridStart,7);renderCalendar()})")>=0);
 t('previousWeekOnlyRenders',c.indexOf("el('prevMonth').addEventListener('click',function(){state.gridStart=addDays(state.gridStart,-7);renderCalendar()})")>=0);
 t('navigationDoesNotReload',c.indexOf("state.gridStart=addDays(state.gridStart,7);load(")<0);
 t('generatedStoreCanonicalClientOwner',c.indexOf('conceptStore().generated')>=0);
 t('dragEditStillPresent',c.indexOf('function moveGeneratedConcept')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-23_WORKSPACE_GENERATED_NAVIGATION_R2_CONCEPT_STORE',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}