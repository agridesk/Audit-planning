/***********************************************************************
 * FILE: NotificationDiagnosticsTools.gs
 * BUILD: 2026-05-12_NOTIFICATION_DIAGNOSTICS_TOOLS_CONSOLIDATED
 * PURPOSE:
 * - Consolidates NotificationConfigDiag.gs and NotificationTestTools.gs.
 * - Keeps existing public function names stable.
 * - Diagnostics remain read-only unless the function name explicitly says reset/delete/test.
 * - No lifecycle/status/business flow ownership.
 ***********************************************************************/



/* ============================================================
 * SOURCE: NotificationConfigDiag.js
 * ============================================================ */

// FILE: NotificationConfigDiag.gs
// BUILD: 2026-05-04_NOTIFICATION_CONFIG_DIAG_WEEKLY_MANAGER_CLEAN
// PURPOSE:
//   Read-only diagnostic for Notification_Config coverage and manager weekly settings.
//   Safe to run in PROD. No writes, no queue rows, no email sends.

var NOTIFICATION_CONFIG_DIAG_BUILD = '2026-05-04_NOTIFICATION_CONFIG_DIAG_WEEKLY_MANAGER_CLEAN';

var NOTIFICATION_DIAG_CANONICAL_EVENTS = [
  'AUDIT_PLANNED_BY_AUDITOR',
  'AUDIT_PLANNED_BY_MANAGER',
  'AUDIT_APPROVED',
  'AUDIT_ACCEPTED',
  'AUDIT_COMPLETED',
  'COMPLETED_ON_BEHALF',
  'AUDIT_CANCELLED_BY_MANAGER',
  'AUDIT_CANCELLED_BY_AUDITOR',
  'AUDIT_DENIED_BY_MANAGER',
  'AUDIT_DENIED_BY_AUDITOR',
  'AUDIT_REJECTED_BY_MANAGER',
  'WEEKLY_MANAGER_PENDING_PLANNING',
  'WEEKLY_MANAGER_COMING_UP',
  'WEEKLY_AUDITOR_COMING_UP',
  'PLANNING_WINDOW_ALERT'
];

