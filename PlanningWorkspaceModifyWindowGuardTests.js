/***********************************************************************
 * PlanningWorkspaceModifyWindowGuardTests.js
 * BUILD: 2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R6_HOURS_ASSERTION
 ***********************************************************************/
var PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD='2026-09-14_WORKSPACE_MODIFY_WINDOW_GUARD_TESTS_R6_HOURS_ASSERTION';
function RUN_PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ui=PlanningWorkspaceUi_contract();
  var guard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyWindowGuard.js').getContent();
  var read=String(PlanningWorkspacePlannedAuditReadService_get);
  var readHours=String(PWPARS_hoursFromBlocks_);
  var modify=String(PlanningCanonicalModifyService_modify);
  var actions=HtmlService.createHtmlOutputFromFile('PlanningWorkspacePlannedAuditActions.js').getContent();

  t('guardIncluded',ui.modifyWindowGuardInclude==='PlanningWorkspaceModifyWindowGuard.js',ui.modifyWindowGuardInclude);
  t('plannedDetailOnDemandRetained',ui.plannedDetailOnDemand===true);
  t('readExposesWindowFrom',read.indexOf('planningWindowFrom')>=0);
  t('readExposesWindowTo',read.indexOf('planningWindowTo')>=0);
  t('readExposesRequiredHours',read.indexOf('requiredHours:requiredHours')>=0);
  t('readMarksWindowHard',read.indexOf('planningWindowHard:true')>=0);
  t('readDerivesPlannedHoursWhenMissing',read.indexOf('PWPARS_hoursFromBlocks_')>=0&&readHours.indexOf('mins/60')>=0);
  t('guardLoadsCanonicalDetail',guard.indexOf('PlanningWorkspaceRpc_getPlannedAudit')>=0);
  t('guardShowsStrictWindowBanner',guard.indexOf('Planning window:')>=0&&guard.indexOf('hard limit')>=0&&guard.indexOf('Modify exception active')<0);
  t('guardUsesEffectiveTodayFloor',guard.indexOf('effectiveFrom=maxIso(from,today)')>=0&&guard.indexOf('inputs[i].min=effectiveFrom')>=0);
  t('guardKeepsUpperWindowMax',guard.indexOf('inputs[i].max=to')>=0&&guard.indexOf("removeAttribute('max')")<0);
  t('pastNewDatesStillBlocked',guard.indexOf('Past date not allowed')>=0);
  t('outsideWindowDatesBlocked',guard.indexOf('Outside planning window')>=0&&guard.indexOf('data-pw-window-blocked')>=0);
  t('currentAuditDatesNotBlockedAgainstSelf',guard.indexOf('var isCurrent=markCurrentAudit')>=0&&guard.indexOf('var out=!isCurrent')>=0);
  t('currentAuditLabelVisible',guard.indexOf("span.textContent='Current audit'")>=0&&guard.indexOf('data-pw-current-audit')>=0);
  t('pickerLabelParserAcceptsCommaOrSpace',guard.indexOf('[,\\s]+')>=0);
  t('baseUnavailableLabelVisible',guard.indexOf('Unavailable (base availability)')>=0);
  t('guardCalculatesPlannedHours',guard.indexOf('function plannedHoursFromModal(')>=0&&guard.indexOf('Math.round((mins/60)*100)/100')>=0);
  t('guardShowsRequiredPlannedMissing',guard.indexOf("hoursStatus.textContent='Required: '")>=0&&guard.indexOf('h · Planned: ')>=0&&guard.indexOf('h · Missing: ')>=0);
  t('guardBlocksSaveWhenHoursShort',guard.indexOf('hoursBlocked=required>0')>=0&&guard.indexOf('blocked.length||hoursBlocked')>=0);
  t('guardDoesNotBlindlyEnableSave',guard.indexOf('save.disabled=false')<0);
  t('guardSchedulesFreshReloadAfterSuccessfulSave',guard.indexOf('scheduleFreshReload')>=0&&guard.indexOf('__pwSaveAttempted')>=0&&guard.indexOf("c.load('load')")>=0);
  t('backendHasNoWindowException',modify.indexOf('windowException')<0&&modify.indexOf('PCMOD_existingOutsideWindow_')<0);
  t('backendPastDateRuleRetained',modify.indexOf('PAST_DATE_NOT_ALLOWED')>=0&&modify.indexOf('PCMOD_pastDates_')>=0);
  t('backendReturnsHoursFailureDetail',modify.indexOf('plannedHours:validation&&validation.plannedHours')>=0&&modify.indexOf('requiredHours:validation&&validation.requiredHours')>=0);
  t('pickerMondayStartRetained',actions.indexOf('function mondayStart(')>=0&&actions.indexOf('start=mondayStart(anchor)')>=0);
  t('noNewSsot',ui.newSsot===false&&read.indexOf('newSsot:false')>=0);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_MODIFY_WINDOW_GUARD_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Modify obeys the strict canonical planning window, shows current audit dates distinctly, preserves base unavailability, derives planned hours from canonical blocks when needed, and blocks Save with an explicit Required/Planned/Missing-hours message when planned hours are insufficient.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
