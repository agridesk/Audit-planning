// FILE: AMS03_Planning2ManagerMigrationAcceptance.js
// BUILD: 2026-09-24_AMS03_PLANNING2_MANAGER_MIGRATION_ENTRY_R1
// PURPOSE: Non-destructive gate for first Manager Portal -> Planning 2.0 Workspace migration entry.

function RUN_AMS03_PLANNING2_MANAGER_MIGRATION_ACCEPTANCE() {
  var r=[];
  function g(n,ok,d){r.push({name:n,ok:!!ok,detail:d||''});}
  var ui=HtmlService.createHtmlOutputFromFile('ManagerV5UI').getContent();
  var entry=PlanningWorkspaceEntryRoute_contract();
  var svc=PlanningWorkspaceService_contract();
  var rpc=PlanningWorkspaceRpc_contract();

  g('managerHasPlanning2Entry',ui.indexOf('id="btnPlanningWorkspace2"')>=0,'Manager Portal exposes explicit Planning 2.0 migration entry.');
  g('entryTargetsWorkspace',ui.indexOf("u.searchParams.set('action', 'planningworkspace')")>=0,'Entry targets existing Workspace route.');
  g('entryManagerRole',ui.indexOf("u.searchParams.set('role', 'Manager')")>=0,'Manager permission context preserved.');
  g('devOnlyVisible',ui.indexOf("String(MANAGER_RUNTIME_ENV || '').toUpperCase() === 'DEV'")>=0,'Migration entry remains hidden outside DEV.');
  g('workspaceDevOnly',entry&&entry.devOnly===true,'Workspace route remains DEV-only.');
  g('canonicalCommitOwner',svc&&svc.meta&&svc.meta.canonicalCommitOnly===true,'Workspace writes remain canonical.');
  g('noDirectSheetWrites',svc&&svc.meta&&svc.meta.directSheetWrites===false&&rpc&&rpc.meta&&rpc.meta.directSheetWrites===false,'Migration adds no UI/RPC sheet writer.');
  g('singlePlanningEngine',svc&&svc.meta&&svc.meta.newSsot===false&&rpc&&rpc.meta&&rpc.meta.newSsot===false,'No second planning truth/engine introduced.');

  var failed=r.filter(function(x){return!x.ok;});
  var out={ok:failed.length===0,build:'2026-09-24_AMS03_PLANNING2_MANAGER_MIGRATION_ENTRY_R1',passed:r.length-failed.length,total:r.length,results:r,meta:{nonDestructive:true,devOnly:true,legacyToolkitRetained:true,migrationSurface:'Manager Portal -> Planning Workspace 2.0'}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