function NotificationConfigDiag_RunCoverage() {
  var result = {
    build: NOTIFICATION_CONFIG_DIAG_BUILD,
    success: true,
    timestamp: new Date().toISOString(),
    canonicalCount: NOTIFICATION_DIAG_CANONICAL_EVENTS.length,
    sheetFound: false,
    rowsRead: 0,
    coverage: [],
    missing: [],
    inactive: [],
    sendEmailOff: [],
    templateGaps: [],
    duplicateKeys: [],
    extraKeys: [],
    managerWeekly: null,
    errors: [],
    warnings: []
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Notification_Config');
    if (!sh) {
      result.success = false;
      result.error = 'Notification_Config sheet not found';
      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }
    result.sheetFound = true;

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) {
      result.success = false;
      result.error = 'Notification_Config has no data rows';
      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }

    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var idx = NotificationConfigDiag_BuildHeaderMap_(values[0] || []);

    if (idx.EVENT_KEY < 0) {
      result.success = false;
      result.error = 'Notification_Config missing EVENT_KEY column';
      Logger.log(JSON.stringify(result, null, 2));
      return result;
    }

    var configByKey = {};
    var seenKeys = {};

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var key = NotificationConfigDiag_Text_(row[idx.EVENT_KEY]).toUpperCase();
      if (!key) continue;
      result.rowsRead++;

      if (seenKeys[key]) {
        result.duplicateKeys.push({ key: key, row: r + 1 });
        continue;
      }
      seenKeys[key] = true;

      var cfg = {
        rowNumber: r + 1,
        eventKey: key,
        active: NotificationConfigDiag_Yes_(NotificationConfigDiag_Cell_(row, idx.ACTIVE)),
        sendEmail: NotificationConfigDiag_Yes_(NotificationConfigDiag_Cell_(row, idx.SEND_EMAIL)),
        logOnly: NotificationConfigDiag_Yes_(NotificationConfigDiag_Cell_(row, idx.LOG_ONLY)),
        eventClass: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.EVENT_CLASS)),
        description: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.DESCRIPTION)),
        recipientMode: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.RECIPIENT_MODE)),
        recipientTarget: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.RECIPIENT_TARGET)),
        useLevels: NotificationConfigDiag_Yes_(NotificationConfigDiag_Cell_(row, idx.USE_LEVELS)),
        level1Name: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.LEVEL1_NAME)),
        level1Days: NotificationConfigDiag_NumberOrBlank_(NotificationConfigDiag_Cell_(row, idx.LEVEL1_DAYS)),
        level2Name: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.LEVEL2_NAME)),
        level2Days: NotificationConfigDiag_NumberOrBlank_(NotificationConfigDiag_Cell_(row, idx.LEVEL2_DAYS)),
        level3Name: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.LEVEL3_NAME)),
        level3Days: NotificationConfigDiag_NumberOrBlank_(NotificationConfigDiag_Cell_(row, idx.LEVEL3_DAYS)),
        templateFamily: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.TEMPLATE_FAMILY)),
        templateKeyDefault: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.TEMPLATE_KEY_DEFAULT)),
        notes: NotificationConfigDiag_Text_(NotificationConfigDiag_Cell_(row, idx.NOTES))
      };

      configByKey[key] = cfg;
    }

    for (var i = 0; i < NOTIFICATION_DIAG_CANONICAL_EVENTS.length; i++) {
      var canonKey = NOTIFICATION_DIAG_CANONICAL_EVENTS[i];
      var item = configByKey[canonKey];
      if (!item) {
        result.missing.push(canonKey);
        continue;
      }
      result.coverage.push(item);
      if (!item.active) result.inactive.push(canonKey);
      if (!item.sendEmail && !item.logOnly) result.sendEmailOff.push(canonKey);
      if (!item.templateFamily && !item.templateKeyDefault) result.templateGaps.push(canonKey);
    }

    var canonSet = {};
    for (var j = 0; j < NOTIFICATION_DIAG_CANONICAL_EVENTS.length; j++) canonSet[NOTIFICATION_DIAG_CANONICAL_EVENTS[j]] = true;
    Object.keys(configByKey).forEach(function(k) {
      if (!canonSet[k]) result.extraKeys.push(k);
    });

    result.managerWeekly = NotificationConfigDiag_ValidateManagerWeekly_(configByKey.WEEKLY_MANAGER_PENDING_PLANNING);
    if (!result.managerWeekly.ok) {
      result.errors = result.errors.concat(result.managerWeekly.errors);
    }
    result.warnings = result.warnings.concat(result.managerWeekly.warnings || []);

    result.success = (
      result.missing.length === 0 &&
      result.duplicateKeys.length === 0 &&
      result.errors.length === 0
    );
  } catch (e) {
    result.success = false;
    result.error = String(e && e.message ? e.message : e);
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function NotificationConfigDiag_ValidateManagerWeekly_(cfg) {
  var out = {
    ok: true,
    eventKey: 'WEEKLY_MANAGER_PENDING_PLANNING',
    expected: {
      active: true,
      sendEmail: true,
      logOnly: false,
      eventClass: 'WEEKLY',
      useLevels: true,
      level1Name: 'Critical',
      level1Days: 60,
      level2Name: 'Urgent',
      level2Days: 90,
      level3Name: 'Upcoming',
      level3Days: 120
    },
    actual: cfg || null,
    errors: [],
    warnings: []
  };

  function err_(msg) {
    out.ok = false;
    out.errors.push('WEEKLY_MANAGER_PENDING_PLANNING: ' + msg);
  }

  if (!cfg) {
    err_('missing row');
    return out;
  }

  if (cfg.active !== true) err_('ACTIVE must be YES');
  if (cfg.sendEmail !== true) err_('SEND_EMAIL must be YES');
  if (cfg.logOnly === true) err_('LOG_ONLY must be NO');
  if (String(cfg.eventClass || '').toUpperCase() !== 'WEEKLY') err_('EVENT_CLASS must be WEEKLY');
  if (cfg.useLevels !== true) err_('USE_LEVELS must be YES');

  if (String(cfg.level1Name || '').toUpperCase() !== 'CRITICAL') err_('LEVEL1_NAME must be Critical');
  if (Number(cfg.level1Days) !== 60) err_('LEVEL1_DAYS must be 60');
  if (String(cfg.level2Name || '').toUpperCase() !== 'URGENT') err_('LEVEL2_NAME must be Urgent');
  if (Number(cfg.level2Days) !== 90) err_('LEVEL2_DAYS must be 90');
  if (String(cfg.level3Name || '').toUpperCase() !== 'UPCOMING') err_('LEVEL3_NAME must be Upcoming');
  if (Number(cfg.level3Days) !== 120) err_('LEVEL3_DAYS must be 120');

  if (cfg.eventClass === 'NO') err_('row appears shifted: EVENT_CLASS is NO');

  return out;
}

function NotificationConfigDiag_BuildHeaderMap_(headers) {
  var map = {
    EVENT_KEY: -1,
    ACTIVE: -1,
    SEND_EMAIL: -1,
    LOG_ONLY: -1,
    EVENT_CLASS: -1,
    DESCRIPTION: -1,
    RECIPIENT_MODE: -1,
    RECIPIENT_TARGET: -1,
    USE_LEVELS: -1,
    LEVEL1_NAME: -1,
    LEVEL1_DAYS: -1,
    LEVEL2_NAME: -1,
    LEVEL2_DAYS: -1,
    LEVEL3_NAME: -1,
    LEVEL3_DAYS: -1,
    TEMPLATE_FAMILY: -1,
    TEMPLATE_KEY_DEFAULT: -1,
    NOTES: -1
  };

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toUpperCase().replace(/\s+/g, '_');
    if (map.hasOwnProperty(h)) map[h] = i;
  }

  return map;
}

