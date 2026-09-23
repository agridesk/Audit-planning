/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-23_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R13_BUILD_SYNC
 *
 * PERFORMANCE
 * - Route render remains data-independent.
 * - No Planning Demand, Eligibility, Availability or Concept reads before
 *   the HTML shell is returned to the browser.
 * - Browser loads decision data only after first shell paint.
 * - Planned audit detail is loaded only when Modify/Cancel is opened.
 * - Modify planning-window context is targeted/on-demand only.
 * - No new cache, no writes during render, no new source of truth.
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-23_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R13_BUILD_SYNC';

function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  var html=t.evaluate().getContent();
  var dragDrop=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var attentionEnhancer=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAttentionEnhancer.js').getContent();
  var pointerDragFallback=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePointerDragFallback.js').getContent();
  var availabilityContext=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAvailabilityContext.js').getContent();
  var detailToolkit=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDetailToolkit.js').getContent();
  var plannedActions=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedAuditActions.js').getContent();
  var modifyWindowGuard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyWindowGuard.js').getContent();
  html=html.replace('</body>',dragDrop+'\n'+attentionEnhancer+'\n'+pointerDragFallback+'\n'+availabilityContext+'\n'+detailToolkit+'\n'+plannedActions+'\n'+modifyWindowGuard+'\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  dragDropInclude:'PlanningWorkspaceDragDrop.js',
  attentionEnhancerInclude:'PlanningWorkspaceAttentionEnhancer.js',
  pointerDragFallbackInclude:'PlanningWorkspacePointerDragFallback.js',
  availabilityContextInclude:'PlanningWorkspaceAvailabilityContext.js',
  detailToolkitInclude:'PlanningWorkspaceDetailToolkit.js',
  plannedActionsInclude:'PlanningWorkspacePlannedAuditActions.js',
  modifyWindowGuardInclude:'PlanningWorkspaceModifyWindowGuard.js',
  modifyWindowGuardRequired:true,
  evaluatedTemplate:true,
  serverSeed:false,
  dataIndependentShell:true,
  decisionDataDeferred:true,
  dragDropClientOnly:true,
  availabilityContextClientOnly:true,
  detailToolkitClientOnly:true,
  plannedActionsClientOnly:true,
  modifyWindowGuardClientOnly:true,
  plannedDetailOnDemand:true,
  plannedActionsRequired:true,
  planningWindowVisibleOnModify:true,
  directSheetReads:false,
  directSheetWrites:false,
  planningServiceReadsDuringRender:false,
  newSsot:false
};}
