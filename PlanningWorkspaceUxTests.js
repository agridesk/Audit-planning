/***********************************************************************
 * PlanningWorkspaceUxTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_UX_TEST_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_UX_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_UX_TEST_R1';
function RUN_PLANNING_WORKSPACE_UX_REGRESSION(){
  var r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceUxClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('uxClientPresent',!!src);
  t('buildMarker',src.indexOf('PLANNING_WORKSPACE_UX_CLIENT_R1_PLANNER_DEFAULTS')>=0);
  t('defaultPeriodFunction',src.indexOf('applyDefaultPeriod')>=0);
  t('currentMonthStart',src.indexOf('firstOfMonth')>=0);
  t('threeMonthHorizon',src.indexOf('endOfMonth(now,3)')>=0);
  t('doesNotOverwriteDates',src.indexOf('if(from.value||to.value)return false')>=0);
  t('visualHierarchy',src.indexOf('pwUxStyles')>=0);
  t('calendarHierarchy',src.indexOf('.pw-calendar-pane')>=0);
  t('shellInclude',shell.indexOf("PlanningWorkspaceUxClient.js")>=0);
  t('noRpc',src.indexOf('google.script.run')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noWrites',src.indexOf('PlanningCanonical')<0&&src.indexOf('AvailabilityService')<0);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_UX_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{readOnly:true,newSsot:false,liveReadsPerformed:false,liveWritesPerformed:false}};
  console.log(JSON.stringify(out,null,2));return out;
}
