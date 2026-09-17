/***********************************************************************
 * zz_PlanningWorkspaceUiContextOverride_20260912.js
 * BUILD: 2026-09-17_PLANNING_WORKSPACE_UI_R20_ROTATION_PREASSIGN_GUARD
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-17_PLANNING_WORKSPACE_UI_R20_ROTATION_PREASSIGN_GUARD';

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
  var plannedStateDeduper=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedStateDeduper.js').getContent();
  var availabilityLabels=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceAvailabilityLabels.js').getContent();
  var conceptReview=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceConceptReview.js').getContent();
  var uxStabilizer=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceUxStabilizer.js').getContent();
  var modifyWindowGuard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyWindowGuard.js').getContent();
  var modifyPickerWeekColumns=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyPickerWeekColumns.js').getContent();
  var rotationPreassignGuard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceRotationPreassignGuard.js').getContent();
  html=html.replace('</body>',dragDrop+'\n'+detailToolkit+'\n'+contextEnhancer+'\n'+attentionEnhancer+'\n'+pointerDragFallback+'\n'+plannedActions+'\n'+plannedStatusVisuals+'\n'+plannedStateDeduper+'\n'+availabilityLabels+'\n'+conceptReview+'\n'+uxStabilizer+'\n'+modifyWindowGuard+'\n'+modifyPickerWeekColumns+'\n'+rotationPreassignGuard+'\n</body>');
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
  plannedStateDeduperInclude:'PlanningWorkspacePlannedStateDeduper.js',
  availabilityLabelsInclude:'PlanningWorkspaceAvailabilityLabels.js',
  conceptReviewInclude:'PlanningWorkspaceConceptReview.js',
  uxStabilizerInclude:'PlanningWorkspaceUxStabilizer.js',
  modifyWindowGuardInclude:'PlanningWorkspaceModifyWindowGuard.js',
  modifyPickerWeekColumnsInclude:'PlanningWorkspaceModifyPickerWeekColumns.js',
  rotationPreassignGuardInclude:'PlanningWorkspaceRotationPreassignGuard.js',
  rotationPreassignGuardRequired:true,
  modifyWindowGuardRequired:true,
  evaluatedTemplate:true,serverSeed:false,dataIndependentShell:true,decisionDataDeferred:true,
  dragDropClientOnly:true,detailToolkitClientOnly:true,contextEnhancerClientOnly:true,attentionEnhancerClientOnly:true,pointerDragFallbackClientOnly:true,plannedActionsClientOnly:true,plannedStatusVisualsClientOnly:true,plannedStateDeduperClientOnly:true,availabilityLabelsClientOnly:true,conceptReviewClientOnly:true,uxStabilizerClientOnly:true,modifyWindowGuardClientOnly:true,modifyPickerWeekColumnsClientOnly:true,rotationPreassignGuardClientOnly:true,
  plannedDetailOnDemand:true,conceptReviewUsesLoadedReservationMetadata:true,conceptReviewExtraRpcs:0,conceptReviewThresholdMonths:6,
  fastWeekNavigationClientOnly:true,fastMonthNavigationClientOnly:true,navigationExtraRpcs:0,modalInteractionGuard:true,
  navigationObserverScope:'calendar root only / body direct children only',navigationMutationStormRemoved:true,plannedStatusObserverDebounced:true,conceptReviewObserverDebounced:true,
  planningWindowVisibleOnModify:true,availabilityLabelsUnified:true,technicalAvailabilityStatusesHidden:true,fixedModifyWeekdayColumns:true,modifyPickerSelectedDayFeedback:true,modifyPickerSelectionReconcilesClientSide:true,modifyPickerWeekColumnsExtraRpcs:0,
  attentionPriority:'planningWindowTo, planningWindowFrom, blocker state',rotationPreassignWarningVisible:true,rotationCanonicalRevalidationRequired:true,directSheetReads:false,directSheetWrites:false,planningServiceReadsDuringRender:false,contextExtraReads:0,contextExtraRpcs:0,newSsot:false
};}
