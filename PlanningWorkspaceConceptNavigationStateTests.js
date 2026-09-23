/** FILE: PlanningWorkspaceConceptNavigationStateTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_NAV_STATE_R4_CONCEPT_STORE
 * RUN: RUN_WORKSPACE_CONCEPT_NAV_STATE_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_NAV_STATE_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];function t(n,v){r.push({name:n,ok:!!v});}var bindStart=c.indexOf('function bind(){'),bindEnd=c.indexOf('window.PlanningWorkspaceClient=',bindStart),bind=bindStart>=0&&bindEnd>bindStart?c.substring(bindStart,bindEnd):'';
 t('conceptStoreExists',c.indexOf('conceptStore:{generated:{},saved:{}}')>=0);
 t('reservationsUseConceptStore',c.indexOf("putConcept('saved',x)")>=0&&c.indexOf('Object.keys(s.saved)')>=0);
 t('saveAllPromotesToSavedStore',c.indexOf("putConcept('saved',x)")>=0);
 t('serverLoadRefreshesSavedStore',c.indexOf('state.savedConceptReservations=loadedSaved.slice()')>=0);
 t('generatedStateIndependent',c.indexOf('conceptStore:{generated:{},saved:{}}')>=0);
 t('visibleConceptsMergesSavedGenerated',c.indexOf('Object.keys(s.saved)')>=0&&c.indexOf('Object.keys(s.generated)')>=0);
 t('calendarAuditorsDerivedFromVisibleConcepts',c.indexOf('visibleConcepts().forEach')>=0);
 t('backWeekRenderOnly',c.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0);
 t('forwardWeekRenderOnly',c.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0);
 t('navigationDoesNotReloadOrMutateConceptStore',bind.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0&&bind.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0&&bind.indexOf('PlanningWorkspaceRpc_bootstrap')<0&&bind.indexOf('conceptStore().saved=')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-23_WORKSPACE_CONCEPT_NAV_STATE_R4_CONCEPT_STORE',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{rca:'Saved concepts depended on mutable overlay lifecycle. They now have an independent client mirror; week navigation only changes gridStart.'}};console.info(JSON.stringify(out,null,2));return out;
}