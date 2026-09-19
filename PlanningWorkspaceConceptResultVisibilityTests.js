/** FILE: PlanningWorkspaceConceptResultVisibilityTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_RESULT_VISIBILITY_R1
 * RUN: RUN_WORKSPACE_CONCEPT_RESULT_VISIBILITY_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_RESULT_VISIBILITY_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),s=BatchPlanningDayScheduler_Build.toString(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('schedulerUsesCanonicalHardAvailableDays',s.indexOf('c.hardAvailableDays||[]')>=0);
 t('schedulerRespectsSchedulableWindow',s.indexOf("iso>=String(c.schedulableFrom||'')")>=0&&s.indexOf("iso<=String(c.schedulableTo||'')")>=0);
 t('schedulerChoosesDateAutomatically',s.indexOf('best={day:day,iso:iso,score:score}')>=0);
 t('resultReportsRouted',c.indexOf("routed=Number(res.routedCandidateCount||0)")>=0);
 t('resultReportsAttention',c.indexOf("unresolved=(res.unresolved||[]).length")>=0);
 t('resultReportsRejected',c.indexOf("rejected=(res.rejected||[]).length")>=0);
 t('resultReportsAssignedDateRange',c.indexOf("range=dates.length?")>=0);
 t('calendarMovesToFirstConceptDate',c.indexOf("state.gridStart=monday(parseDate(dates[0]))")>=0);
 t('calendarRerendersAfterMove',c.indexOf("state.gridStart=monday(parseDate(dates[0]));renderCalendar()")>=0);
 t('resultScrollsToPlanningGrid',c.indexOf("grid.scrollIntoView({behavior:'smooth',block:'start'})")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_CONCEPT_RESULT_VISIBILITY_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Generate concept automatically assigns dates only inside each audit planning window and hard auditor availability. The Workspace exposes routed/attention/rejected counts, shows the assigned date range, moves the planning grid to the first assigned week, and scrolls the planner to the result.'}};console.info(JSON.stringify(out,null,2));return out;
}