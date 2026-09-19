/** FILE: PlanningWorkspaceConceptNavigationStateTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_NAV_STATE_R2_TEST_FIX
 * RUN: RUN_WORKSPACE_CONCEPT_NAV_STATE_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_NAV_STATE_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];function t(n,v){r.push({name:n,ok:!!v});}var bindStart=c.indexOf('function bind(){'),bindEnd=c.indexOf('function boot(){'),bind=bindStart>=0&&bindEnd>bindStart?c.substring(bindStart,bindEnd):'';
 t('savedConceptMirrorExists',c.indexOf('savedConceptReservations:[]')>=0);
 t('reservationsMergeOverlayAndMirror',c.indexOf('live.concat(mirror).forEach')>=0);
 t('saveAllCopiesToMirror',c.indexOf('state.savedConceptReservations=saved.slice()')>=0);
 t('serverLoadRefreshesMirror',c.indexOf('state.savedConceptReservations=loadedSaved.slice()')>=0);
 t('generatedStateIndependent',c.indexOf('generatedConceptReservations:[]')>=0);
 t('visibleConceptsMergesSavedGenerated',c.indexOf('reservations().concat(generatedConcepts())')>=0);
 t('calendarAuditorsDerivedFromVisibleConcepts',c.indexOf('visibleConcepts().forEach')>=0);
 t('backWeekRenderOnly',c.indexOf("state.gridStart=addDays(state.gridStart,-7);renderCalendar()")>=0);
 t('forwardWeekRenderOnly',c.indexOf("state.gridStart=addDays(state.gridStart,7);renderCalendar()")>=0);
 t('navigationDoesNotMutateSavedMirror',bind.indexOf("el('prevMonth').addEventListener('click',function(){state.gridStart=addDays(state.gridStart,-7);renderCalendar()})")>=0&&bind.indexOf("el('nextMonth').addEventListener('click',function(){state.gridStart=addDays(state.gridStart,7);renderCalendar()})")>=0&&bind.indexOf('savedConceptReservations')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_CONCEPT_NAV_STATE_R2_TEST_FIX',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{rca:'Saved concepts depended on mutable overlay lifecycle. They now have an independent client mirror; week navigation only changes gridStart.'}};console.info(JSON.stringify(out,null,2));return out;
}