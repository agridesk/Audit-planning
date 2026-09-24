/***********************************************************************
 * FILE: AMS01_PlanningWorkspaceFocusedHttpBootstrapAcceptance.js
 * BUILD: 2026-09-24_AMS01_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE_R1
 * Static/read-only architecture acceptance for focused Plan launch.
 ***********************************************************************/
var AMS01_PW_FOCUSED_HTTP_ACCEPTANCE_BUILD='2026-09-24_AMS01_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE_R1';
function RUN_AMS01_PLANNING_WORKSPACE_FOCUSED_HTTP_BOOTSTRAP_ACCEPTANCE(){
  var entry=HtmlService.createHtmlOutputFromFile('zz_PlanningWorkspaceEntryRouteOverride.js').getContent();
  var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var checks={
    focusedBootstrapBuiltInInitialHttp:entry.indexOf("seed=PlanningWorkspaceRpc_bootstrap(q)")>=0,
    authBeforeFocusedBootstrap:entry.indexOf("V5_AUTH.validateTrustedTokenByRole")>=0&&entry.indexOf("V5_AUTH.validateTrustedTokenByRole")<entry.indexOf("seed=PlanningWorkspaceRpc_bootstrap(q)"),
    focusedRequiresAuditTokenDevice:entry.indexOf("if(boot.auditId&&boot.token&&boot.deviceId)")>=0,
    noUnauthenticatedPlanningSeed:entry.indexOf("if(auth&&auth.ok===true&&auth.email)")>=0,
    clientConsumesHttpBootstrap:client.indexOf("consumeHttpBootstrap")>=0&&client.indexOf("window.__PW_HTTP_BOOTSTRAP")>=0,
    focusedAvoidsInitialBrowserRpc:client.indexOf("if(!consumeHttpBootstrap())load('open')")>=0,
    generalWorkspaceFallbackRetained:client.indexOf("load('open')")>=0,
    prodGuardRetained:entry.indexOf("if(runtimeEnv!=='DEV')return PW_ENTRY_BASE_doGet_(e)")>=0
  };
  var ok=Object.keys(checks).every(function(k){return checks[k]===true});
  var out={ok:ok,build:AMS01_PW_FOCUSED_HTTP_ACCEPTANCE_BUILD,readOnly:true,writesPerformed:false,checks:checks,architecture:{focusedLaunch:'HTTP_AUTH_BOOTSTRAP_SINGLE_REQUEST',generalWorkspace:'DEFERRED_BROWSER_RPC',newSsot:false,prodChanged:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}