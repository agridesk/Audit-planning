// FILE: AMS03_Planning2WorkspaceContextHotPathAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_WORKSPACE_CONTEXT_HOTPATH_R1
// PURPOSE: Guard Workspace overlay miss recovery against whole Audit planning scans.

function RUN_AMS03_PLANNING2_WORKSPACE_CONTEXT_HOTPATH_ACCEPTANCE() {
  var src=String(PlanningWorkspaceAvailabilityContext_get);
  var results=[];
  function g(n,ok,d){results.push({name:n,ok:!!ok,detail:d||''});}
  g('sharedDemandFastReturn',src.indexOf('seedHits===ordered.length')>=0,'Normal bootstrap reuses shared decision context with zero recovery reads.');
  g('indexedMissRecovery',src.indexOf('__mp_getAuditPlanningRow_')>=0,'Missing slot context uses canonical audit-row index.');
  g('noFullScanBeforeIndexedPath',src.indexOf('__mp_getAuditPlanningRow_')<src.indexOf("__mp_getSheetDataCached_"),'Full-sheet compatibility fallback is behind indexed recovery.');
  g('indexedTelemetry',src.indexOf('indexedMissRecovery:true')>=0,'Runtime telemetry identifies indexed recovery.');
  g('noWrites',src.indexOf('.setValue(')<0&&src.indexOf('.setValues(')<0&&src.indexOf('.appendRow(')<0,'Read model remains read-only.');
  var failed=results.filter(function(x){return!x.ok;});
  var out={ok:failed.length===0,build:'2026-09-24_AMS03_PLANNING2_WORKSPACE_CONTEXT_HOTPATH_R1',passed:results.length-failed.length,total:results.length,results:results,meta:{priority:'P0_SPEED',canonicalOwner:'Audit planning row index',fullScanCompatibilityFallbackRetained:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
