/***********************************************************************
 * PlanningWorkspaceModifyWindowGuardTests.js
 * BUILD: 2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD='2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R1';
function RUN_PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var guard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyWindowGuard.js').getContent();
  var read=String(PlanningWorkspacePlannedAuditReadService_get);
  var modify=String(PlanningCanonicalModifyService_modify);
  var actions=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedAuditActions.js').getContent();

  t('guardIncluded',ui.modifyWindowGuardInclude==='PlanningWorkspaceModifyWindowGuard.js',ui.modifyWindowGuardInclude);
  t('plannedDetailOnDemandRetained',ui.plannedDetailOnDemand===true);
  t('readExposesWindowFrom',read.indexOf('planningWindowFrom')>=0);
  t('readExposesWindowTo',read.indexOf('planningWindowTo')>=0);
  t('readMarksWindowHard',read.indexOf('planningWindowHard:true')>=0);
  t('guardLoadsCanonicalDetail',guard.indexOf('PlanningWorkspaceRpc_getPlannedAudit')>=0);
  t('guardShowsWindowBanner',guard.indexOf('Planning window:')>=0&&guard.indexOf('hard limit')>=0);
  t('guardDisablesOutsidePickerDates',guard.indexOf("data-pw-window-blocked")>=0&&guard.indexOf("Outside planning window")>=0);
  t('guardConstrainsDateInputs',guard.indexOf('inputs[i].min=from')>=0&&guard.indexOf('inputs[i].max=to')>=0);
  t('guardBlocksSaveOutsideWindow',guard.indexOf("if(save)save.disabled=true")>=0);
  t('guardAllowsInsideWindow',guard.indexOf('function within(')>=0);
  t('modifyHasNoGrandfatherBypass',modify.indexOf('PCMOD_grandfatherWindow_')<0&&modify.indexOf('GATE_ACCEPTED_GRANDFATHERED_RESCHEDULE')<0);
  t('modifyGateStillHard',modify.indexOf("if(!gate||gate.canCommit!==true)return")>=0);
  t('pickerMondayStartRetained',actions.indexOf('function mondayStart(')>=0&&actions.indexOf('start=mondayStart(anchor)')>=0);
  t('noNewSsot',ui.newSsot===false&&read.indexOf('newSsot:false')>=0);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Planning window is displayed and enforced in Modify UI before Save; backend canonical planning window remains authoritative hard rule.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
