/***********************************************************************
 * FILE: NotificationAcceptedReconciler.gs
 * BUILD: 2026-07-08_ACCEPTED_NOTIFICATION_RECONCILER_R1
 *
 * PURPOSE
 * - Repairs missing notification side-effects after auditor ACCEPT actions.
 * - Source of truth is lifecycle/audit trail:
 *      LIFECYCLE_STATUS_CHANGED
 *      action = ACCEPT
 *      beforeStatus = Approved
 *      afterStatus = Accepted
 *
 * SAFE
 * - No status writes.
 * - No planning writes.
 * - No availability writes.
 * - Queue-only repair.
 * - Idempotent: existing queue rows are detected and skipped.
 *
 * DEPENDS ON
 * - Audit planning sheet
 * - Notification Queue sheet
 * - StatusNotificationBridge_Dispatch_
 * - StatusMachine constants/functions
 ***********************************************************************/

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_7D() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 7,
    dryRun: false,
    maxRepairs: 50
  });
}

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_7D_DRYRUN() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 7,
    dryRun: true,
    maxRepairs: 100
  });
}

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_ONE_AUDIT(auditId) {
  return AcceptedNotificationReconciler_Run_({
    auditId: String(auditId || '').trim(),
    lookbackDays: 60,
    dryRun: false,
    maxRepairs: 1
  });
}

function AcceptedNotificationReconciler_Trigger10M() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 2,
    dryRun: false,
    maxRepairs: 25
  });
}

function AcceptedNotificationReconciler_Run_(opts) {
  opts = opts || {};
  var started = new Date();
  var dryRun = opts.dryRun === true;
  var lookbackDays = Number(opts.lookbackDays || 7);
  var auditIdFilter = String(opts.auditId || '').trim();
  var maxRepairs = Math.max(1, Number(opts.maxRepairs || 50));

  var out = {
    ok: true,
    build: '2026-07-08_ACCEPTED_NOTIFICATION_RECONCILER_R1',
    dryRun: dryRun,
    lookbackDays: lookbackDays,
    auditIdFilter: auditIdFilter,
    scannedLifecycle: 0,
    candidates: 0,
    repaired: 0,
    skipped: 0,
    errors: [],
    items: []
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var queueSheet = ss.getSheetByName('Notification Queue');
    if (!queueSheet) throw new Error("Missing sheet 'Notification Queue'");

    var queue = AcceptedNotificationReconciler_LoadQueue_(queueSheet);
    var lifecycleEvents = AcceptedNotificationReconciler_FindAcceptedLifecycleEvents_(queue, {
      lookbackDays: lookbackDays,
      auditId: auditIdFilter
    });

    out.scannedLifecycle = lifecycleEvents.length;

    for (var i = 0; i < lifecycleEvents.length; i++) {
      if (out.repaired >= maxRepairs) break;

      var ev = lifecycleEvents[i];
      var auditId = ev.auditId;

      var hasAccepted = AcceptedNotificationReconciler_HasQueueEvent_(queue, auditId, 'AUDIT_ACCEPTED');
      var hasEcas = AcceptedNotificationReconciler_HasQueueEvent_(queue, auditId, 'ECAS_AUDIT_APPROVAL_DIGEST');

      if (hasAccepted && hasEcas) {
        out.skipped++;
        out.items.push({
          auditId: auditId,
          action: 'SKIP',
          reason: 'QUEUE_ROWS_ALREADY_PRESENT',
          hasAccepted: true,
          hasEcas: true
        });
        continue;
      }

      out.candidates++;

      if (dryRun) {
        out.items.push({
          auditId: auditId,
          action: 'DRYRUN_REPAIR_NEEDED',
          hasAccepted: hasAccepted,
          hasEcas: hasEcas,
          lifecycleRow: ev.rowNumber
        });
        continue;
      }

      try {
        var ctx = AcceptedNotificationReconciler_LoadAuditContext_(auditId);
        if (!ctx || !ctx.found) {
          throw new Error('Audit planning row not found for auditId=' + auditId);
        }

        var payload = {
          actorEmail: String(ev.actorEmail || '').trim(),
          actorRole: 'AUDITOR',
          action: 'ACCEPT',
          source: 'AcceptedNotificationReconciler',
          reconciledFromLifecycleRow: ev.rowNumber
        };

        var result = {
          success: true,
          auditId: auditId,
          beforeStatus: 'APPROVED',
          beforeStatusDisplay: 'Approved',
          afterStatus: 'ACCEPTED',
          afterStatusDisplay: 'Accepted',
          newStatus: 'Accepted'
        };

        if (typeof StatusNotificationBridge_Dispatch_ !== 'function') {
          throw new Error('StatusNotificationBridge_Dispatch_ unavailable');
        }

        var bridgeResult = StatusNotificationBridge_Dispatch_('ACCEPT', 'AUDITOR', ctx, payload, result);

        out.repaired++;
        out.items.push({
          auditId: auditId,
          action: 'REPAIRED',
          hadAcceptedBefore: hasAccepted,
          hadEcasBefore: hasEcas,
          lifecycleRow: ev.rowNumber,
          bridgeResult: bridgeResult || null
        });

      } catch (repairErr) {
        var msg = String(repairErr && repairErr.message ? repairErr.message : repairErr);
        out.errors.push({
          auditId: auditId,
          message: msg
        });
        out.items.push({
          auditId: auditId,
          action: 'ERROR',
          message: msg,
          lifecycleRow: ev.rowNumber
        });
      }
    }

  } catch (e) {
    out.ok = false;
    out.errors.push({
      message: String(e && e.message ? e.message : e)
    });
  }

  out.durationMs = new Date().getTime() - started.getTime();

  try {
    Logger.log(JSON.stringify(out, null, 2));
  } catch (logErr) {}

  return out;
}

