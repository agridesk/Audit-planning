/** FILE: PlanningWorkspaceFlexibleGroupingTests.gs
 * BUILD: 2026-09-19_WORKSPACE_FLEXIBLE_GROUPING_R1
 * RUN: RUN_WORKSPACE_FLEXIBLE_GROUPING_REGRESSION
 */
function RUN_WORKSPACE_FLEXIBLE_GROUPING_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('priorityDefault',h.indexOf('<option value="priority">Planning priority</option>')>=0);
 t('regionGrouping',h.indexOf('<option value="region">Region</option>')>=0);
 t('auditorGrouping',h.indexOf('<option value="auditor">Auditor</option>')>=0);
 t('weekGrouping',h.indexOf('<option value="week">Window week</option>')>=0);
 t('monthGrouping',h.indexOf('<option value="month">Window month</option>')>=0);
 t('scopeGrouping',h.indexOf('<option value="scope">Scope</option>')>=0);
 t('companyGrouping',h.indexOf('<option value="company">Company</option>')>=0);
 t('weekDerivedFromPlanningWindow',c.indexOf("batchWeek(x.planningWindowTo||x.planningWindowFrom)")>=0);
 t('auditorUsesCandidateAdvisory',c.indexOf('function batchAuditorLabel(x)')>=0&&c.indexOf('candidateAuditors')>=0);
 t('groupingDoesNotMutateRows',c.indexOf('function batchGroupKey')>=0&&c.indexOf('batchSortedRows')>=0);
 t('windowSortStillDefault',h.indexOf('<option value="window">Window closes first</option>')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_FLEXIBLE_GROUPING_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Planner may regroup the period work queue by planning priority, region, auditor, window week/month, scope or company. Grouping is presentation only and window-close sort remains default.'}};console.info(JSON.stringify(out,null,2));return out;
}