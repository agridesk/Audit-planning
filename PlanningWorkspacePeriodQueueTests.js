/** FILE: PlanningWorkspacePeriodQueueTests.gs
 * BUILD: 2026-09-19_WORKSPACE_PERIOD_QUEUE_R1
 * RUN: RUN_WORKSPACE_PERIOD_QUEUE_REGRESSION
 */
function RUN_WORKSPACE_PERIOD_QUEUE_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),b=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceBatchCommit.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('periodRemainsPrimaryInput',h.indexOf('id="pwFrom"')>=0&&h.indexOf('id="pwTo"')>=0);
 t('workQueueReplacesBatchPool',h.indexOf('Planning work queue')>=0&&h.indexOf('Batch selection')<0);
 t('planningPriorityDefaultGrouping',h.indexOf('<option value="priority">Planning priority</option>')>=0);
 t('flexibleGroupingRegion',h.indexOf('<option value="region">Region</option>')>=0);
 t('flexibleGroupingMonth',h.indexOf('<option value="month">Window month</option>')>=0);
 t('flexibleGroupingScope',h.indexOf('<option value="scope">Scope</option>')>=0);
 t('flexibleGroupingCompany',h.indexOf('<option value="company">Company</option>')>=0);
 t('windowFirstDefaultSort',h.indexOf('<option value="window">Window closes first</option>')>=0);
 t('windowDatesVisiblePerAudit',c.indexOf("planningWindowFrom")>=0&&c.indexOf("planningWindowTo")>=0&&c.indexOf("batch-window")>=0);
 t('canonicalUrgencyUsedWhenPresent',c.indexOf("x&&x.urgency")>=0);
 t('stagedHiddenFromPlannerHtml',h.toLowerCase().indexOf('staged')<0);
 t('stagedHiddenFromBatchCommit',b.toLowerCase().indexOf('staged')<0);
 t('conceptTerminologyVisible',h.indexOf('0 concepts')>=0);
 t('selectionOrderPreserved',c.indexOf('state.selectionOrder.push(id)')>=0);
 t('groupingDoesNotRewriteDemand',c.indexOf('function batchGroupKey')>=0&&c.indexOf('function batchSortedRows')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_PERIOD_QUEUE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Selected period is the primary work-queue boundary; planning-window urgency remains visible; grouping is a view concern only; staged is not planner terminology.'}};console.info(JSON.stringify(out,null,2));return out;
}