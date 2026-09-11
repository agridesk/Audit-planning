/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_R4_DATA_INDEPENDENT_SHELL
 *
 * PERFORMANCE
 * - Route render is deliberately data-independent.
 * - No Planning Demand, Eligibility, Availability or Concept reads before
 *   the HTML shell is returned to the browser.
 * - Browser loads decision data only after first shell paint.
 * - No new cache, no writes, no new source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-11_AMS01_2_PLANNING_WORKSPACE_UI_R4_DATA_INDEPENDENT_SHELL';

function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  return t.evaluate().setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  evaluatedTemplate:true,
  serverSeed:false,
  dataIndependentShell:true,
  decisionDataDeferred:true,
  directSheetReads:false,
  directSheetWrites:false,
  planningServiceReadsDuringRender:false,
  newSsot:false
};}
