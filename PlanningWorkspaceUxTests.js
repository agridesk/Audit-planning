/***********************************************************************
 * PlanningWorkspaceUxTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_UX_TEST_R3_IDLE_SELECTION
 ***********************************************************************/
var PLANNING_WORKSPACE_UX_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_UX_TEST_R3_IDLE_SELECTION';
function RUN_PLANNING_WORKSPACE_UX_REGRESSION(){
  var r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceUxClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('uxClientPresent',!!src);
  t('buildMarker',src.indexOf('PLANNING_WORKSPACE_UX_CLIENT_R3_IDLE_BATCH_SELECTION_COMPACT')>=0);
  t('defaultPeriodFunction',src.indexOf('applyDefaultPeriod')>=0);
  t('currentMonthStart',src.indexOf('firstOfMonth')>=0);
  t('threeMonthHorizon',src.indexOf('endOfMonth(now,3)')>=0);
  t('doesNotOverwriteDates',src.indexOf('if(from.value||to.value)return false')>=0);
  t('visualHierarchy',src.indexOf('pwUxStyles')>=0);
  t('calendarHierarchy',src.indexOf('.pw-calendar-pane')>=0);
  t('compactAttentionGrid',src.indexOf('repeat(4,minmax(210px,1fr))')>=0);
  t('workloadCountSpacing',src.indexOf('.pw-workload-pane .pw-pane-head>span:nth-child(2)')>=0);
  t('workloadScopeCompaction',src.indexOf('.pw-workload-scopes')>=0);
  t('idleBatchVisibility',src.indexOf('syncBatchVisibility')>=0&&src.indexOf('pw-ux-idle-batch')>=0);
  t('batchStateDriven',src.indexOf('PlanningWorkspaceBulkConcept.state')>=0);
  t('selectionStateDriven',src.indexOf('PlanningWorkspaceBatchSelection.state')>=0);
  t('idleSelectionCompact',src.indexOf('pw-ux-idle-selection')>=0&&src.indexOf('idleBatchSelectionCompact:true')>=0);
  t('batchMutationEvents',src.indexOf('planningworkspace:batch-staged')>=0&&src.indexOf('planningworkspace:batch-changed')>=0);
  t('shellInclude',shell.indexOf("PlanningWorkspaceUxClient.js")>=0);
  t('noRpc',src.indexOf('google.script.run')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  t('noWrites',src.indexOf('PlanningCanonical')<0&&src.indexOf('AvailabilityService')<0);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_UX_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{readOnly:true,compactPlannerOverview:true,idleBatchPanelsHidden:true,idleBatchSelectionCompact:true,newSsot:false,liveReadsPerformed:false,liveWritesPerformed:false}};
  console.log(JSON.stringify(out,null,2));return out;
}
