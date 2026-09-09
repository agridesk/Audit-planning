/***********************************************************************
 * FILE: NotificationAcceptedReconciler.gs
 * BUILD: 2026-09-09_ACCEPTED_NOTIFICATION_RECONCILER_R2_DURABLE
 *
 * PURPOSE
 * - Durable recovery for notification side-effects after auditor ACCEPT.
 * - Lifecycle trail is the source of truth / outbox:
 *      LIFECYCLE_STATUS_CHANGED
 *      action = ACCEPT
 *      beforeStatus = Approved
 *      afterStatus = Accepted
 * - Required notification side-effects per ACCEPT:
 *      1. AUDIT_ACCEPTED
 *      2. ECAS_AUDIT_APPROVAL_DIGEST
 *
 * R2
 * - A repair counts as REPAIRED only after both required queue events are
 *   proven present in a fresh Notification Queue read.
 * - Adds canonical 1-minute reconciler trigger installer.
 * - Keeps the old Trigger10M handler as compatibility alias.
 * - Adds health / dry-run validation.
 * - Queue-only. Never writes lifecycle, planning or availability.
 * - Idempotent. Existing queue events are never intentionally duplicated.
 ***********************************************************************/

var ANR_BUILD = '2026-09-09_ACCEPTED_NOTIFICATION_RECONCILER_R2_DURABLE';
var ANR_TRIGGER_HANDLER = 'AcceptedNotificationReconciler_Trigger1M';
var ANR_LEGACY_TRIGGER_HANDLER = 'AcceptedNotificationReconciler_Trigger10M';
var ANR_REQUIRED_EVENTS = ['AUDIT_ACCEPTED', 'ECAS_AUDIT_APPROVAL_DIGEST'];

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_7D() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 7,
    dryRun: false,
    maxRepairs: 100
  });
}

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_7D_DRYRUN() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 7,
    dryRun: true,
    maxRepairs: 250
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

function AcceptedNotificationReconciler_Trigger1M() {
  return AcceptedNotificationReconciler_Run_({
    lookbackDays: 2,
    dryRun: false,
    maxRepairs: 100
  });
}

// Backward-compatible handler. If an old trigger still exists it remains safe.
function AcceptedNotificationReconciler_Trigger10M() {
  return AcceptedNotificationReconciler_Trigger1M();
}

function RUN_INSTALL_ACCEPTED_NOTIFICATION_RECONCILER_1M() {
  var all = ScriptApp.getProjectTriggers();
  var removed = [];

  for (var i = 0; i < all.length; i++) {
    var handler = String(all[i].getHandlerFunction() || '').trim();
    if (handler !== ANR_TRIGGER_HANDLER && handler !== ANR_LEGACY_TRIGGER_HANDLER) continue;
    ScriptApp.deleteTrigger(all[i]);
    removed.push(handler);
  }

  var trigger = ScriptApp.newTrigger(ANR_TRIGGER_HANDLER)
    .timeBased()
    .everyMinutes(1)
    .create();

  var immediate = AcceptedNotificationReconciler_Trigger1M();
  var health = RUN_ACCEPTED_NOTIFICATION_RECONCILER_HEALTH_2D();

  return {
    ok: !!(health && health.ok),
    build: ANR_BUILD,
    removedHandlers: removed,
    installedHandler: ANR_TRIGGER_HANDLER,
    intervalMinutes: 1,
    triggerId: trigger && trigger.getUniqueId ? trigger.getUniqueId() : '',
    immediateRun: immediate,
    health: health
  };
}

function RUN_ACCEPTED_NOTIFICATION_RECONCILER_HEALTH_2D() {
  var dry = AcceptedNotificationReconciler_Run_({
    lookbackDays: 2,
    dryRun: true,
    maxRepairs: 500
  });

  var triggers = [];
  try {
    var all = ScriptApp.getProjectTriggers();
    for (var i = 0; i < all.length; i++) {
      var handler = String(all[i].getHandlerFunction() || '').trim();
      if (handler === ANR_TRIGGER_HANDLER || handler === ANR_LEGACY_TRIGGER_HANDLER) {
        triggers.push({
          handler: handler,
          id: all[i].getUniqueId ? all[i].getUniqueId() : '',
          source: String(all[i].getTriggerSource() || '')
        });
      }
    }
  } catch (e) {}

  var canonicalTriggerInstalled = triggers.some(function(t) {
    return t.handler === ANR_TRIGGER_HANDLER;
  });

  return {
    ok: !!(dry && dry.ok && dry.candidates === 0 && dry.errors.length === 0 && canonicalTriggerInstalled),
    build: ANR_BUILD,
    canonicalTriggerInstalled: canonicalTriggerInstalled,
    triggers: triggers,
    unresolvedAccepts: dry ? dry.candidates : null,
    errors: dry ? dry.errors : [{ message: 'Dry-run unavailable' }],
    items: dry ? dry.items : []
  };
}

