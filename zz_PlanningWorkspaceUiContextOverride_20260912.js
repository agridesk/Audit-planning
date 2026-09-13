/***********************************************************************
 * zz_PlanningWorkspaceUiContextOverride_20260912.js
 * BUILD: 2026-09-13_PLANNING_WORKSPACE_UI_R12_STATUS_VISUALS
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-13_PLANNING_WORKSPACE_UI_R12_STATUS_VISUALS';

function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  var html=t.evaluate().getContent();
  var dragDrop=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDrop.js').getContent();
  var detailToolkit=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDetailToolkit.js').getContent();
  var contextEnhancer=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceContextEnhancer.js').getContent();
  var attentionEnhancer=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAttentionEnhancer.js').getContent();
  var pointerDragFallback=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePointerDragFallback.js').getContent();
  var plannedActions=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedAuditActions.js').getContent();
  var plannedStatusVisuals=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedStatusVisuals.js').getContent();
  var conceptReview=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceConceptReview.js').getContent();
  html=html.replace('</body>',dragDrop+'\n'+detailToolkit+'\n'+contextEnhancer+'\n'+attentionEnhancer+'\n'+pointerDragFallback+'\n'+plannedActions+'\n'+plannedStatusVisuals+'\n'+conceptReview+'\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
}

function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  dragDropInclude:'PlanningWorkspaceDragDrop.js',
  detailToolkitInclude:'PlanningWorkspaceDetailToolkit.js',
  contextEnhancerInclude:'PlanningWorkspaceContextEnhancer.js',
  attentionEnhancerInclude:'PlanningWorkspaceAttentionEnhancer.js',
  pointerDragFallbackInclude:'PlanningWorkspacePointerDragFallback.js',
  plannedActionsInclude:'PlanningWorkspacePlannedAuditActions.js',
  plannedStatusVisualsInclude:'PlanningWorkspacePlannedStatusVisuals.js',
  conceptReviewInclude:'PlanningWorkspaceConceptReview.js',
  evaluatedTemplate:true,serverSeed:false,dataIndependentShell:true,decisionDataDeferred:true,
  dragDropClientOnly:true,detailToolkitClientOnly:true,contextEnhancerClientOnly:true,attentionEnhancerClientOnly:true,pointerDragFallbackClientOnly:true,plannedActionsClientOnly:true,plannedStatusVisualsClientOnly:true,conceptReviewClientOnly:true,
  plannedDetailOnDemand:true,conceptReviewUsesLoadedReservationMetadata:true,conceptReviewExtraRpcs:0,conceptReviewThresholdMonths:6,
  attentionPriority:'planningWindowTo, planningWindowFrom, blocker state',directSheetReads:false,directSheetWrites:false,planningServiceReadsDuringRender:false,contextExtraReads:0,contextExtraRpcs:0,newSsot:false
};}