function AcceptedNotificationReconciler_LoadQueue_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { sheet: sh, headers: [], values: [], displayValues: [], rows: [] };
  }

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var displayValues = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var headers = displayValues[0] || [];
  var rows = [];

  for (var r = 1; r < displayValues.length; r++) {
    var drow = displayValues[r] || [];
    var vrow = values[r] || [];
    rows.push({
      rowNumber: r + 1,
      values: vrow,
      displayValues: drow,
      blob: drow.join(' | ')
    });
  }

  return { sheet: sh, headers: headers, values: values, displayValues: displayValues, rows: rows };
}

function AcceptedNotificationReconciler_FindAcceptedLifecycleEvents_(queue, opts) {
  opts = opts || {};
  var auditIdFilter = String(opts.auditId || '').trim();
  var lookbackDays = Number(opts.lookbackDays || 7);
  var cutoffMs = new Date().getTime() - (lookbackDays * 24 * 60 * 60 * 1000);
  var out = [];
  var seen = {};

  for (var i = 0; i < (queue.rows || []).length; i++) {
    var row = queue.rows[i];
    var blob = row.blob || '';

    if (blob.indexOf('LIFECYCLE_STATUS_CHANGED') < 0) continue;
    if (blob.indexOf('"action":"ACCEPT"') < 0 && blob.indexOf('"action": "ACCEPT"') < 0) continue;
    if (blob.indexOf('"beforeStatus":"Approved"') < 0 && blob.indexOf('"beforeStatus": "Approved"') < 0) continue;
    if (blob.indexOf('"afterStatus":"Accepted"') < 0 && blob.indexOf('"afterStatus": "Accepted"') < 0) continue;

    var payload = AcceptedNotificationReconciler_ExtractJsonPayloadFromRow_(row);
    if (!payload || !payload.auditId) continue;

    var auditId = String(payload.auditId || '').trim();
    if (!auditId) continue;
    if (auditIdFilter && auditId !== auditIdFilter) continue;

    var ts = AcceptedNotificationReconciler_ParseDateLoose_(payload.timestamp || row.displayValues[0] || '');
    if (ts && ts.getTime && ts.getTime() < cutoffMs) continue;

    if (seen[auditId]) continue;
    seen[auditId] = true;

    out.push({
      auditId: auditId,
      rowNumber: row.rowNumber,
      actorEmail: String(payload.actorEmail || '').trim(),
      timestamp: payload.timestamp || row.displayValues[0] || '',
      payload: payload
    });
  }

  return out;
}