function NotificationConfigDiag_Cell_(row, idx) {
  return idx >= 0 ? row[idx] : '';
}

function NotificationConfigDiag_Text_(v) {
  return String(v == null ? '' : v).trim();
}

function NotificationConfigDiag_Yes_(v) {
  var s = NotificationConfigDiag_Text_(v).toUpperCase();
  return s === 'YES' || s === 'Y' || s === 'TRUE' || s === '1' || s === 'X';
}

function NotificationConfigDiag_NumberOrBlank_(v) {
  if (v === '' || v === null || typeof v === 'undefined') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function RUN_NOTIFICATIONCONFIG_DIAG_COVERAGE() {
  return NotificationConfigDiag_RunCoverage();
}


/* ============================================================
 * SOURCE: NotificationTestTools.js
 * ============================================================ */

// FILE: NotificationTestTools.gs
// PURPOSE:
//   Test / reset utilities for Notifications V5
//   - Uses the NEW primary queue structure
//   - Uses live V5 event keys
//   - Reads primary queue sheet name via NotificationConfig
//   - Falls back to "Notification Queue"
//
// SAFE TO RUN MULTIPLE TIMES

var NTT_DEFAULT_QUEUE_SHEET = 'Notification Queue';

// ============================================================
// QUICK TEST ACTIONS
// ============================================================

// Backward-compatible alias: "READY" no longer exists in V5 queue flow.
// We now reset to PENDING.
function ntt_resetAllToReady() {
  return ntt_resetAllToPending();
}

function ntt_resetAllToPending() {
  return ntt_setStatusForAllDataRows_('PENDING', true, false);
}

function ntt_resetSentAndFailedToReady() {
  // Backward-compatible alias: V5 uses PENDING, not READY.
  return ntt_resetSentReservedAndFailedToPending();
}

function ntt_resetSentReservedAndFailedToPending() {
  var sh = ntt_getQueueSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, updated: 0, queueSheet: sh.getName() };

  var updated = 0;

  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][1] || '').trim().toUpperCase(); // B Status
    if (status === 'SENT' || status === 'FAILED' || status === 'RESERVED') {
      data[r][1] = 'PENDING'; // B Status
      data[r][8] = 0;         // I Attempts
      data[r][9] = '';        // J LastError
      data[r][11] = '';       // L TimestampSent
      data[r][12] = '';       // M Reserved
      updated++;
    }
  }

  if (updated > 0) {
    sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  }

  return { ok: true, updated: updated, queueSheet: sh.getName() };
}

function ntt_forceDueRowsReadyNow() {
  // Legacy function kept as alias for old muscle memory.
  // In V5 there is no READY + SEND_AFTER model anymore.
  return ntt_resetAllToPending();
}

