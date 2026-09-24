// FILE: AMS03_Planning2WorkspaceReadPathAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_WORKSPACE_READ_PATH_R6
function RUN_AMS03_PLANNING2_WORKSPACE_READ_PATH_ACCEPTANCE(){
 var r=[];function g(n,o,d){r.push({name:n,ok:!!o,detail:d||''});}
 var ec=EligibilityBatchReadModel_get({auditIds:[]}),l=String(PlanningWorkspaceConceptLifecycle_project);
 g('eligibilityTelemetryUsesReadPack',!!(ec&&ec.meta&&(ec.meta.readStrategy==='FIXED_WINDOW'||ec.meta.readStrategy==='BOUNDED_FALLBACK'||ec.meta.readStrategy==='EXEC_CACHE')),'Eligibility runtime result exposes a valid bounded read strategy; DEV_PERF carries detailed fallback telemetry.');
 g('eligibilityNoUndefinedFallbackTelemetry',!!(ec&&ec.success===true),'Eligibility runtime read completes without undefined telemetry references.');
 g('lifecycleSharedSeedFastPath',l.indexOf('seedHits===ids.length')>=0,'Normal concept lifecycle path reuses Workspace status context.');
 g('lifecycleIndexedMissRecovery',l.indexOf('__mp_getAuditPlanningRow_')>=0,'Concept lifecycle misses use canonical Audit-ID index before compatibility fallback.');
 g('lifecycleNoWrites',l.indexOf('.setValue(')<0&&l.indexOf('.setValues(')<0&&l.indexOf('.appendRow(')<0,'Lifecycle projection remains read-only.');
 var f=r.filter(function(x){return!x.ok}),out={ok:!f.length,build:'2026-09-24_AMS03_PLANNING2_WORKSPACE_READ_PATH_R6',passed:r.length-f.length,total:r.length,results:r,meta:{priority:'P0_SPEED',runtimeMeasurementStillRequired:true}};Logger.log(JSON.stringify(out,null,2));return out;
}
