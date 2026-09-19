/** FILE: PlanningWorkspaceExplicitPlanningPeriodTests.gs
 * BUILD: 2026-09-19_WORKSPACE_EXPLICIT_PLANNING_PERIOD_R1
 * RUN: RUN_WORKSPACE_EXPLICIT_PLANNING_PERIOD_REGRESSION
 */
function RUN_WORKSPACE_EXPLICIT_PLANNING_PERIOD_REGRESSION(){
 var h=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent(),c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('explicitPlanFromPresent',h.indexOf('id="batchPlanFrom"')>=0);
 t('explicitPlanToPresent',h.indexOf('id="batchPlanTo"')>=0);
 t('searchPeriodStillSeparate',h.indexOf('id="pwFrom"')>=0&&h.indexOf('id="pwTo"')>=0);
 t('conceptPeriodFunctionExists',c.indexOf('function conceptPeriod()')>=0);
 t('generateRequiresValidPlanningPeriod',c.indexOf('periodOk=')>=0&&c.indexOf('||!periodOk')>=0);
 t('conceptUsesPlanFrom',c.indexOf('periodFrom:cp.from')>=0);
 t('conceptUsesPlanTo',c.indexOf('periodTo:cp.to')>=0);
 t('conceptNoLongerUsesSearchPeriod',c.indexOf('periodFrom:q.from,periodTo:q.to,auditIds:ids')<0);
 t('planningPeriodChangesRefreshActionState',c.indexOf("['batchPlanFrom','batchPlanTo']")>=0);
 t('initialPlanningPeriodDefaultsFromLoadedSearch',c.indexOf("if(pf&&!pf.value)pf.value=clean(req.from)")>=0&&c.indexOf("if(pt&&!pt.value)pt.value=clean(req.to)")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_EXPLICIT_PLANNING_PERIOD_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Audit search period and actual concept planning period are separate. The planner explicitly chooses Plan from/to; the engine may assign concrete dates only inside that planner-controlled period and each audit canonical planning window/availability.'}};console.info(JSON.stringify(out,null,2));return out;
}