function AcceptedNotificationReconciler_Run_(opts) {
  opts = opts || {};

  var startedMs = Date.now();
  var dryRun = opts.dryRun === true;
  var lookbackDays = Math.max(1, Number(opts.lookbackDays || 7));
  var auditIdFilter = String(opts.auditId || '').trim();
  var maxRepairs = Math.max(1, Number(opts.maxRepairs || 50));

  var out = {
    ok: true,
    build: ANR_BUILD,
    dryRun: dryRun,
    lookbackDays: lookbackDays,
    auditIdFilter: auditIdFilter,
    scannedLifecycle: 0,
    candidates: 0,
    repaired: 0,
    skipped: 0,
    unresolved: 0,
    errors: [],
    items: []
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('Active spreadsheet unavailable');

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
      var beforeState = AcceptedNotificationReconciler_GetRequiredEventState_(queue, auditId);

      if (beforeState.complete) {
        out.skipped++;
        out.items.push({
          auditId: auditId,
          action: 'SKIP',
          reason: 'REQUIRED_QUEUE_EVENTS_PRESENT',
          state: beforeState
        });
        continue;
      }

      out.candidates++;

      if (dryRun) {
        out.items.push({
          auditId: auditId,
          action: 'DRYRUN_REPAIR_NEEDED',
          lifecycleRow: ev.rowNumber,
          state: beforeState
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

        // Proof-based postcondition: never claim repair from a return value alone.
        var freshQueue = AcceptedNotificationReconciler_LoadQueue_(queueSheet);
        var afterState = AcceptedNotificationReconciler_GetRequiredEventState_(freshQueue, auditId);

        if (afterState.complete) {
          out.repaired++;
          queue = freshQueue;
          out.items.push({
            auditId: auditId,
            action: 'REPAIRED',
            lifecycleRow: ev.rowNumber,
            beforeState: beforeState,
            afterState: afterState,
            bridgeResult: bridgeResult || null
          });
        } else {
          out.unresolved++;
          queue = freshQueue;
          out.items.push({
            auditId: auditId,
            action: 'UNRESOLVED_RETRY_NEXT_TRIGGER',
            lifecycleRow: ev.rowNumber,
            beforeState: beforeState,
            afterState: afterState,
            bridgeResult: bridgeResult || null
          });
        }

      } catch (repairErr) {
        var msg = String(repairErr && repairErr.message ? repairErr.message : repairErr);
        out.unresolved++;
        out.errors.push({ auditId: auditId, message: msg });
        out.items.push({
          auditId: auditId,
          action: 'ERROR_RETRY_NEXT_TRIGGER',
          message: msg,
          lifecycleRow: ev.rowNumber,
          state: beforeState
        });
      }
    }

  } catch (e) {
    out.ok = false;
    out.errors.push({ message: String(e && e.message ? e.message : e) });
  }

  if (out.errors.length || out.unresolved > 0) out.ok = false;
  out.durationMs = Date.now() - startedMs;

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (logErr) {}
  return out;
}

function AcceptedNotificationReconciler_GetRequiredEventState_(queue, auditId) {
  var state = {
    auditId: String(auditId || '').trim(),
    AUDIT_ACCEPTED: false,
    ECAS_AUDIT_APPROVAL_DIGEST: false,
    complete: false
  };

  for (var i = 0; i < ANR_REQUIRED_EVENTS.length; i++) {
    var eventType = ANR_REQUIRED_EVENTS[i];
    state[eventType] = AcceptedNotificationReconciler_HasQueueEvent_(queue, state.auditId, eventType);
  }

  state.complete = !!(state.AUDIT_ACCEPTED && state.ECAS_AUDIT_APPROVAL_DIGEST);
  return state;
}

function AcceptedNotificationReconciler_LoadQueue_(sh) {
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();

  if (lastRow < 1 || lastCol < 1) {
    return { sheet: sh, headers: [], values: [], displayValues: [], rows: [] };
  }

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var displayValues = sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var headers = displayValues[0] || [];
  var rows = [];

  // Keep row 1 in the searchable set because legacy Notification Queue instances
  // have existed without a formal header row. Header-like rows are harmless.
  for (var r = 0; r < displayValues.length; r++) {
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
  var cutoffMs = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
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

  out.sort(function(a, b) {
    var da = AcceptedNotificationReconciler_ParseDateLoose_(a.timestamp);
    var db = AcceptedNotificationReconciler_ParseDateLoose_(b.timestamp);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });

  return out;
}

function AcceptedNotificationReconciler_HasQueueEvent_(queue, auditId, eventType) {
  auditId = String(auditId || '').trim();
  eventType = String(eventType || '').trim();
  if (!auditId || !eventType) return false;

  for (var i = 0; i < (queue.rows || []).length; i++) {
    var row = queue.rows[i];
    var cells = row.displayValues || [];

    // Canonical queue contract: C=Type, E=Audit ID. Prefer exact columns.
    var rowType = String(cells[2] || '').trim();
    var rowAuditId = String(cells[4] || '').trim();
    if (rowType === eventType && rowAuditId === auditId) return true;

    // Legacy compatibility fallback.
    var blob = row.blob || '';
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
    if (!txt || txt.indexOf('{') < 0 || txt.indexOf('}') < 0) continue;

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

  try { return JSON.parse(txt); } catch (e1) {}

  var first = txt.indexOf('{');
  var last = txt.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(txt.substring(first, last + 1)); } catch (e2) {}
  }

  return null;
}

function AcceptedNotificationReconciler_LoadAuditContext_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { found: false, error: 'missing auditId' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.getActive();
  var sh = ss ? ss.getSheetByName('Audit planning') : null;
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
  var idxHours = AcceptedNotificationReconciler_FindHeader_(hdr, ['Hours planned', 'Planned hours', 'Hours Planned', 'Total audit time in hours']);

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
    return new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0)
    );
  }

  return null;
}
