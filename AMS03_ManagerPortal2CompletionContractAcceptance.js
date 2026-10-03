// FILE: AMS03_ManagerPortal2CompletionContractAcceptance.js
// BUILD: 2026-10-03_COMPLETE_V29_CONTRACT_R2
// PURPOSE:
//   Read-only contract acceptance for the existing canonical completion path.
//   No audit writes are performed.
//   This file does NOT modify the pending Manager Overview -> Planning Workspace handoff.

function RUN_MANAGER_PORTAL2_COMPLETION_CONTRACT_ACCEPTANCE() {
  var out = {
    ok: true,
    build: '2026-09-26_MANAGER_PORTAL2_COMPLETION_CONTRACT_R1',
    writesPerformed: false,
    checks: []
  };

  function check_(name, ok, detail) {
    out.checks.push({ name:name, ok:!!ok, detail:String(detail || '') });
    if (!ok) out.ok = false;
  }

  check_('completionServiceAvailable', typeof CompletionService_CommitCompletion === 'function', 'Canonical completion service must exist');
  check_('managerCompletionWrapperAvailable', typeof ManagerV5_CommitCompletion === 'function', 'Existing Manager 1.0 compatibility wrapper must remain available');
  check_('statusActionOwnerAvailable', typeof Status_applyAction === 'function', 'Central status action owner must exist');
  check_('transitionOwnerAvailable', typeof Status_applyTransition_ === 'function', 'Central transition owner must exist');
  check_('logPreflightAvailable', typeof LogRealizedAuditService_PreflightAppendFromAuditPlanning === 'function', 'Completed-history preflight must exist');
  check_('logAppendAvailable', typeof LogRealizedAuditService_AppendFromAuditPlanning === 'function', 'Completed-history writer must exist');
  check_('logReadAvailable', typeof LogRealizedAuditService_GetCompletedAudit === 'function', 'Idempotent completion recovery needs completed-history lookup');
  check_('realizedHoursCorrectionAvailable', typeof CompletionService_OverrideCompletedHours === 'function', 'Manager-only realized-hours correction writer must exist');
  check_('modelCFinalizeAvailable', typeof ModelCAnnualCycle_finalizeCompletedVisit_ === 'function', 'Completed Visit must finalize Model C obligations/links');

  try {
    var managerTransition = Status_applyTransition_({
      status: 'Accepted',
      action: 'COMPLETE',
      role: 'MANAGER'
    });
    check_(
      'managerAcceptedToCompleted',
      !!(managerTransition && managerTransition.ok === true && managerTransition.afterStatus === 'COMPLETED'),
      JSON.stringify(managerTransition || {})
    );
  } catch (eTransition) {
    check_('managerAcceptedToCompleted', false, String(eTransition && eTransition.message ? eTransition.message : eTransition));
  }

  try {
    var invalidTransition = Status_applyTransition_({
      status: 'Approved',
      action: 'COMPLETE',
      role: 'MANAGER'
    });
    check_(
      'completeBlockedBeforeAccepted',
      !!(invalidTransition && invalidTransition.ok === false),
      JSON.stringify(invalidTransition || {})
    );
  } catch (eInvalid) {
    check_('completeBlockedBeforeAccepted', false, String(eInvalid && eInvalid.message ? eInvalid.message : eInvalid));
  }

  try {
    var completionSource = String(CompletionService_CommitCompletion) + '\n' + String(completionService_commitCompletion_);
    check_('completionRequiresPositiveHours', completionSource.indexOf('hoursDedicated') >= 0 && completionSource.indexOf('hoursDedicated <= 0') >= 0, 'Hours dedicated must remain > 0');
    check_('completionRequiresQuarterHours', completionSource.indexOf('steps of 0.25') >= 0, 'Canonical writer must enforce 0.25-hour increments');
    check_('completionHasIdempotentRecovery', completionSource.indexOf('alreadyCompleted:true') >= 0, 'Retry after an already committed completion must reconcile safely');
    check_('managerConcurrencyPrecedence', completionSource.indexOf('COMPLETION_MANAGER_CONCURRENCY_OVERRIDE') >= 0, 'Concurrent Manager value must be authoritative and audit-trailed');
    check_('completionAvoidsFullArtifactRebuild', completionSource.indexOf('v5_syncAuditArtifactsSafe_({ fullRebuild:true })') < 0, 'Complete hot path must not full-rebuild artifacts');
    check_('completionRequiresAcceptedStatus', completionSource.indexOf("'ACCEPTED'") >= 0 || completionSource.indexOf('"ACCEPTED"') >= 0, 'Completion must remain Accepted-only');
    check_('completionUsesLock', completionSource.indexOf('LockService.getScriptLock') >= 0, 'Completion transaction must remain serialized');
    check_('completionPreflightsLog', completionSource.indexOf('LogRealizedAuditService_PreflightAppendFromAuditPlanning') >= 0, 'Completed-history preflight must run before commit');
    check_('completionAppendsLog', completionSource.indexOf('LogRealizedAuditService_AppendFromAuditPlanning') >= 0, 'Completed history must remain canonical write destination');
    check_('completionDeletesActivePlanningRow', completionSource.indexOf('deleteRow') >= 0, 'Successful completion must remove active Audit planning row');
    check_('completionProtectsAnnualCycle', completionSource.indexOf('AnnualCycleEngineV5_HandleCompletionRow_') >= 0, 'Recurring successor handling must remain part of transaction');
    check_('completionReleasesAvailability', completionSource.indexOf('V5_availabilityClearAuditId_') >= 0 || completionSource.indexOf('AS_availabilityClearAuditId_') >= 0, 'Completion must release occupied availability');
  } catch (eSource) {
    check_('completionSourceInspectable', false, String(eSource && eSource.message ? eSource.message : eSource));
  }

  try {
    var statusSource = String(Status_applyComplete_);
    check_('statusCompleteDelegatesCanonicalService', statusSource.indexOf('CompletionService_CommitCompletion') >= 0, 'Central status action must delegate to CompletionService');
    check_('statusCompletePassesHoursDedicated', statusSource.indexOf('hoursDedicated') >= 0, 'Hours dedicated must pass through central action path');
    check_('statusCompletePreservesManagerOnBehalf', statusSource.indexOf('MANAGER_ON_BEHALF') >= 0, 'Manager completion must remain explicitly on behalf');
  } catch (eStatusSource) {
    check_('statusCompleteSourceInspectable', false, String(eStatusSource && eStatusSource.message ? eStatusSource.message : eStatusSource));
  }

  try {
    var logSource = String(LogRealizedAuditService_PreflightAppendFromAuditPlanning) + '\n' + String(LogRealizedAuditService_prepareAppend_);
    check_('logRejectsDuplicateAuditId', logSource.indexOf('duplicate:true') >= 0 || logSource.indexOf('duplicate: true') >= 0, 'Duplicate completed Audit IDs must be blocked');
    check_('logStoresHoursDedicated', logSource.indexOf('Hours dedicated') >= 0, 'Completed history must store Hours dedicated');
    var correctionSource = String(LogRealizedAuditService_UpdateCompletedHours);
    check_('correctionReturnsOldHours', correctionSource.indexOf('oldHoursDedicated') >= 0, 'Realized-hours correction must retain old value');
    check_('correctionReturnsNewHours', correctionSource.indexOf('newHoursDedicated') >= 0, 'Realized-hours correction must retain new value');
    check_('correctionRequiresQuarterHours', correctionSource.indexOf('steps of 0.25') >= 0, 'Realized-hours correction must use 0.25-hour increments');
  } catch (eLogSource) {
    check_('logSourceInspectable', false, String(eLogSource && eLogSource.message ? eLogSource.message : eLogSource));
  }

  try {
    var notifySource = typeof StatusNotificationBridge_MapEvent_ === 'function' ? String(StatusNotificationBridge_MapEvent_) : '';
    check_('managerCompleteNotificationMapped', notifySource.indexOf('COMPLETED_ON_BEHALF') >= 0, 'Existing notification mapping must be reused');
  } catch (eNotify) {
    check_('managerCompleteNotificationInspectable', false, String(eNotify && eNotify.message ? eNotify.message : eNotify));
  }

  try {
    var modelCSource = String(CompletionService_CommitCompletion);
    check_('modelCFinalizationFailsClosed', modelCSource.indexOf('MODEL_C_FINALIZATION_FAILED') >= 0, 'Model C finalization failure must not be warning-only');
  } catch (eModelC) {
    check_('modelCFinalizationInspectable', false, String(eModelC && eModelC.message ? eModelC.message : eModelC));
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
