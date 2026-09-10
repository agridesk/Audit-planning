/***********************************************************************
 * PlanningWorkspaceCalendarDensityTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_CALENDAR_DENSITY_TEST_R2_FORWARD_COMPAT
 * Non-destructive contract regression. No business writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_CALENDAR_DENSITY_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_CALENDAR_DENSITY_TEST_R2_FORWARD_COMPAT';
function RUN_PLANNING_WORKSPACE_CALENDAR_DENSITY_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var cal=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarClient.js').getContent();
  var den=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceCalendarDensityClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('calendarBuildR4OrLater',/CALENDAR_CLIENT_R(?:[4-9]|[1-9][0-9])_/.test(cal));
  t('densityBuildR2',den.indexOf('CALENDAR_DENSITY_R2_AUDITOR_LOAD')>=0);
  t('auditorMetadata',cal.indexOf('data-pw-cal-auditor')>=0&&den.indexOf('auditorIdentityMetadata:true')>=0);
  t('hoursMetadata',cal.indexOf('data-pw-cal-hours')>=0&&den.indexOf('auditorHoursMetadata:true')>=0);
  t('blockHoursDerived',cal.indexOf('function blockHours')>=0);
  t('conceptFilter',den.indexOf('pwCalShowConcept')>=0&&den.indexOf('conceptFilter:true')>=0);
  t('plannedFilter',den.indexOf('pwCalShowPlanned')>=0&&den.indexOf('plannedFilter:true')>=0);
  t('warningFilter',den.indexOf('pwCalOnlyWarnings')>=0&&den.indexOf('warningFilter:true')>=0);
  t('collisionVisibility',den.indexOf('pw-cal-day-collision')>=0&&den.indexOf('collisionVisibility:true')>=0);
  t('dailyAuditorLoad',den.indexOf('function dayLoad')>=0&&den.indexOf('dailyAuditorLoad:true')>=0);
  t('overEightHourWarning',den.indexOf('x.hours>8.0001')>=0&&den.indexOf('overEightHourWarning:true')>=0);
  t('noCanonicalWrite',den.indexOf('canonicalWrite:false')>=0);
  t('noNewSsot',den.indexOf('newSsot:false')>=0&&cal.indexOf('newSsot:false')>=0);
  t('shellIncludesDensity',shell.indexOf('PlanningWorkspaceCalendarDensityClient.js')>=0);
  t('existingCalendarPreserved',shell.indexOf('PlanningWorkspaceCalendarClient.js')>=0&&shell.indexOf('PlanningWorkspacePlannedCalendarClient.js')>=0&&shell.indexOf('PlanningWorkspaceConceptCalendarClient.js')>=0);
  var f=r.filter(function(x){return!x.ok;}).length;
  var out={ok:f===0,build:PLANNING_WORKSPACE_CALENDAR_DENSITY_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,calendarDensityControls:true,dailyAuditorLoad:true,overEightHourWarning:true,calendarBuildForwardCompatible:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
