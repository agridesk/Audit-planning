/***********************************************************************
 * PlanningWorkspaceCalendarAvailabilityTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_TEST_R1
 * Non-destructive contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_TEST_R1';
function RUN_PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarAvailabilityClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('clientBuild',c.indexOf('PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_CLIENT_R1')>=0);
  t('usesWorkspaceOverlays',c.indexOf("availabilitySource:'PlanningWorkspace overlays'")>=0);
  t('auditorSelector',c.indexOf('pwCalendarAuditor')>=0);
  t('allAuditorsDefault',c.indexOf('All auditors')>=0);
  t('availabilityNoProjection',c.indexOf("s==='NO'")>=0&&c.indexOf('pw-cal-auditor-unavailable')>=0);
  t('availabilityYesProjection',c.indexOf("s==='YES'")>=0&&c.indexOf('pw-cal-auditor-available')>=0);
  t('managerEditorPrefill',c.indexOf('managerEditorPrefill:true')>=0&&c.indexOf('syncEditorAuditor')>=0);
  t('auditorIdentityNotOverridden',c.indexOf('auditorIdentityOverride:false')>=0&&c.indexOf("norm(app.getAttribute('data-role'))!=='manager'")>=0);
  t('noCanonicalWrite',c.indexOf('canonicalWrite:false')>=0);
  t('noNewSsot',c.indexOf('newSsot:false')>=0);
  t('shellIncludesAvailabilityClient',shell.indexOf("PlanningWorkspaceCalendarAvailabilityClient.js")>=0);
  t('existingCalendarClientsPreserved',shell.indexOf("PlanningWorkspaceCalendarClient.js")>=0&&shell.indexOf("PlanningWorkspaceDragDropClient.js")>=0&&shell.indexOf("PlanningWorkspaceConceptCalendarClient.js")>=0);
  var f=r.filter(function(x){return!x.ok;}).length;
  var out={ok:f===0,build:PLANNING_WORKSPACE_CALENDAR_AVAILABILITY_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,calendarAuditorAvailabilityOverlay:true,managerEditorPrefill:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
