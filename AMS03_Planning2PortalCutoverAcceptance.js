// FILE: AMS03_Planning2PortalCutoverAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_PORTAL_CUTOVER_R1
function RUN_AMS03_PLANNING2_PORTAL_CUTOVER_ACCEPTANCE(){
 var r=[];function g(n,o,d){r.push({name:n,ok:!!o,detail:d||''});}
 var m=HtmlService.createHtmlOutputFromFile('ManagerV5UI').getContent(),a=HtmlService.createHtmlOutputFromFile('AuditorPortalV5').getContent(),cl=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),route=PlanningWorkspaceEntryRoute_contract(),rpc=PlanningWorkspaceRpc_contract();
 g('managerRowDevWorkspace',m.indexOf("useWorkspace2 ? 'planningworkspace' : 'planningtoolkit'")>=0,'Manager Pending Planning row uses Workspace in DEV and legacy Toolkit outside DEV.');
 g('managerFocusedAudit',m.indexOf('auditId: auditId')>=0,'Manager row launch carries focused Audit ID.');
 g('managerTrustedAuth',m.indexOf("trustedToken: useWorkspace2 ? String(MANAGER_TRUSTED_TOKEN")>=0,'Manager row launch carries DEV trusted auth context.');
 g('auditorDevWorkspace',a.indexOf("'planningworkspace' : 'planningtoolkit'")>=0,'Auditor Plan uses Workspace in DEV with legacy fallback.');
 g('auditorSelfUiLock',cl.indexOf('function applyRoleUi')>=0&&cl.indexOf('sel.disabled=true')>=0,'Auditor UI locks auditor selection to authenticated self.');
 g('auditorSelfServerGuard',String(PWR_enforceAuditorCommand_).indexOf('auditor may plan only for self')>=0,'Server independently enforces Auditor self-only planning.');
 g('singleInitialRpc',route.initialSerialRpcCount===1&&route.initialAuthAndDataSingleRpc===true,'Portal cutover preserves single initial auth+decision RPC.');
 g('boundedWorkspaceRpc',rpc.meta.overlayBoundedToCandidates===true&&rpc.meta.singleDecisionRpc===true,'Workspace remains coarse-grained and overlay-bounded.');
 g('canonicalCommitOnly',rpc.meta.canonicalOwnersBypassed===false&&rpc.meta.directSheetWrites===false,'No browser/RPC bypass of canonical commit owners.');
 var f=r.filter(function(x){return!x.ok}),out={ok:!f.length,build:'2026-09-24_AMS03_PLANNING2_PORTAL_CUTOVER_R1',passed:r.length-f.length,total:r.length,results:r,meta:{devOnly:true,managerRowMigrated:true,auditorPlanMigrated:true,legacyFallbackRetained:true,priority:'P0_SPEED',manualLaunchMeasurementRequired:true}};Logger.log(JSON.stringify(out,null,2));return out;
}
