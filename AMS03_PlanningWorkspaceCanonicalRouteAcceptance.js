/***********************************************************************
 * FILE: AMS03_PlanningWorkspaceCanonicalRouteAcceptance.js
 * BUILD: 2026-09-26_AMS03_PLANNING_WORKSPACE_CANONICAL_ROUTE_ACCEPTANCE_R1
 * PURPOSE: Fail closed unless the real EntryV5 GET chain owns Planning Workspace 2.0.
 ***********************************************************************/
var AMS03_PW_CANONICAL_ROUTE_ACCEPTANCE_BUILD='2026-09-26_AMS03_PLANNING_WORKSPACE_CANONICAL_ROUTE_ACCEPTANCE_R1';

function RUN_AMS03_PLANNING_WORKSPACE_CANONICAL_ROUTE_ACCEPTANCE(){
  var r=[];
  function g(name,ok,detail){r.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}
  var norm=String(V5_ENTRY_normAction_('planningworkspace')||'');
  var role=String(V5_ENTRY_expectedRole_('planningworkspace','Manager')||'');
  var entrySource=String(V5_ENTRY_renderApp);
  var contract=typeof PlanningWorkspaceEntryRoute_contract==='function'?PlanningWorkspaceEntryRoute_contract():null;
  var ui=typeof PlanningWorkspaceUi_contract==='function'?PlanningWorkspaceUi_contract():null;

  g('planningworkspaceNormalized',norm==='planningworkspace','actual='+norm);
  g('managerRoleResolved',role==='Manager','actual='+role);
  g('entryCallsCanonicalRouteOwner',entrySource.indexOf('PlanningWorkspaceEntryRoute_render')>=0,'EntryV5_renderApp does not call PlanningWorkspaceEntryRoute_render');
  g('routeOwnerAvailable',typeof PlanningWorkspaceEntryRoute_render==='function','PlanningWorkspaceEntryRoute_render unavailable');
  g('routeContractAvailable',!!contract,'PlanningWorkspaceEntryRoute_contract unavailable');
  g('uiOwnerAvailable',typeof PlanningWorkspaceUi_render==='function','PlanningWorkspaceUi_render unavailable');
  g('devOnly',!!(contract&&contract.devOnly===true),'route must remain DEV-only');
  g('canonicalRenderer',!!(contract&&contract.renderer==='PlanningWorkspaceUi_render'),'wrong renderer');
  g('noNewSsot',!!(contract&&contract.newSsot===false&&ui&&ui.newSsot===false),'new SSOT detected');

  var failed=r.filter(function(x){return!x.ok;});
  var out={ok:failed.length===0,build:AMS03_PW_CANONICAL_ROUTE_ACCEPTANCE_BUILD,total:r.length,passed:r.length-failed.length,failed:failed.length,results:r,meta:{readOnly:true,writesPerformed:false,testsRealEntryFunctions:true,staticStringOnly:false}};
  Logger.log(JSON.stringify(out,null,2));
  return out;
}
