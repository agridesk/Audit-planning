/** FILE: PlanningWorkspaceConceptExclusionVisibilityTests.gs
 * BUILD: 2026-09-19_WORKSPACE_CONCEPT_EXCLUSION_VISIBILITY_R1
 * RUN: RUN_WORKSPACE_CONCEPT_EXCLUSION_VISIBILITY_REGRESSION
 */
function RUN_WORKSPACE_CONCEPT_EXCLUSION_VISIBILITY_REGRESSION(){
 var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),e=String(BatchPlanningCandidateEngine_Collect),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('qualificationCanReject',e.indexOf('AUDITOR_NOT_QUALIFIED')>=0);
 t('rotationCanReject',e.indexOf('ROTATION_HARD_BLOCK')>=0);
 t('availabilityCanReject',e.indexOf('NO_HARD_AVAILABLE_DAY')>=0);
 t('windowCanReject',e.indexOf('OUTSIDE_PLANNING_WINDOW')>=0);
 t('uiReadsRejectedReasons',c.indexOf("x.reason||'REJECTED'")>=0);
 t('uiReadsUnresolvedReasons',c.indexOf("x.reason||'UNRESOLVED'")>=0);
 t('uiReadsPlannerAllocationReasons',c.indexOf("x.reason||'PLANNER_ALLOCATION_REQUIRED'")>=0);
 t('uiLabelsMissingSelectedAudit',c.indexOf("' · NOT PLANNED: '")>=0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_WORKSPACE_CONCEPT_EXCLUSION_VISIBILITY_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'When a selected audit is absent from the generated concept, the planner must see the exact backend rejection/unresolved reason instead of silently losing the audit.'}};console.info(JSON.stringify(out,null,2));return out;
}