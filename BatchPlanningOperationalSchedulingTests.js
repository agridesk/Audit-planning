/** FILE: BatchPlanningOperationalSchedulingTests.gs
 * BUILD: 2026-09-19_BATCH_OPERATIONAL_SCHEDULING_R1
 * RUN: RUN_BATCH_OPERATIONAL_SCHEDULING_REGRESSION
 */
function RUN_BATCH_OPERATIONAL_SCHEDULING_REGRESSION(){
 var sched=String(BatchPlanningDayScheduler_Build),alloc=String(BatchPlanningDayScheduler_allocateTime_),client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),drag=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent(),r=[];
 function t(n,v){r.push({name:n,ok:!!v});}
 t('weekendExcludedByDefault',sched.indexOf('allowWeekend=input.allowWeekend===true')>=0&&sched.indexOf('BatchPlanningDayScheduler_isWeekend_')>=0);
 t('weekendRequiresExplicitOverride',sched.indexOf('allowWeekend||!BatchPlanningDayScheduler_isWeekend_')>=0);
 t('travelReducesClockCapacity',sched.indexOf('clockCapacity')>=0&&sched.indexOf('travelMinutes')>=0);
 t('auditHoursStillLeading',sched.indexOf('9-day.auditHours')>=0);
 t('practicalStartRounded30',alloc.indexOf('BatchPlanningDayScheduler_roundUp_(start,30)')>=0);
 t('workdayEndsBy1700',alloc.indexOf('17*60')>=0);
 t('noExtraRouteCallForRounding',alloc.indexOf('BatchPlanningRouteMatrix')<0);
 t('generatedMoveIsLocal',client.indexOf('function moveGeneratedConcept')>=0&&client.indexOf('google.script.run')<client.indexOf('function moveGeneratedConcept'));
 t('generatedCardsDraggable',drag.indexOf('markGeneratedDraggable')>=0&&drag.indexOf("card.setAttribute('draggable','true')")>=0);
 t('generatedDropUsesLocalMove',drag.indexOf('moveGeneratedConcept')>=0);
 t('savedConceptLifecycleUntouched',drag.indexOf("btn.textContent='Plan'")>=0&&drag.indexOf("release.textContent='Release'")>=0);
 t('noSchedulerWrites',sched.indexOf('setValue(')<0&&sched.indexOf('setValues(')<0&&sched.indexOf('appendRow(')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_OPERATIONAL_SCHEDULING_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}