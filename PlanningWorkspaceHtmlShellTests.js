/***********************************************************************
 * PlanningWorkspaceHtmlShellTests.js
 * BUILD: 2026-09-11_PLANNING_WORKSPACE_FULL_LAYOUT_TESTS_R3
 ***********************************************************************/
var PLANNING_WORKSPACE_HTML_SHELL_TEST_BUILD='2026-09-11_PLANNING_WORKSPACE_FULL_LAYOUT_TESTS_R3';
function RUN_PLANNING_WORKSPACE_HTML_SHELL_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var html=HtmlService.createTemplateFromFile('PlanningWorkspace').getRawContent();
  t('htmlPresent',!!html);t('buildMarker',html.indexOf('2026-09-11_PLANNING_WORKSPACE_FULL_LAYOUT_R1')>=0);
  t('filters',html.indexOf('id="pwFrom"')>=0&&html.indexOf('id="pwTo"')>=0&&html.indexOf('id="pwCountry"')>=0&&html.indexOf('id="pwScope"')>=0);
  t('kpis',html.indexOf('id="kToPlan"')>=0&&html.indexOf('id="kReady"')>=0&&html.indexOf('id="kBlocked"')>=0&&html.indexOf('id="kConcept"')>=0&&html.indexOf('id="kPlanned"')>=0);
  t('plannerAttention',html.indexOf('id="attentionBody"')>=0);t('auditorWorkload',html.indexOf('id="workloadBody"')>=0);t('batchSelection',html.indexOf('id="batchChips"')>=0);t('planningCalendar',html.indexOf('id="calendar"')>=0);
  t('calendarFilters',html.indexOf('id="calAuditor"')>=0&&html.indexOf('id="calScope"')>=0&&html.indexOf('id="calCountry"')>=0);
  t('clientInclude',html.indexOf('PlanningWorkspaceClient.js')>=0);t('noInlineScript',html.indexOf('<script')<0);t('noDirectRpcInShell',html.indexOf('google.script.run')<0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_HTML_SHELL_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,operationalLayout:true,rawJsonShell:false}};console.log(JSON.stringify(out,null,2));return out;
}
