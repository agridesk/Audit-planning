/**
 * =========================================================
 * COMPLETION SERVICE
 * =========================================================
 * Build: 2026-04-30_STRUCTURAL_COMPLETION_FIX_REVIEWED
 *
 * PURPOSE
 * - Centralized completion commit service for Auditor + Manager flows.
 * - Uses LogRealizedAuditService as owner for Log realized audits writes.
 * - Does NOT depend on missing ManagerV5 legacy row-object helpers.
 *
 * REQUIRED COMPANION FILE
 * - LogRealizedAuditService.gs
 *
 * PUBLIC API
 * - CompletionService_CommitCompletion(payload)
 * - CompletionService_OverrideCompletedHours(payload)
 * - ManagerV5_CommitCompletion(payload)
 * - CompletionService_RuntimeSmokeTest()
 *
 * PAYLOAD
 * {
 *   auditId: string,
 *   hoursDedicated: number,
 *   actorEmail: string,
 *   mode: 'AUDITOR' | 'MANAGER_ON_BEHALF',
 *   reason?: string
 * }
 * =========================================================
 */

var COMPLETION_SERVICE_BUILD = '2026-07-03_COMPLETION_CALENDAR_CACHE_INVALIDATION_3S_R1';
var COMPLETION_SHEET_AUDIT_PLANNING = 'Audit planning';
var COMPLETION_LOCK_WAIT_MS = 10000;
var COMPLETION_LOCK_RETRY_SLEEP_MS = 250;

function CompletionService_CommitCompletion(payload) {
  return completionService_commitCompletion_(payload);
}

function CompletionService_OverrideCompletedHours(payload) {
  return completionService_overrideCompletedHours_(payload);
}

/**
 * Manager UI compatibility wrapper.
 * ManagerV5UI.html calls this exact name via google.script.run.
 */
function ManagerV5_CommitCompletion(payload) {
  payload = payload || {};
  if (!String(payload.mode || '').trim()) payload.mode = 'MANAGER_ON_BEHALF';
  return CompletionService_CommitCompletion(payload);
}

