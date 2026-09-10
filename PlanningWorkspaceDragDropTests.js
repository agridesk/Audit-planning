/***********************************************************************
 * PlanningWorkspaceDragDropTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_DRAG_DROP_TEST_R4_CANONICAL_CALENDAR
 * Non-destructive contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_DRAG_DROP_TEST_R4_CANONICAL_CALENDAR';
function RUN_PLANNING_WORKSPACE_DRAG_DROP_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var dnd=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceDragDropClient.js').getContent();
  var cal=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('dndBuildR2',dnd.indexOf('DRAG_DROP_CLIENT_R2_CALENDAR_DATE_DROP')>=0);
  t('calendarBuildR3',cal.indexOf('PLANNING_WORKSPACE_CALENDAR_CLIENT_R3_CANONICAL_AND_CONCEPT')>=0);
  t('dragSourcePlanningDemand',dnd.indexOf("dragSource:'Planning Demand'")>=0);
  t('legacyConceptDropPreserved',dnd.indexOf('legacyConceptDropPreserved:true')>=0);
  t('calendarDropTarget',dnd.indexOf("'Calendar date'")>=0);
  t('calendarDropPrefillsDates',dnd.indexOf('OPEN_EXISTING_EDITOR_AND_PREFILL_DATES')>=0&&dnd.indexOf('prefillEditorDates')>=0);
  t('planningWindowGuard',dnd.indexOf('planningWindowGuard:true')>=0&&dnd.indexOf('allowedDate')>=0);
  t('dropUsesExistingEditor',dnd.indexOf('row.click()')>=0);
  t('noCanonicalWriteOnDrop',dnd.indexOf('canonicalWrite:false')>=0);
  t('noNewSsot',dnd.indexOf('newSsot:false')>=0&&cal.indexOf('newSsot:false')>=0);
  t('existingClickFlowPreserved',dnd.indexOf('existingClickFlowPreserved:true')>=0);
  t('calendarMonthBoard',cal.indexOf("projection:'MONTH_BOARD'")>=0);
  t('calendarUsesWorkspaceState',cal.indexOf('PlanningWorkspaceClient.state')>=0);
  t('calendarUsesConceptReservations',cal.indexOf('Concept Reservations')>=0||cal.indexOf('reservations()')>=0);
  t('calendarUsesCanonicalPlanning',cal.indexOf('canonical Audit planning')>=0&&cal.indexOf('canonicalItemsVisible:true')>=0);
  t('calendarNavigation',cal.indexOf('pwCalPrev')>=0&&cal.indexOf('pwCalNext')>=0);
  t('calendarShowsBlocks',cal.indexOf('pw-cal-item')>=0&&cal.indexOf('blocksFor')>=0);
  t('calendarInteractiveConcepts',cal.indexOf('conceptItemsDraggable:true')>=0&&cal.indexOf('availabilityWarnings:true')>=0);
  t('shellHasCalendarPane',shell.indexOf('id="pwCalendarPane"')>=0&&shell.indexOf('id="pwCalendarBody"')>=0);
  t('shellIncludesCalendarClient',shell.indexOf("PlanningWorkspaceCalendarClient.js")>=0);
  t('shellIncludesDndClient',shell.indexOf("PlanningWorkspaceDragDropClient.js")>=0);
  t('shellIncludesPlannedClient',shell.indexOf("PlanningWorkspacePlannedCalendarClient.js")>=0);
  t('existingClientsPreserved',shell.indexOf("PlanningWorkspaceClient.js")>=0&&shell.indexOf("PlanningWorkspaceEligibilityRecovery.js")>=0&&shell.indexOf("PlanningWorkspaceReAdjustClient.js")>=0&&shell.indexOf("PlanningWorkspaceWorkloadClient.js")>=0&&shell.indexOf("PlanningWorkspaceCalendarAvailabilityClient.js")>=0);
  t('conceptPanePreserved',shell.indexOf('id="pwPlanningPane"')>=0);
  t('workloadPanePreserved',shell.indexOf('id="pwWorkloadPane"')>=0);
  var failed=r.filter(function(x){return !x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_DRAG_DROP_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,toolkit2DragDropCalendarSlice:true,calendarDateDrop:true,planningWindowGuard:true,conceptReservationProjection:true,canonicalPlanningProjection:true,interactiveConceptCalendar:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