function AcceptedNotificationReconciler_HasQueueEvent_(queue, auditId, eventType) {
  auditId = String(auditId || '').trim();
  eventType = String(eventType || '').trim();
  if (!auditId || !eventType) return false;

  for (var i = 0; i < (queue.rows || []).length; i++) {
    var blob = queue.rows[i].blob || '';
    if (blob.indexOf(auditId) < 0) continue;
    if (blob.indexOf(eventType) < 0) continue;
    return true;
  }

  return false;
}

function AcceptedNotificationReconciler_ExtractJsonPayloadFromRow_(row) {
  var cells = row.displayValues || [];

  for (var i = cells.length - 1; i >= 0; i--) {
    var txt = String(cells[i] || '').trim();
    if (!txt) continue;
    if (txt.indexOf('{') < 0 || txt.indexOf('}') < 0) continue;

    var parsed = AcceptedNotificationReconciler_ParseJsonLoose_(txt);
    if (!parsed) continue;

    if (parsed.payload && parsed.payload.auditId) return parsed.payload;
    if (parsed.auditId) return parsed;
  }

  return null;
}

function AcceptedNotificationReconciler_ParseJsonLoose_(txt) {
  txt = String(txt || '').trim();
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch (e1) {}

  var first = txt.indexOf('{');
  var last = txt.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(txt.substring(first, last + 1));
    } catch (e2) {}
  }

  return null;
}

function AcceptedNotificationReconciler_LoadAuditContext_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { found: false, error: 'missing auditId' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { found: false, error: "Missing sheet 'Audit planning'" };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { found: false, error: 'Audit planning empty' };

  var hdr = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0] || [];
  var idxAuditId = AcceptedNotificationReconciler_FindHeader_(hdr, ['Audit ID', 'Audit_ID', 'AuditId']);
  var idxStatus = AcceptedNotificationReconciler_FindHeader_(hdr, ['Status']);
  var idxAssigned = AcceptedNotificationReconciler_FindHeader_(hdr, ['Assigned to', 'Assigned To', 'Assigned auditor', 'Assigned Auditor', 'Assigned']);
  var idxPlanned = AcceptedNotificationReconciler_FindHeader_(hdr, ['Date - Planned', 'Date – Planned', 'Date planned', 'Date Planned']);
  var idxApproved = AcceptedNotificationReconciler_FindHeader_(hdr, ['Date - Approved', 'Date – Approved', 'Date approved', 'Date Approved']);
  var idxJson = AcceptedNotificationReconciler_FindHeader_(hdr, ['Planning JSON', 'PlanningJSON', 'Planning']);
  var idxHours = AcceptedNotificationReconciler_FindHeader_(hdr, ['Hours planned', 'Planned hours', 'Hours Planned']);

  if (idxAuditId < 0) return { found: false, error: 'Missing Audit ID column' };

  var cell = sh.getRange(2, idxAuditId + 1, lastRow - 1, 1)
    .createTextFinder(auditId)
    .matchEntireCell(true)
    .findNext();

  if (!cell) return { found: false, error: 'Audit not found: ' + auditId };

  var rowIndex = cell.getRow();
  var row = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0] || [];

  return {
    found: true,
    sheet: sh,
    rowIndex: rowIndex,
    row: row,
    hdr: hdr,
    auditId: auditId,
    status: idxStatus >= 0 ? String(row[idxStatus] || '').trim() : 'Accepted',
    col: {
      ai: idxAuditId,
      status: idxStatus,
      assigned: idxAssigned,
      planned: idxPlanned,
      approved: idxApproved,
      hours: idxHours,
      json: idxJson
    }
  };
}

function AcceptedNotificationReconciler_FindHeader_(headers, names) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var key = AcceptedNotificationReconciler_Norm_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }

  for (var n = 0; n < (names || []).length; n++) {
    var wanted = AcceptedNotificationReconciler_Norm_(names[n]);
    if (Object.prototype.hasOwnProperty.call(map, wanted)) return map[wanted];
  }

  return -1;
}

function AcceptedNotificationReconciler_Norm_(v) {
  return String(v == null ? '' : v)
    .replace(/[–—−]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function AcceptedNotificationReconciler_ParseDateLoose_(v) {
  v = String(v || '').trim();
  if (!v) return null;

  var d1 = new Date(v);
  if (!isNaN(d1.getTime())) return d1;

  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  }

  return null;
}
