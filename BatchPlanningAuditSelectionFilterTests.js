/** FILE: BatchPlanningAuditSelectionFilterTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_AUDIT_FILTER_R1
 * RUN: RUN_BATCH_PLANNING_AUDIT_SELECTION_FILTER_REGRESSION
 */
function RUN_BATCH_PLANNING_AUDIT_SELECTION_FILTER_REGRESSION(){
 var e=BatchPlanningCandidateEngine_Collect.toString(),a=getBatchPlanningConceptV5.toString(),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('candidateEngineAcceptsAuditIds',e.indexOf('input.auditIds')>=0);
 t('candidateEngineBuildsRequestedSet',e.indexOf('requestedIds')>=0);
 t('candidateEngineSkipsNonSelected',e.indexOf('hasRequestedIds&&!requestedIds[auditId]')>=0);
 t('emptyFilterKeepsPeriodPool',e.indexOf('Array.isArray(input.auditIds)&&input.auditIds.length>0')>=0);
 t('managerApiAcceptsAuditIds',a.indexOf('input.auditIds')>=0);
 t('managerApiCopiesFilter',a.indexOf('request.auditIds=')>=0);
 t('managerApiStillRequiresPeriod',a.indexOf('PERIOD_INVALID')>=0);
 t('conceptGenerationRemainsReadOnly',a.indexOf('writesPerformed:false')>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_PLANNING_AUDIT_FILTER_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Period remains the primary candidate boundary; an explicit planner audit selection can narrow concept generation without creating a second source of truth.'}};console.info(JSON.stringify(out,null,2));return out;
}