function ntt_deleteAllQueueRowsExceptHeader() {
  var sh = ntt_getQueueSheet_();
  var lastRow = sh.getLastRow();
  if (lastRow <= 1) return { ok: true, deleted: 0, queueSheet: sh.getName() };

  sh.deleteRows(2, lastRow - 1);
  return { ok: true, deleted: lastRow - 1, queueSheet: sh.getName() };
}

// Optional safer cleanup: remove only rows that are actual mail events,
// keep AUDIT_TRAIL rows.
function ntt_deleteAllNonAuditTrailRows() {
  var sh = ntt_getQueueSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, deleted: 0, queueSheet: sh.getName() };

  var deleteRows = [];
  for (var r = 1; r < data.length; r++) {
    var status = String(data[r][1] || '').trim().toUpperCase(); // B Status
    if (status !== 'AUDIT_TRAIL') deleteRows.push(r + 1);
  }

  deleteRows.sort(function(a, b) { return b - a; });
  for (var i = 0; i < deleteRows.length; i++) {
    sh.deleteRow(deleteRows[i]);
  }

  return { ok: true, deleted: deleteRows.length, queueSheet: sh.getName() };
}

// ============================================================
// SAMPLE DATA BUILDERS — NEW V5 EVENT KEYS
// ============================================================

function ntt_createSampleApprovedRows() {
  var items = [
    {
      auditId: 'AUD_TEST_MULTI_001',
      company: 'Agropecuaria Torrecampas S.L.',
      recipient: 'planning@agriqa.es',
      actor: 'renerombouts@example.com',
      actorRole: 'Manager',
      recipientRole: 'auditor',
      resultStatus: 'Approved'
    },
    {
      auditId: 'AUD_TEST_MULTI_002',
      company: 'Cultius Cal Anima SCP',
      recipient: 'planning@agriqa.es',
      actor: 'renerombouts@example.com',
      actorRole: 'Manager',
      recipientRole: 'auditor',
      resultStatus: 'Approved'
    },
    {
      auditId: 'AUD_TEST_MULTI_003',
      company: 'Cultius Gaxas',
      recipient: 'planning@agriqa.es',
      actor: 'renerombouts@example.com',
      actorRole: 'Manager',
      recipientRole: 'auditor',
      resultStatus: 'Approved'
    }
  ];

  var inserted = [];
  for (var i = 0; i < items.length; i++) {
    inserted.push(
      ntt_queueViaBuilder_(
        items[i].recipient,
        'AUDIT_APPROVED',
        {
          company: items[i].company,
          auditId: items[i].auditId,
          actor: items[i].actor,
          actorRole: items[i].actorRole,
          recipientRole: items[i].recipientRole,
          resultStatus: items[i].resultStatus
        }
      )
    );
  }

  return { ok: true, inserted: inserted };
}

function ntt_createSampleCancelledRejectedRows() {
  var results = [];

  results.push(
    ntt_queueViaBuilder_(
      'planning@agriqa.es',
      'AUDIT_CANCELLED_BY_MANAGER',
      {
        company: 'Cancelled Demo Company',
        auditId: 'AUD_TEST_CANCEL_001',
        actor: 'renerombouts@example.com',
        actorRole: 'Manager',
        recipientRole: 'auditor',
        comment: 'Customer requested postponement',
        resultStatus: 'Returned to Pending Planning'
      }
    )
  );

  results.push(
    ntt_queueViaBuilder_(
      'planning@agriqa.es',
      'AUDIT_REJECTED_BY_MANAGER',
      {
        company: 'Rejected Demo Company',
        auditId: 'AUD_TEST_REJECT_001',
        actor: 'renerombouts@example.com',
        actorRole: 'Manager',
        recipientRole: 'auditor',
        comment: 'Auditor unavailable within allowed planning window',
        resultStatus: 'Rejected'
      }
    )
  );

  return { ok: true, inserted: results };
}

