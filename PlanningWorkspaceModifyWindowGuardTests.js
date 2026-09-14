/***********************************************************************
 * PlanningWorkspaceModifyWindowGuardTests.js
 * BUILD: 2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R3_EXISTING_OUTSIDE
 ***********************************************************************/
var PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD='2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R3_EXISTING_OUTSIDE';
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
  t('guardShowsCanonicalWindowBanner',guard.indexOf('Canonical planning window:')>=0&&guard.indexOf('Modify exception active')>=0);
  t('guardDetectsExistingOutsideWindow',guard.indexOf('function existingOutsideWindow(')>=0&&guard.indexOf('existingOutsideWindow(detail,from,to)')>=0);
  t('normalModifyStillUsesWindow',guard.indexOf('return within(date,from,to)')>=0);
  t('existingOutsideAllowsFutureDates',guard.indexOf('if(exceptionActive)return true')>=0);
  t('pastNewDatesStillBlocked',guard.indexOf("date<today")>=0&&guard.indexOf('Past date not allowed')>=0);
  t('currentAuditDatesNotBlocked',guard.indexOf('var isCurrent=markCurrentAudit')>=0&&guard.indexOf('var out=!isCurrent')>=0);
  t('currentAuditLabelVisible',guard.indexOf("span.textContent='Current audit'")>=0&&guard.indexOf('data-pw-current-audit')>=0);
  t('baseUnavailableLabelVisible',guard.indexOf('Unavailable (base availability)')>=0);
  t('exceptionRemovesUpperInputMax',guard.indexOf("inputs[i].removeAttribute('max')")>=0);
  t('normalModeKeepsUpperInputMax',guard.indexOf('inputs[i].max=to')>=0);
  t('guardSchedulesFreshReloadAfterSuccessfulSave',guard.indexOf('scheduleFreshReload')>=0&&guard.indexOf('__pwSaveAttempted')>=0&&guard.indexOf("c.load('load')")>=0);
  t('backendHasExistingOutsideException',modify.indexOf('PCMOD_existingOutsideWindow_')>=0&&modify.indexOf('windowException=existingOutside')>=0);
  t('backendExceptionWindowOnly',modify.indexOf("PLANNING_WINDOW_OUTSIDE")>=0&&modify.indexOf('PCMOD_gateOnlyWindowHardBlock_')>=0);
  t('backendRevisionMustRemainAccepted',String(PCMOD_gateOnlyWindowHardBlock_).indexOf('revisionAccepted!==true')>=0);
  t('backendPastDateRuleRetained',modify.indexOf('PAST_DATE_NOT_ALLOWED')>=0&&modify.indexOf('PCMOD_pastDates_')>=0);
  t('pickerMondayStartRetained',actions.indexOf('function mondayStart(')>=0&&actions.indexOf('start=mondayStart(anchor)')>=0);
  t('noNewSsot',ui.newSsot===false&&read.indexOf('newSsot:false')>=0);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Normal Modify obeys the canonical planning window. Existing planning already outside that window receives a Modify-only exception for future dates. Current audit dates are labelled distinctly and base unavailability remains hard.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