function CompletionService_RuntimeSmokeTest() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shPlan = ss.getSheetByName(COMPLETION_SHEET_AUDIT_PLANNING);
  var out = {
    success:true,
    build:COMPLETION_SERVICE_BUILD,
    dependencies:{
      LogRealizedAuditService_AppendFromAuditPlanning: typeof LogRealizedAuditService_AppendFromAuditPlanning === 'function',
      LogRealizedAuditService_PreflightAppendFromAuditPlanning: typeof LogRealizedAuditService_PreflightAppendFromAuditPlanning === 'function',
      LogRealizedAuditService_UpdateCompletedHours: typeof LogRealizedAuditService_UpdateCompletedHours === 'function',
      V5_availabilityClearAuditId_: typeof V5_availabilityClearAuditId_ === 'function',
      AS_availabilityClearAuditId_: typeof AS_availabilityClearAuditId_ === 'function',
      AnnualCycleEngineV5_HandleCompletionRow_: typeof AnnualCycleEngineV5_HandleCompletionRow_ === 'function'
    },
    sheets:{
      auditPlanning: !!shPlan,
      logRealized: !!ss.getSheetByName('Log realized audits')
    },
    auditPlanningHeaders:{},
    logService:null
  };

  if (shPlan) {
    var headers = shPlan.getRange(1, 1, 1, shPlan.getLastColumn()).getValues()[0] || [];
    var required = ['Audit ID','Status','Assigned to','Date - Planned','Planning JSON','Company','Company_UID'];
    for (var i = 0; i < required.length; i++) {
      out.auditPlanningHeaders[required[i]] = completionService_findHeaderIndex_(headers, [required[i]]) >= 0;
    }
  }

  if (typeof LogRealizedAuditService_Diagnose === 'function') {
    try { out.logService = LogRealizedAuditService_Diagnose(); } catch (eLogDiag) { out.logService = { success:false, message:completionService_errMsg_(eLogDiag) }; }
  }

  if (!out.dependencies.LogRealizedAuditService_AppendFromAuditPlanning || !out.dependencies.LogRealizedAuditService_PreflightAppendFromAuditPlanning || !out.dependencies.LogRealizedAuditService_UpdateCompletedHours) out.success = false;
  if (!out.dependencies.V5_availabilityClearAuditId_ && !out.dependencies.AS_availabilityClearAuditId_) out.success = false;
  if (!out.sheets.auditPlanning || !out.sheets.logRealized) out.success = false;
  if (out.logService && out.logService.success === false) out.success = false;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function completionService_commitCompletion_(payload) {
  var lock = LockService.getScriptLock();
  if (!completionService_acquireLock_(lock, COMPLETION_LOCK_WAIT_MS, COMPLETION_LOCK_RETRY_SLEEP_MS)) {
    return { success:false, message:'Completion commit failed: could not acquire completion lock in time' };
  }

  try {
    if (!payload || typeof payload !== 'object') return { success:false, message:'Invalid payload' };

    var auditId = completionService_normAuditId_(payload.auditId);
    var actorEmail = completionService_normEmail_(payload.actorEmail || payload.email || payload.userEmail || '');
    var mode = String(payload.mode || '').trim().toUpperCase();
    var hoursDedicated = Number(payload.hoursDedicated);

    if (!auditId) return { success:false, message:'Missing auditId' };
    if (!actorEmail) return { success:false, message:'Missing actorEmail' };
    if (!isFinite(hoursDedicated) || hoursDedicated <= 0) return { success:false, message:'Hours dedicated must be > 0' };
    if (mode !== 'AUDITOR' && mode !== 'MANAGER_ON_BEHALF') return { success:false, message:'Invalid mode' };

    if (mode === 'MANAGER_ON_BEHALF') {
      if (typeof managerV5_isManagerActor_ === 'function' && !managerV5_isManagerActor_(actorEmail)) {
        return { success:false, message:'Manager role required' };
      }
    }

    if (typeof LogRealizedAuditService_AppendFromAuditPlanning !== 'function') return { success:false, message:'Missing dependency: LogRealizedAuditService_AppendFromAuditPlanning. Add LogRealizedAuditService.gs.' };
    if (typeof LogRealizedAuditService_PreflightAppendFromAuditPlanning !== 'function') return { success:false, message:'Missing dependency: LogRealizedAuditService_PreflightAppendFromAuditPlanning. Add reviewed LogRealizedAuditService.gs.' };
    if (typeof V5_availabilityClearAuditId_ !== 'function' && typeof AS_availabilityClearAuditId_ !== 'function') return { success:false, message:'Missing dependency: availability clear helper. Complete must release availability.' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shPlan = ss.getSheetByName(typeof SHEET_AUDIT_PLANNING !== 'undefined' ? SHEET_AUDIT_PLANNING : COMPLETION_SHEET_AUDIT_PLANNING);
    if (!shPlan) return { success:false, message:'Missing sheet: ' + COMPLETION_SHEET_AUDIT_PLANNING };

    var rowPack = completionService_getAuditPlanningRowPack_(shPlan, auditId);
    if (!rowPack.success) return rowPack;

    var rowObj = rowPack.rowObj;
    var currentStatus = completionService_getCell_(rowObj, ['Status']);
    if (!completionService_statusEquals_(currentStatus, 'ACCEPTED')) {
      return { success:false, message:'Invalid status for Complete: ' + currentStatus };
    }

    var assignedTo = completionService_normEmail_(completionService_getCell_(rowObj, ['Assigned to', 'Assigned auditor', 'Auditor']));
    if (mode === 'AUDITOR') {
      if (assignedTo && assignedTo !== actorEmail) return { success:false, message:'Only the assigned auditor may complete this audit' };
    }

    var companyUid = completionService_clean_(completionService_getCell_(rowObj, ['Company_UID', 'Company UID', 'CompanyUid']));
    var companyName = completionService_clean_(completionService_getCell_(rowObj, ['Company']));
    var managerEmail = completionService_resolveManagerEmail_(rowObj, companyUid, companyName, actorEmail, mode);
    var completedStatusValue = completionService_getCompletedDisplayStatus_();
    var datePlanned = completionService_normDateText_(completionService_getCell_(rowObj, ['Date - Planned', 'Date planned']), completionService_getDisplayCell_(rowObj, ['Date - Planned', 'Date planned']));

    // F4-I-fix-1 (_d12): MANAGER_ON_BEHALF flow auto-stamps Date-Approved via
    // SaveScheduleService PLAN (Contract §2.2) and Date-Accepted as part of the
    // admin-shortcut. Those are admin-dates, not real approval/acceptance
    // dates. Per F4_AUDIT §3.7 + L398-413, do NOT propagate to Log realized.
    // Real auditor flow (mode='AUDITOR') keeps the live values.
    var isOnBehalf = (mode === 'MANAGER_ON_BEHALF');
    var dateApprovedForLog = isOnBehalf ? '' : completionService_normDateText_(completionService_getCell_(rowObj, ['Date - Approved', 'Date approved']), completionService_getDisplayCell_(rowObj, ['Date - Approved', 'Date approved']));
    var dateAcceptedForLog = isOnBehalf ? '' : completionService_normDateText_(completionService_getCell_(rowObj, ['Date accepted', 'Date - Accepted', 'Date Accepted']), completionService_getDisplayCell_(rowObj, ['Date accepted', 'Date - Accepted', 'Date Accepted']));

    var logMeta = {
      auditId:auditId,
      status:completedStatusValue,
      hoursDedicated:hoursDedicated,
      auditorEmail:assignedTo || actorEmail,
      companyUid:companyUid,
      companyName:companyName,
      managerEmail:managerEmail,
      dateCompleted:completionService_todayISO_(),
      datePlanned:datePlanned,
      dateApproved:dateApprovedForLog,
      dateAccepted:dateAcceptedForLog,
      year:datePlanned ? String(datePlanned).slice(0, 4) : ''
    };

    var preflight = LogRealizedAuditService_PreflightAppendFromAuditPlanning(rowObj, logMeta);
    if (!preflight || preflight.success === false) {
      return {
        success:false,
        message:(preflight && preflight.message) ? preflight.message : 'Log realized audits preflight failed',
        logPreflight:preflight || null
      };
    }

    // R1 hardening (2026-05-20): annual-cycle handling is part of the
    // completion transaction, not a best-effort afterthought. The old flow
    // allowed AnnualCycleEngineV5_HandleCompletionRow_ to return success:false
    // without blocking the later availability release, Log realized append and
    // Audit planning delete. That could move a recurring completed audit to
    // Log realized audits without creating a successor row.
    if (typeof AnnualCycleEngineV5_HandleCompletionRow_ !== 'function') {
      return {
        success:false,
        code:'ANNUAL_CYCLE_ENGINE_MISSING',
        message:'Missing dependency: AnnualCycleEngineV5_HandleCompletionRow_. Complete blocked before log/delete to protect recurring successor creation.',
        logPreflight:preflight
      };
    }

    var cycleResult = { success:true, recurring:false, spawned:false, nextCycleEligible:false, skipped:true };
    try {
      cycleResult = AnnualCycleEngineV5_HandleCompletionRow_(rowObj) || cycleResult;
    } catch (eCycle) {
      return {
        success:false,
        code:'ANNUAL_CYCLE_EXCEPTION',
        message:'Annual cycle failed before completion commit: ' + completionService_errMsg_(eCycle),
        logPreflight:preflight
      };
    }

    if (!cycleResult || cycleResult.success === false) {
      return {
        success:false,
        code:'ANNUAL_CYCLE_FAILED',
        message:'Annual cycle failed before completion commit: ' + ((cycleResult && cycleResult.message) ? cycleResult.message : 'unknown annual-cycle failure'),
        logPreflight:preflight,
        cycleResult:cycleResult || null
      };
    }

    if (cycleResult.recurring === true && cycleResult.nextCycleEligible === true && cycleResult.spawned !== true && cycleResult.duplicatePrevented !== true) {
      return {
        success:false,
        code:'ANNUAL_CYCLE_RECURRING_NO_SUCCESSOR',
        message:'Recurring audit did not create or find a successor. Complete blocked before log/delete.',
        logPreflight:preflight,
        cycleResult:cycleResult
      };
    }

    var availabilityRelease = null;
    try {
      if (typeof V5_availabilityClearAuditId_ === 'function') availabilityRelease = V5_availabilityClearAuditId_(auditId);
      else availabilityRelease = AS_availabilityClearAuditId_(auditId);
    } catch (eAvail) {
      return { success:false, message:'Availability release failed before completion commit: ' + completionService_errMsg_(eAvail), logPreflight:preflight, cycleResult:cycleResult };
    }
    if (availabilityRelease && availabilityRelease.success === false) {
      return { success:false, message:'Availability release failed before completion commit: ' + (availabilityRelease.message || availabilityRelease.error || 'unknown error'), availabilityRelease:availabilityRelease, logPreflight:preflight, cycleResult:cycleResult };
    }

    var logResult = LogRealizedAuditService_AppendFromAuditPlanning(rowObj, logMeta);
    if (!logResult || logResult.success === false) {
      return {
        success:false,
        message:(logResult && logResult.message) ? logResult.message : 'Log realized audits append failed after preflight',
        logResult:logResult || null,
        availabilityRelease:availabilityRelease,
        cycleResult:cycleResult
      };
    }


    var lifecycle = completionService_lifecycleOnStatusChanged_(rowPack, {
      auditId:auditId,
      action:'COMPLETE',
      actorRole:(mode === 'MANAGER_ON_BEHALF' ? 'MANAGER' : 'AUDITOR'),
      actorEmail:actorEmail,
      beforeStatus:currentStatus,
      afterStatus:completedStatusValue,
      reason:completionService_clean_(payload.reason || ''),
      source:'CompletionService.completionService_commitCompletion_'
    });

    try {
      shPlan.deleteRow(rowPack.rowIndex);
    } catch (eDel) {
      return { success:false, message:'Logged, but could not remove from Audit planning: ' + completionService_errMsg_(eDel), logResult:logResult, availabilityRelease:availabilityRelease, cycleResult:cycleResult };
    }

    var calendarCacheInvalidationContext = completionService_calendarInvalidationContextFromRowObj_(rowObj, assignedTo || actorEmail, datePlanned);
    completionService_clearCaches_(auditId, calendarCacheInvalidationContext);

    var auditTrail = { success:true, skipped:true };
    try {
      var shNotif = ss.getSheetByName(typeof SHEET_NOTIFICATION_QUEUE !== 'undefined' ? SHEET_NOTIFICATION_QUEUE : 'Notification Queue');
      if (shNotif && mode === 'MANAGER_ON_BEHALF' && typeof managerV5_appendAuditTrailToNotificationQueue_ === 'function') {
        managerV5_appendAuditTrailToNotificationQueue_(shNotif, {
          type:'COMPLETED_ON_BEHALF',
          auditId:auditId,
          managerEmail:actorEmail,
          hours:hoursDedicated,
          reason:String(payload.reason || '').trim(),
          company:companyName
        });
        auditTrail = { success:true, skipped:false };
      }
    } catch (eTrail) {
      auditTrail = { success:false, message:completionService_errMsg_(eTrail) };
    }

    var artifactSync = (typeof v5_syncAuditArtifactsSafe_ === 'function')
      ? v5_syncAuditArtifactsSafe_({ fullRebuild:true })
      : { success:false, message:'artifact sync helper missing' };

    return {
      success:true,
      logged:true,
      moved:true,
      auditId:auditId,
      logResult:logResult,
      lifecycle:lifecycle,
      metadataWritten:!!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten)),
      availabilityRelease:availabilityRelease || { success:true, skipped:false },
      auditTrail:auditTrail,
      nextCycleEligible:!!cycleResult.nextCycleEligible,
      recurring:!!cycleResult.recurring,
      spawned:!!cycleResult.spawned,
      nextAuditId:cycleResult.nextAuditId || '',
      nextExpiry:cycleResult.nextExpiry || '',
      duplicatePrevented:!!cycleResult.duplicatePrevented,
      artifactSync:artifactSync,
      build:COMPLETION_SERVICE_BUILD,
      message:'Completion committed'
    };

  } catch (e) {
    return { success:false, message:'Exception: ' + completionService_errMsg_(e) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function completionService_lifecycleOnStatusChanged_(rowPack, event) {
  try {
    if (typeof Lifecycle_onStatusChanged_ !== 'function') {
      return { success:true, skipped:true, reason:'Lifecycle_onStatusChanged_ unavailable' };
    }
    rowPack = rowPack || {};
    event = event || {};
    return Lifecycle_onStatusChanged_({
      auditId:event.auditId,
      action:event.action,
      actorRole:event.actorRole,
      actorEmail:event.actorEmail,
      beforeStatus:event.beforeStatus,
      afterStatus:event.afterStatus,
      reason:event.reason,
      source:event.source || 'CompletionService',
      sheet:(rowPack && rowPack.sheet) || (function(){ try { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMPLETION_SHEET_AUDIT_PLANNING); } catch(e) { return null; } })(),
      rowIndex:rowPack.rowIndex,
      headers:rowPack.headers,
      row:rowPack.values,
      payload:event
    });
  } catch (e) {
    return { success:false, message:'Completion lifecycle side effects failed: ' + completionService_errMsg_(e) };
  }
}

function completionService_overrideCompletedHours_(payload) {
  var lock = LockService.getScriptLock();
  if (!completionService_acquireLock_(lock, COMPLETION_LOCK_WAIT_MS, COMPLETION_LOCK_RETRY_SLEEP_MS)) {
    return { success:false, message:'Override failed: could not acquire completion lock in time' };
  }

  try {
    if (!payload || typeof payload !== 'object') return { success:false, message:'Invalid payload' };
    var auditId = completionService_normAuditId_(payload.auditId);
    var actorEmail = completionService_normEmail_(payload.actorEmail || payload.email || payload.userEmail || '');
    var hoursDedicated = Number(payload.hoursDedicated);
    var reason = completionService_clean_(payload.reason || '');

    if (!auditId) return { success:false, message:'Missing auditId' };
    if (!actorEmail) return { success:false, message:'Missing actorEmail' };
    if (!isFinite(hoursDedicated) || hoursDedicated <= 0) return { success:false, message:'Hours dedicated must be > 0' };
    if (!reason) return { success:false, message:'Reason required' };
    if (typeof managerV5_isManagerActor_ === 'function' && !managerV5_isManagerActor_(actorEmail)) return { success:false, message:'Manager role required' };
    if (typeof LogRealizedAuditService_UpdateCompletedHours !== 'function') return { success:false, message:'Missing dependency: LogRealizedAuditService_UpdateCompletedHours. Add LogRealizedAuditService.gs.' };

    var res = LogRealizedAuditService_UpdateCompletedHours(auditId, hoursDedicated, { status:completionService_getCompletedDisplayStatus_() });
    if (!res || res.success === false) return res;

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var shNotif = ss.getSheetByName(typeof SHEET_NOTIFICATION_QUEUE !== 'undefined' ? SHEET_NOTIFICATION_QUEUE : 'Notification Queue');
      if (shNotif && typeof managerV5_appendAuditTrailToNotificationQueue_ === 'function') {
        managerV5_appendAuditTrailToNotificationQueue_(shNotif, {
          type:'COMPLETED_HOURS_OVERRIDE',
          auditId:auditId,
          managerEmail:actorEmail,
          hours:hoursDedicated,
          reason:reason,
          company:''
        });
      }
    } catch (eTrail) {}

    return { success:true, auditId:auditId, hoursDedicated:hoursDedicated, message:'Completed hours overridden' };
  } catch (e) {
    return { success:false, message:'Exception: ' + completionService_errMsg_(e) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function completionService_getAuditPlanningRowPack_(sheet, auditId) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { success:false, message:'Audit planning is empty' };

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var auditIdCol = completionService_findHeaderIndex_(headers, ['Audit ID']);
  if (auditIdCol < 0) return { success:false, message:'Audit planning missing Audit ID column' };

  var idVals = sheet.getRange(2, auditIdCol + 1, lastRow - 1, 1).getValues();
  var rowIndex = 0;
  for (var i = 0; i < idVals.length; i++) {
    if (completionService_normAuditId_(idVals[i][0]) === auditId) {
      rowIndex = i + 2;
      break;
    }
  }
  if (!rowIndex) return { success:false, message:'Audit not found in Audit planning: ' + auditId };

  var values = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0] || [];
  var displayValues = sheet.getRange(rowIndex, 1, 1, lastCol).getDisplayValues()[0] || [];
  var rowObj = completionService_buildRowObject_(headers, values, displayValues, rowIndex);
  return { success:true, rowIndex:rowIndex, headers:headers, values:values, displayValues:displayValues, rowObj:rowObj };
}

function completionService_buildRowObject_(headers, values, displayValues, rowIndex) {
  var byHeader = {};
  var displayByHeader = {};
  var headerMap = {};
  for (var i = 0; i < headers.length; i++) {
    var raw = completionService_clean_(headers[i]);
    var key = completionService_normHeader_(raw);
    if (!key) continue;
    byHeader[key] = values[i];
    displayByHeader[key] = displayValues[i];
    headerMap[key] = i;
  }
  var obj = {
    rowIndex:rowIndex,
    headers:headers,
    values:values,
    row:values,
    displayValues:displayValues,
    byHeader:byHeader,
    valuesByHeader:byHeader,
    map:byHeader,
    displayByHeader:displayByHeader,
    displayMap:displayByHeader,
    headerMap:headerMap
  };
  for (var j = 0; j < headers.length; j++) {
    var rawKey = completionService_clean_(headers[j]);
    if (rawKey && obj[rawKey] === undefined) obj[rawKey] = values[j];
    var normKey = completionService_normHeader_(rawKey).replace(/\s+/g, '_');
    if (normKey && obj[normKey] === undefined) obj[normKey] = values[j];
  }
  return obj;
}

function completionService_getCell_(rowObj, candidates) {
  if (!rowObj) return '';
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var byHeader = rowObj.byHeader || rowObj.valuesByHeader || rowObj.map || {};
  for (var i = 0; i < candidates.length; i++) {
    var key = completionService_normHeader_(candidates[i]);
    if (byHeader.hasOwnProperty(key)) return byHeader[key];
  }
  return '';
}

function completionService_getDisplayCell_(rowObj, candidates) {
  if (!rowObj) return '';
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var displayByHeader = rowObj.displayByHeader || rowObj.displayMap || {};
  for (var i = 0; i < candidates.length; i++) {
    var key = completionService_normHeader_(candidates[i]);
    if (displayByHeader.hasOwnProperty(key)) return displayByHeader[key];
  }
  return '';
}

function completionService_findHeaderIndex_(headers, candidates) {
  headers = headers || [];
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = completionService_normHeader_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var k = completionService_normHeader_(candidates[j]);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

function completionService_resolveManagerEmail_(rowObj, companyUid, companyName, actorEmail, mode) {
  if (mode === 'MANAGER_ON_BEHALF') return actorEmail;

  var managerEmail = completionService_normEmail_(completionService_getCell_(rowObj, ['Manager_Email', 'Manager Email', 'Manager e-mail']));
  if (managerEmail) return managerEmail;

  if (typeof CompaniesIndex_GetCompanyManagerEmail === 'function') {
    try {
      managerEmail = completionService_normEmail_(CompaniesIndex_GetCompanyManagerEmail(companyUid, companyName));
      if (managerEmail) return managerEmail;
    } catch (e1) {}
  }
  return '';
}


function completionService_calendarInvalidationContextFromRowObj_(rowObj, fallbackAuditorEmail, fallbackDatePlanned) {
  var out = {
    auditorEmail: completionService_normEmail_(fallbackAuditorEmail || ''),
    monthKeys: []
  };
  var keys = {};

  try {
    if (!out.auditorEmail) {
      out.auditorEmail = completionService_normEmail_(completionService_getCell_(rowObj, ['Assigned to', 'Assigned auditor', 'Auditor']));
    }
  } catch (eEmail) {}

  function addDate_(v) {
    var iso = completionService_normDateText_(v, v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) keys[iso.slice(0, 7)] = true;
  }

  try {
    var pj = completionService_clean_(completionService_getCell_(rowObj, ['Planning JSON', 'Planning_JSON']));
    if (pj) {
      var data = JSON.parse(pj);
      var slots = [];
      if (data && Array.isArray(data.blocks)) slots = data.blocks;
      else if (data && Array.isArray(data.slots)) slots = data.slots;
      else if (Array.isArray(data)) slots = data;
      for (var i = 0; i < slots.length; i++) {
        addDate_((slots[i] && (slots[i].date || slots[i].dateISO || slots[i].plannedDate)) || '');
      }
    }
  } catch (eJson) {}

  try { addDate_(fallbackDatePlanned || ''); } catch (eDate1) {}
  try { addDate_(completionService_getCell_(rowObj, ['Date - Planned', 'Date planned'])); } catch (eDate2) {}

  out.monthKeys = Object.keys(keys).sort();
  return out;
}

function completionService_invalidateCalendarCachesForContext_(ctx) {
  ctx = ctx || {};
  var email = completionService_normEmail_(ctx.auditorEmail || '');
  var monthKeys = Array.isArray(ctx.monthKeys) ? ctx.monthKeys : [];
  var results = [];

  if (!email || email.indexOf('@') < 0) {
    return { success:true, skipped:true, reason:'NO_AUDITOR_EMAIL', auditorEmail:email, monthKeys:monthKeys };
  }

  if (!monthKeys.length) {
    try {
      if (typeof TDM_invalidateAvailabilityMonthCachesForAuditor === 'function') {
        return TDM_invalidateAvailabilityMonthCachesForAuditor(email, { lite:false });
      }
    } catch (eAll) {
      return { success:false, auditorEmail:email, monthKeys:monthKeys, error:String(eAll && eAll.message ? eAll.message : eAll) };
    }
    return { success:true, skipped:true, reason:'NO_MONTH_KEYS_AND_NO_BULK_INVALIDATOR', auditorEmail:email, monthKeys:monthKeys };
  }

  for (var i = 0; i < monthKeys.length; i++) {
    try {
      if (typeof TDM_invalidateAvailabilityMonthCache === 'function') {
        results.push(TDM_invalidateAvailabilityMonthCache(email, monthKeys[i], { lite:false }));
      }
    } catch (eOne) {
      results.push({ success:false, auditorEmail:email, monthKey:monthKeys[i], error:String(eOne && eOne.message ? eOne.message : eOne) });
    }
  }

  return { success:true, auditorEmail:email, monthKeys:monthKeys, invalidated:results.length, results:results };
}

function completionService_clearCaches_(auditId, calendarCtx) {
  try { if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_(); } catch(e0) {}
  try { if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId); } catch(e1) {}
  try { if (typeof _mp_aud_cacheInvalidate_ === 'function') _mp_aud_cacheInvalidate_(auditId); } catch(e2) {}
  try { if (typeof V5_clearManagerOpenCache_ === 'function') V5_clearManagerOpenCache_(); } catch(e3) {}
  try { if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') AUDIT_CACHE.removeNamespace('manager'); } catch(e4) {}
  try { completionService_invalidateCalendarCachesForContext_(calendarCtx || {}); } catch(e5) {}
}

function completionService_acquireLock_(lock, waitMs, sleepMs) {
  waitMs = Number(waitMs || 10000);
  sleepMs = Number(sleepMs || 250);
  var deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try { if (lock.tryLock(250)) return true; } catch (e) {}
    Utilities.sleep(sleepMs);
  }
  return false;
}

function completionService_statusEquals_(left, right) {
  if (typeof Status_statusEquals_ === 'function') return Status_statusEquals_(left, right);
  var a = (typeof Status_normalizeStatus_ === 'function') ? Status_normalizeStatus_(left) : completionService_clean_(left).toUpperCase().replace(/\s+/g, '_');
  var b = (typeof Status_normalizeStatus_ === 'function') ? Status_normalizeStatus_(right) : completionService_clean_(right).toUpperCase().replace(/\s+/g, '_');
  return a === b;
}

function completionService_getCompletedDisplayStatus_() {
  if (typeof STATUS_COMPLETED !== 'undefined') return STATUS_COMPLETED;
  if (typeof Status_toDisplayStatus_ === 'function') return Status_toDisplayStatus_('COMPLETED');
  return 'Completed';
}

function completionService_todayISO_() {
  return Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function completionService_normAuditId_(v) {
  if (typeof v5_normAuditId_ === 'function') return v5_normAuditId_(v);
  return completionService_clean_(v);
}

function completionService_normEmail_(v) {
  return completionService_clean_(v).toLowerCase();
}

function completionService_clean_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function completionService_normHeader_(s) {
  return String(s || '').replace(/[–—−]/g, '-').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function completionService_normDateText_(value, displayValue) {
  var display = completionService_clean_(displayValue);
  var parsedDisplay = completionService_parseDateText_(display);
  if (parsedDisplay) return parsedDisplay;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }

  var raw = completionService_clean_(value);
  var parsedRaw = completionService_parseDateText_(raw);
  if (parsedRaw) return parsedRaw;
  return raw;
}

function completionService_parseDateText_(s) {
  s = completionService_clean_(s);
  if (!s) return '';
  var mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3];
  var mIsoTime = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (mIsoTime) return mIsoTime[1] + '-' + mIsoTime[2] + '-' + mIsoTime[3];
  var mSlash = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
  if (mSlash) return mSlash[3] + '-' + ('0' + Number(mSlash[2])).slice(-2) + '-' + ('0' + Number(mSlash[1])).slice(-2);
  return '';
}

function completionService_errMsg_(e) {
  return String(e && e.message ? e.message : e);
}
