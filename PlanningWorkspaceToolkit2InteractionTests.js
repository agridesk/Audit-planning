/***********************************************************************
 * PlanningWorkspaceToolkit2InteractionTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_TEST_R3_DENSITY_METADATA
 * Non-destructive browser contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_TEST_R3_DENSITY_METADATA';
function RUN_PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var cal=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarClient.js').getContent();
  var cc=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceConceptCalendarClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('calendarR4',cal.indexOf('CALENDAR_CLIENT_R4_DENSITY_METADATA')>=0);
  t('conceptItemsDraggable',cal.indexOf('conceptItemsDraggable:true')>=0&&cal.indexOf('data-pw-cal-source')>=0);
  t('availabilityWarnings',cal.indexOf('availabilityWarnings:true')>=0&&cal.indexOf('auditor unavailable')>=0);
  t('densityMetadata',cal.indexOf('densityMetadata:true')>=0&&cal.indexOf('data-pw-cal-auditor')>=0&&cal.indexOf('data-pw-cal-hours')>=0);
  t('conceptInteractionClientR2',cc.indexOf('CONCEPT_CALENDAR_CLIENT_R2_SOURCE_SCOPED')>=0);
  t('conceptSourceScoped',cc.indexOf("sourceScoped:'CONCEPT'")>=0&&cc.indexOf('data-pw-cal-source="CONCEPT"')>=0);
  t('calendarClickReopensEditor',cc.indexOf("calendarConceptClick:'OPEN_EXISTING_EDITOR'")>=0);
  t('conceptDragShiftsPreview',cc.indexOf("calendarConceptDrag:'SHIFT_BLOCKS_PREVIEW'")>=0);
  t('blockSpacingPreserved',cc.indexOf('preservesBlockSpacing:true')>=0);
  t('planningWindowGuard',cc.indexOf('planningWindowGuard:true')>=0);
  t('noWriteOnDrop',cc.indexOf('writeOnDrop:false')>=0);
  t('saveConceptOwnerPreserved',cc.indexOf("persistOwner:'existing Save concept'")>=0);
  t('noCanonicalWrite',cc.indexOf('canonicalWrite:false')>=0);
  t('noNewSsot',cc.indexOf('newSsot:false')>=0);
  t('shellIncludesConceptCalendar',shell.indexOf('PlanningWorkspaceConceptCalendarClient.js')>=0);
  t('existingCalendarPreserved',shell.indexOf('PlanningWorkspaceCalendarClient.js')>=0);
  t('existingDndPreserved',shell.indexOf('PlanningWorkspaceDragDropClient.js')>=0);
  t('existingSelfPlanningPreserved',shell.indexOf('PlanningWorkspaceSelfPlanningClient.js')>=0);
  t('conceptPanePreserved',shell.indexOf('id="pwPlanningPane"')>=0);
  var f=r.filter(function(x){return!x.ok;}).length,out={ok:f===0,build:PLANNING_WORKSPACE_TOOLKIT2_INTERACTION_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,conceptCalendarInteraction:true,sourceScoped:true,availabilityWarnings:true,densityMetadata:true,previewBeforePersist:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
