// FILE: AMS03_Planning2WorkspaceEntryPerformanceAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_WORKSPACE_ENTRY_PERF_R1
// PURPOSE: Static 3S gate for Manager -> Workspace first-load path.

function RUN_AMS03_PLANNING2_WORKSPACE_ENTRY_PERFORMANCE_ACCEPTANCE() {
  var results=[];
  function g(n,ok,d){results.push({name:n,ok:!!ok,detail:d||''});}
  var manager=HtmlService.createHtmlOutputFromFile('ManagerV5UI').getContent();
  var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var entry=PlanningWorkspaceEntryRoute_contract();
  var rpc=PlanningWorkspaceRpc_contract();
  var svc=PlanningWorkspaceService_contract();

  g('managerCarriesTrustedAuth',manager.indexOf("u.searchParams.set('trustedToken'")>=0&&manager.indexOf("u.searchParams.set('deviceFingerprint'")>=0,'Workspace can authenticate without relying on unrelated localStorage origin.');
  g('directShellCarriesAuth',entry.directShellCarriesAuthContext===true,'Direct shell seeds authenticated entry context.');
  g('clientUsesDirectAuthSeed',client.indexOf('window.__PW_ENTRY_AUTH')>=0,'First RPC consumes direct-shell auth seed.');
  g('singleInitialRpc',entry.initialSerialRpcCount===1&&entry.initialAuthAndDataSingleRpc===true,'Auth + decision data stay in one initial browser RPC.');
  g('compactDecisionRpc',rpc.meta.singleDecisionRpc===true&&rpc.meta.coarseGrained===true,'Decision-ready bootstrap remains coarse-grained.');
  g('boundedOverlay',rpc.meta.overlayBoundedToCandidates===true,'Availability overlay remains candidate-bounded.');
  g('noDirectSheetReads',rpc.meta.directSheetReads===false&&svc.meta.directSheetReads===false,'UI/RPC/service facade adds no sheet scans.');
  g('noDirectSheetWrites',rpc.meta.directSheetWrites===false&&svc.meta.directSheetWrites===false,'UI/RPC/service facade adds no direct writer.');
  g('canonicalCommitOnly',svc.meta.canonicalCommitOnly===true,'Canonical planning writer remains owner.');

  var failed=results.filter(function(x){return!x.ok;});
  var out={ok:failed.length===0,build:'2026-09-24_AMS03_PLANNING2_WORKSPACE_ENTRY_PERF_R1',passed:results.length-failed.length,total:results.length,results:results,meta:{priority:'P0_SPEED',runtimeMeasurementStillRequired:true,targetDecisionReadyP95Ms:2000}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