function ntt_createSampleAuditorResponseRows() {
  var results = [];

  results.push(
    ntt_queueViaBuilder_(
      'planning@agriqa.es',
      'AUDIT_ACCEPTED',
      {
        company: 'Accepted Demo Company',
        auditId: 'AUD_TEST_ACCEPT_001',
        actor: 'auditor@example.com',
        actorRole: 'Auditor',
        recipientRole: 'manager',
        resultStatus: 'Accepted'
      }
    )
  );

  results.push(
    ntt_queueViaBuilder_(
      'planning@agriqa.es',
      'AUDIT_DENIED_BY_AUDITOR',
      {
        company: 'Denied Demo Company',
        auditId: 'AUD_TEST_DENY_001',
        actor: 'auditor@example.com',
        actorRole: 'Auditor',
        recipientRole: 'manager',
        comment: 'Date not feasible for travel planning',
        resultStatus: 'Returned to Pending Planning'
      }
    )
  );

  results.push(
    ntt_queueViaBuilder_(
      'planning@agriqa.es',
      'AUDIT_CANCELLED_BY_AUDITOR',
      {
        company: 'Cancelled By Auditor Demo Company',
        auditId: 'AUD_TEST_AUD_CANCEL_001',
        actor: 'auditor@example.com',
        actorRole: 'Auditor',
        recipientRole: 'manager',
        comment: 'Need different execution date',
        resultStatus: 'Returned to Pending Planning'
      }
    )
  );

  return { ok: true, inserted: results };
}

// ============================================================
// ONE-SHOT FLOWS
// ============================================================

function ntt_prepareFreshExportMailTest() {
  ntt_deleteAllQueueRowsExceptHeader();
  ntt_createSampleApprovedRows();
  ntt_createSampleCancelledRejectedRows();

  return {
    ok: true,
    queueSheet: ntt_getQueueSheet_().getName(),
    message: 'Fresh V5 queue test prepared. Next: run your current NotificationSender.'
  };
}

function ntt_prepareFreshApprovedOnlyTest() {
  ntt_deleteAllQueueRowsExceptHeader();
  ntt_createSampleApprovedRows();

  return {
    ok: true,
    queueSheet: ntt_getQueueSheet_().getName(),
    message: 'Fresh approved-only V5 test prepared. Next: run your current NotificationSender.'
  };
}

function ntt_prepareFreshManagerAuditorMixedTest() {
  ntt_deleteAllQueueRowsExceptHeader();
  ntt_createSampleApprovedRows();
  ntt_createSampleCancelledRejectedRows();
  ntt_createSampleAuditorResponseRows();

  return {
    ok: true,
    queueSheet: ntt_getQueueSheet_().getName(),
    message: 'Fresh mixed V5 notification test prepared. Next: run your current NotificationSender.'
  };
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

function ntt_setStatusForAllDataRows_(targetStatus, clearSendFields, includeAuditTrail) {
  var sh = ntt_getQueueSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length <= 1) return { ok: true, updated: 0, queueSheet: sh.getName() };

  targetStatus = String(targetStatus || '').trim().toUpperCase();
  var updated = 0;

  for (var r = 1; r < data.length; r++) {
    var currentStatus = String(data[r][1] || '').trim().toUpperCase(); // B Status
    if (!includeAuditTrail && currentStatus === 'AUDIT_TRAIL') continue;

    data[r][1] = targetStatus; // B Status

    if (clearSendFields) {
      data[r][8] = 0;   // I Attempts
      data[r][9] = '';  // J LastError
      data[r][11] = ''; // L TimestampSent
      data[r][12] = ''; // M Reserved
    }
    updated++;
  }

  sh.getRange(1, 1, data.length, data[0].length).setValues(data);

  return {
    ok: true,
    updated: updated,
    targetStatus: targetStatus,
    queueSheet: sh.getName()
  };
}

function ntt_getQueueSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = ntt_getPrimaryQueueSheetName_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet: ' + sheetName);
  return sh;
}

function ntt_getPrimaryQueueSheetName_() {
  if (typeof NotificationConfig_GetQueueSheetName === 'function') {
    return String(NotificationConfig_GetQueueSheetName() || NTT_DEFAULT_QUEUE_SHEET).trim() || NTT_DEFAULT_QUEUE_SHEET;
  }
  return NTT_DEFAULT_QUEUE_SHEET;
}

function ntt_queueViaBuilder_(recipientEmail, eventType, payload) {
  if (typeof NB_queueNotification_ !== 'function') {
    throw new Error('NB_queueNotification_ not available. Deploy current NotificationBuilder first.');
  }

  recipientEmail = String(recipientEmail || '').trim();
  payload = payload || {};

  return NB_queueNotification_(recipientEmail, String(eventType || '').trim(), payload);
}
