/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-24_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R14_CANONICAL_INCLUDES
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
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-24_ROADMAP_2_4_PLANNING_WORKSPACE_UI_R14_CANONICAL_INCLUDES';

function PlanningWorkspaceUi_render(ctx){
  ctx=ctx||{};
  var t=HtmlService.createTemplateFromFile('PlanningWorkspace');
  t.__seedJson='{"ok":false,"meta":{"serverSeed":false,"dataIndependentShell":true}}';
  t.__seedFrom='';
  t.__seedTo='';
  var html=t.evaluate().getContent();
  var includeFiles=[
    'PlanningWorkspaceDragDrop.js',
    'PlanningWorkspaceContextEnhancer.js',
    'PlanningWorkspaceAttentionEnhancer.js',
    'PlanningWorkspacePointerDragFallback.js',
    'PlanningWorkspaceAvailabilityContext.js',
    'PlanningWorkspaceDetailToolkit.js',
    'PlanningWorkspacePlannedAuditActions.js',
    'PlanningWorkspacePlannedStatusVisuals.js',
    'PlanningWorkspacePlannedStateDeduper.js',
    'PlanningWorkspaceAvailabilityLabels.js',
    'PlanningWorkspaceConceptReview.js',
    'PlanningWorkspaceUxStabilizer.js',
    'PlanningWorkspaceModifyWindowGuard.js',
    'PlanningWorkspaceModifyPickerWeekColumns.js',
    'PlanningWorkspaceRotationPreassignGuard.js',
    'PlanningWorkspacePreferredAuditMonths.js'
  ];
  var includes=includeFiles.map(function(name){return HtmlService.createHtmlOutputFromFile(name).getContent();}).join('\n');
  html=html.replace('</body>',includes+'\n</body>');
  return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
}
function PlanningWorkspaceUi_contract(){return{
  build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,
  template:'PlanningWorkspace',
  clientInclude:'PlanningWorkspaceClient.js',
  includeSet:'CANONICAL_R14',
  contextEnhancerInclude:'PlanningWorkspaceContextEnhancer.js',
  attentionEnhancerInclude:'PlanningWorkspaceAttentionEnhancer.js',
  plannedStatusVisualsInclude:'PlanningWorkspacePlannedStatusVisuals.js',
  plannedStateDeduperInclude:'PlanningWorkspacePlannedStateDeduper.js',
  availabilityLabelsInclude:'PlanningWorkspaceAvailabilityLabels.js',
  conceptReviewInclude:'PlanningWorkspaceConceptReview.js',
  uxStabilizerInclude:'PlanningWorkspaceUxStabilizer.js',
  modifyWindowGuardInclude:'PlanningWorkspaceModifyWindowGuard.js',
  modifyPickerWeekColumnsInclude:'PlanningWorkspaceModifyPickerWeekColumns.js',
  rotationPreassignGuardInclude:'PlanningWorkspaceRotationPreassignGuard.js',
  preferredAuditMonthsInclude:'PlanningWorkspacePreferredAuditMonths.js',
  evaluatedTemplate:true,serverSeed:false,dataIndependentShell:true,decisionDataDeferred:true,
  plannedDetailOnDemand:true,conceptReviewExtraRpcs:0,navigationExtraRpcs:0,
  rotationCanonicalRevalidationRequired:true,preferredAuditMonthsAdvisoryOnly:true,
  directSheetReads:false,directSheetWrites:false,planningServiceReadsDuringRender:false,newSsot:false
};}
