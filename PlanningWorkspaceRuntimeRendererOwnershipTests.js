/** FILE: PlanningWorkspaceRuntimeRendererOwnershipTests.gs
 * BUILD: 2026-09-19_WORKSPACE_RUNTIME_RENDERER_OWNERSHIP_R1
 * RUN: RUN_WORKSPACE_RUNTIME_RENDERER_OWNERSHIP_REGRESSION
 */
function RUN_WORKSPACE_RUNTIME_RENDERER_OWNERSHIP_REGRESSION(){
 var u=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceUxStabilizer.js').getContent();
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
 var r=[];function t(n,v){r.push({name:n,ok:!!v});}
 t('uxHasNoPrivateConceptIndex',u.indexOf('conceptByDate')<0);
 t('uxHasNoOverlayReservationRenderer',u.indexOf('o.reservations')<0);
 t('uxDelegatesCanonicalRender',u.indexOf("c.renderCalendar()")>=0);
 t('uxDoesNotBuildCalendarHtml',u.indexOf("grid-corner")<0);
 t('clientOwnsCalendarHtml',c.indexOf("grid-corner")>=0);
 t('clientOwnsVisibleConcepts',c.indexOf('function visibleConcepts()')>=0);
 t('clientRenderUsesSnapshot',c.indexOf('var snapshot=calendarSnapshot()')>=0);
 t('clientExportsRenderer',c.indexOf('renderCalendar:renderCalendar')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_RUNTIME_RENDERER_OWNERSHIP_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{rca:'PlanningWorkspaceUxStabilizer replaced the canonical calendar renderer during navigation and rendered only overlays.reservations. Unsaved generated concepts exist in the client concept store, so navigation rendered a stale second data model and made generated concepts disappear. The stabilizer now delegates to PlanningWorkspaceClient.renderCalendar; one renderer and one concept model remain.'}};console.info(JSON.stringify(out,null,2));return out;
}