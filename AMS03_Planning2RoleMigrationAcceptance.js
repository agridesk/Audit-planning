// FILE: AMS03_Planning2RoleMigrationAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_ROLE_MIGRATION_R1
function RUN_AMS03_PLANNING2_ROLE_MIGRATION_ACCEPTANCE(){
 var r=[];function g(n,o,d){r.push({name:n,ok:!!o,detail:d||''});}
 var route=String(V5_ENTRY_expectedRole_),rpc=String(PlanningWorkspaceRpc_bootstrap),guard=String(PWR_enforceAuditorCommand_),decision=String(PlanningWorkspaceDecisionReadModel_get),ui=HtmlService.createHtmlOutputFromFile('AuditorPortalV5').getContent(),client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent(),contract=PlanningWorkspaceEntryRoute_contract();
 g('workspaceAcceptsAuditorRole',V5_ENTRY_expectedRole_('planningworkspace','auditor')==='Auditor','Workspace authenticates Auditor through EntryV5.');
 g('workspaceManagerRolePreserved',V5_ENTRY_expectedRole_('planningworkspace','manager')==='Manager','Manager Workspace role remains intact.');
 g('auditorSelfOnlyServerGuard',guard.indexOf('auditor may plan only for self')>=0,'Server RPC rejects Auditor planning for another auditor.');
 g('decisionRoleScoped',decision.indexOf("role==='AUDITOR'")>=0&&decision.indexOf('actorEmail')>=0,'Decision projection filters Auditor candidates to self.');
 g('focusedAuditSupported',decision.indexOf('focusId')>=0&&client.indexOf('auditId:clean(boot.auditId)')>=0,'Focused audit launch is carried into decision projection.');
 g('auditorDevRoutesWorkspace',ui.indexOf("'planningworkspace' : 'planningtoolkit'")>=0,'Auditor DEV Plan routes to Workspace with legacy fallback outside DEV.');
 g('singleInitialRpc',contract.initialSerialRpcCount===1&&contract.initialAuthAndDataSingleRpc===true,'Role migration preserves one initial auth+decision RPC.');
 g('noNewSsot',contract.newSsot===false,'Role migration adds no SSoT.');
 g('canonicalCommitPath',String(PlanningWorkspaceService_commit).indexOf('PlanningCanonicalCommitService_commit')>=0,'Workspace still uses canonical commit owner.');
 var f=r.filter(function(x){return!x.ok}),out={ok:!f.length,build:'2026-09-24_AMS03_PLANNING2_ROLE_MIGRATION_R1',passed:r.length-f.length,total:r.length,results:r,meta:{devOnlyMigration:true,auditorSelfOnly:true,legacyFallbackRetained:true,priority:'P0_SPEED',runtimeWorkspaceLaunchStillRequired:true}};Logger.log(JSON.stringify(out,null,2));return out;
}
