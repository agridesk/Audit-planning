/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-12_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R5_DRAG_DROP
 *
 * PERFORMANCE
 * - Route render remains data-independent.
 * - No Planning Demand, Eligibility, Availability or Concept reads before
 *   the HTML shell is returned to the browser.
 * - Browser loads decision data only after first shell paint.
 * - Drag/drop behavior is a client-only include.
 * - No new cache, no writes, no new source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-12_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R5_DRAG_DROP';

function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  var html=t.evaluate().getContent();
  var dragDrop=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  html=html.replace('</body>',dragDrop+'\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  dragDropInclude:'PlanningWorkspaceDragDrop.js',
  evaluatedTemplate:true,
  serverSeed:false,
  dataIndependentShell:true,
  decisionDataDeferred:true,
  dragDropClientOnly:true,
  directSheetReads:false,
  directSheetWrites:false,
  planningServiceReadsDuringRender:false,
  newSsot:false
};}
