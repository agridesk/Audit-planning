/***********************************************************************
 * FILE: AMS01_PlanningWorkspaceFocusedHttpBootstrapAcceptance.js
 * BUILD: 2026-09-24_AMS01_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE_R4_FINAL
 * Static/read-only architecture acceptance for focused Plan launch.
 ***********************************************************************/
var AMS01_PW_FOCUSED_HTTP_ACCEPTANCE_BUILD='2026-09-24_AMS01_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE_R4_FINAL';
function RUN_AMS01_PLANNING_WORKSPACE_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE(){
  var c=PlanningWorkspaceEntryRoute_contract();
  var ui=PlanningWorkspaceUi_contract();
  var checks={
    routeOwned:c&&c.authenticatedEntryOwner==='EntryV5'&&c.renderer==='PlanningWorkspaceUi_render',
    devOnly:c&&c.devOnly===true,
    focusedHttpBootstrap:c&&c.focusedHttpBootstrap===true,
    generalWorkspaceDeferred:c&&c.generalWorkspaceDeferredBootstrap===true,
    focusedInitialBrowserRpcEliminated:c&&c.initialSerialRpcCount===0&&c.serverRenderedInitialBootstrap===true,
    htmlRenderBypassedOnAuthenticatedDataPath:c&&c.htmlRenderOnAuthenticatedDataPath===false,
    authFunctionCanonical:c&&c.authFunction==='V5_ENTRY_resolve',
    workspaceRendererNoDirectPlanningReads:ui&&ui.planningServiceReadsDuringRender===false,
    canonicalUiIncludeSet:ui&&ui.includeSet==='CANONICAL_R14'&&ui.rotationPreassignGuardInclude==='PlanningWorkspaceRotationPreassignGuard.js'&&ui.preferredAuditMonthsInclude==='PlanningWorkspacePreferredAuditMonths.js',
    noNewSsot:c&&c.newSsot===false&&ui&&ui.newSsot===false
  };
  var ok=Object.keys(checks).every(function(k){return checks[k]===true});
  var out={ok:ok,build:AMS01_PW_FOCUSED_HTTP_ACCEPTANCE_BUILD,readOnly:true,writesPerformed:false,checks:checks,routeContract:c,uiContract:ui};
  Logger.log(JSON.stringify(out,null,2));return out;
}
