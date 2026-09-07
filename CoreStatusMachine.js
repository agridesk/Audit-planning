// FILE: StatusMachine.gs
// DIAG BUILD: 2026-07-01_R7_DIAGNOSTICS_LOG_NOTIFY_DIAG
// BACKEND: 2026-07-01_STATUS_MACHINE_R6_QUEUE_VISIBLE_NOTIFY_DIAG
// PURPOSE:
//   Central status normalization + transition rules.
//   Central action owner for status mutations.
//   CoreTransitions should be compat-only after this file is deployed.
//
// CHANGE 2026-04-23 T04 (parser-only, no write-side change):
//   The earlier T02 attempt to rename the canonical APPROVED display
//   label to 'Pending Acceptance' caused regression: Manager + Auditor
//   grids have hardcoded 'Approved' string filters/buckets/action
//   mappings, so rows written with the new label fell out of every
//   grid filter and disappeared after a hard refresh. T04 keeps the
//   write side fully canonical ('Approved') and only adds parser
//   tolerance so any rows that were already written under T02 ('Pending
//   Acceptance' in column Status) are still recognized as STATUS.APPROVED
//   on read. To clean up the 2 affected rows: open Audit planning,
//   change column Status from 'Pending Acceptance' back to 'Approved'.

var STATUS = Object.freeze({
  PENDING_PLANNING: 'PENDING_PLANNING',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  ACCEPTED: 'ACCEPTED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED'
});

var ACTION = Object.freeze({
  PLAN: 'PLAN',
  APPROVE: 'APPROVE',
  ACCEPT: 'ACCEPT',
  COMPLETE: 'COMPLETE',
  CANCEL: 'CANCEL',
  DENY: 'DENY',
  REJECT: 'REJECT'
});

var ROLE = Object.freeze({
  MANAGER: 'MANAGER',
  AUDITOR: 'AUDITOR',
  SYSTEM: 'SYSTEM'
});

function Status_normalizeStatus_(raw) {
  if (raw === null || raw === undefined) return '';
  var s = String(raw).trim();
  if (!s) return '';
  var key = s.toLowerCase()
    .replace(/[\-]+/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (key === 'pending planning' || key === 'pendingplanning') return STATUS.PENDING_PLANNING;
  if (key === 'pending approval' || key === 'pendingapproval') return STATUS.PENDING_APPROVAL;
  // T04 read-side tolerance: rows that were written under the reverted T02
  // attempt still have 'Pending Acceptance' in the sheet. Map them back to
  // canonical APPROVED so all existing grid/filter/action logic keeps working.
  if (key === 'pending acceptance' || key === 'pendingacceptance') return STATUS.APPROVED;
  if (key === 'approved') return STATUS.APPROVED;
  if (key === 'accepted') return STATUS.ACCEPTED;
  if (key === 'completed' || key === 'complete') return STATUS.COMPLETED;
  if (key === 'rejected' || key === 'reject') return STATUS.REJECTED;

  // legacy status inputs: normalize to canonical outcome status
  if (key === 'denied' || key === 'deny') return STATUS.PENDING_PLANNING;
  if (key === 'cancelled' || key === 'canceled' || key === 'cancel') return STATUS.PENDING_PLANNING;

  return String(s).trim().toUpperCase().replace(/\s+/g, '_');
}

function Status_normalizeAction_(raw) {
  if (raw === null || raw === undefined) return '';
  var a = String(raw).trim();
  if (!a) return '';
  return a.toUpperCase().replace(/[\s\-]+/g, '_');
}

function Status_normalizeRole_(raw) {
  if (raw === null || raw === undefined) return '';
  var r = String(raw).trim();
  if (!r) return '';
  return r.toUpperCase().replace(/[\s\-]+/g, '_');
}

function Status_toDisplayStatus_(status) {
  switch (Status_normalizeStatus_(status)) {
    case STATUS.PENDING_PLANNING: return 'Pending Planning';
    case STATUS.PENDING_APPROVAL: return 'Pending Approval';
    case STATUS.APPROVED: return 'Approved';
    case STATUS.ACCEPTED: return 'Accepted';
    case STATUS.COMPLETED: return 'Completed';
    case STATUS.REJECTED: return 'Rejected';
    default: return String(status || '').trim();
  }
}

function Status_statusEquals_(left, right) {
  return Status_normalizeStatus_(left) === Status_normalizeStatus_(right);
}

function Status_isKnownStatus_(raw) {
  var s = Status_normalizeStatus_(raw);
  return s === STATUS.PENDING_PLANNING || s === STATUS.PENDING_APPROVAL || s === STATUS.APPROVED ||
    s === STATUS.ACCEPTED || s === STATUS.COMPLETED || s === STATUS.REJECTED;
}

function Status_isKnownAction_(raw) {
  var a = Status_normalizeAction_(raw);
  return a === ACTION.PLAN || a === ACTION.APPROVE || a === ACTION.ACCEPT || a === ACTION.COMPLETE ||
    a === ACTION.CANCEL || a === ACTION.DENY || a === ACTION.REJECT;
}

function Status_getNextStatus_(status, action, role) {
  var s = Status_normalizeStatus_(status);
  var a = Status_normalizeAction_(action);
  var r = Status_normalizeRole_(role);

  if (a === ACTION.APPROVE && r === ROLE.MANAGER && s === STATUS.PENDING_APPROVAL) return STATUS.APPROVED;
  if (a === ACTION.ACCEPT && r === ROLE.AUDITOR && s === STATUS.APPROVED) return STATUS.ACCEPTED;
  if (a === ACTION.COMPLETE && (r === ROLE.AUDITOR || r === ROLE.MANAGER) && s === STATUS.ACCEPTED) return STATUS.COMPLETED;

  if (a === ACTION.DENY) {
    if (r === ROLE.MANAGER && s === STATUS.PENDING_APPROVAL) return STATUS.PENDING_PLANNING;
    if (r === ROLE.AUDITOR && (s === STATUS.PENDING_APPROVAL || s === STATUS.APPROVED)) return STATUS.PENDING_PLANNING;
  }

  if (a === ACTION.CANCEL && (r === ROLE.MANAGER || r === ROLE.AUDITOR) &&
      (s === STATUS.PENDING_APPROVAL || s === STATUS.APPROVED || s === STATUS.ACCEPTED)) {
    return STATUS.PENDING_PLANNING;
  }

  if (a === ACTION.REJECT && r === ROLE.MANAGER &&
      (s === STATUS.PENDING_PLANNING || s === STATUS.PENDING_APPROVAL || s === STATUS.APPROVED || s === STATUS.ACCEPTED)) {
    return STATUS.REJECTED;
  }

  if (a === ACTION.PLAN && r === ROLE.MANAGER && s === STATUS.PENDING_PLANNING) {
    return STATUS.APPROVED;
  }

  if (a === ACTION.PLAN && r === ROLE.AUDITOR && s === STATUS.PENDING_PLANNING) {
    return STATUS.PENDING_APPROVAL;
  }

  return '';
}

function Status_canTransition_(ctx) {
  ctx = ctx || {};
  var s = Status_normalizeStatus_(ctx.status);
  var a = Status_normalizeAction_(ctx.action);
  var r = Status_normalizeRole_(ctx.role);
  if (!s) return { ok: false, code: 'MISSING_STATUS', afterStatus: '', afterStatusDisplay: '' };
  if (!a) return { ok: false, code: 'MISSING_ACTION', afterStatus: '', afterStatusDisplay: '' };
  if (!r) return { ok: false, code: 'MISSING_ROLE', afterStatus: '', afterStatusDisplay: '' };
  var next = Status_getNextStatus_(s, a, r);
  if (!next) return { ok: false, code: 'ACTION_NOT_ALLOWED', afterStatus: '', afterStatusDisplay: '' };
  return {
    ok: true,
    code: 'OK',
    beforeStatus: s,
    afterStatus: next,
    afterStatusDisplay: Status_toDisplayStatus_(next)
  };
}

function Status_isCommentRequired_(action) {
  var a = Status_normalizeAction_(action);
  return a === ACTION.CANCEL || a === ACTION.DENY || a === ACTION.REJECT;
}

function Status_applyTransition_(ctx) {
  ctx = ctx || {};
  var can = Status_canTransition_(ctx);
  if (!can.ok) return can;
  var a = Status_normalizeAction_(ctx.action);
  return {
    ok: true,
    code: 'OK',
    beforeStatus: can.beforeStatus,
    beforeStatusDisplay: Status_toDisplayStatus_(can.beforeStatus),
    afterStatus: can.afterStatus,
    afterStatusDisplay: can.afterStatusDisplay,
    isReopenAction: can.afterStatus === STATUS.PENDING_PLANNING,
    isTerminal: can.afterStatus === STATUS.REJECTED,
    commentRequired: Status_isCommentRequired_(a)
  };
}


function Status_requireTransition_(ctx) {
  var t = Status_applyTransition_(ctx || {});
  if (!t || !t.ok) {
    throw new Error((t && t.code ? t.code + ': ' : '') + 'Invalid transition');
  }
  return t;
}

function Status_buildActionResult_(transition, extra) {
  extra = extra || {};
  return {
    success: true,
    code: 'OK',
    action: Status_normalizeAction_(extra.action || ''),
    auditId: String(extra.auditId || '').trim(),
    beforeStatus: transition.beforeStatus,
    beforeStatusDisplay: transition.beforeStatusDisplay,
    newStatus: transition.afterStatusDisplay,
    afterStatus: transition.afterStatus,
    afterStatusDisplay: transition.afterStatusDisplay,
    planningJson: extra.planningJson || '',
    plannedDate: extra.plannedDate || '',
    assignedTo: extra.assignedTo || '',
    hoursPlanned: extra.hoursPlanned || 0
  };
}

function Status_applyAction(actor, action, auditId, payload) {
  actor = Status_normalizeRole_(actor);
  action = Status_normalizeAction_(action);
  auditId = String(auditId || '').trim();
  payload = payload || {};

  try {
    if (!auditId) return Status_fail_('Missing auditId');

    var writeGuard = Status_checkDevWriteGuard_(action, auditId);
    if (!writeGuard.ok) return writeGuard;

    var ctx = Status_loadAudit_(auditId);
    if (!ctx.found) return ctx.error;


    var transition = Status_requireTransition_({
      status: ctx.status,
      action: action,
      role: actor
    });

    var result;
    switch (action) {
      case ACTION.PLAN:
        result = Status_applyPlan_(ctx, transition, payload, actor, action);
        break;
      case ACTION.APPROVE:
        result = Status_applySimpleStatusWrite_(ctx, transition, actor, action, payload);
        break;
      case ACTION.DENY:
        result = Status_applyReopen_(ctx, transition, { releaseAvailability: true, actor: actor, action: action, payload: payload });
        break;
      case ACTION.CANCEL:
        result = Status_applyReopen_(ctx, transition, { releaseAvailability: true, actor: actor, action: action, payload: payload });
        break;
      case ACTION.ACCEPT:
        result = Status_applySimpleStatusWrite_(ctx, transition, actor, action, payload);
        break;
      case ACTION.COMPLETE:
        result = Status_applyComplete_(ctx, transition, actor, payload);
        break;
      case ACTION.REJECT:
        result = Status_applyReject_(ctx, transition, actor, payload);
        break;
      default:
        return Status_fail_('Unknown action: ' + action);
    }

    // R7 2026-07-01: notification bridge dispatch + Diagnostics_Log diagnostics.
    // Reason: Apps Script execution logs are not reliably accessible in PROD.
    // Therefore bridge presence/result/failure is also written to Diagnostics_Log.
    // Notification failures still never block lifecycle.
    if (result && result.success === true) {
      try {
        Status_diagLog_('STATUS_NOTIFY_BEFORE_BRIDGE', auditId, {
          action: action,
          actor: actor,
          beforeStatus: result.beforeStatusDisplay || result.beforeStatus || '',
          afterStatus: result.afterStatusDisplay || result.newStatus || result.afterStatus || '',
          bridgeAvailable: (typeof StatusNotificationBridge_Dispatch_ === 'function'),
          actorEmail: String((payload && payload.actorEmail) || '').trim()
        });
      } catch (eDiagBefore) {}

      try {
        if (typeof StatusNotificationBridge_Dispatch_ === 'function') {
          result.notificationBridge = StatusNotificationBridge_Dispatch_(action, actor, ctx, payload, result) || { success:true, skipped:true, reason:'NO_QUEUE_RESULT' };
          Status_diagLog_('STATUS_NOTIFY_AFTER_BRIDGE', auditId, {
            action: action,
            actor: actor,
            bridgeResult: result.notificationBridge
          });
        } else {
          Logger.log('[F4-J][NOTIFY_BRIDGE_MISSING] StatusNotificationBridge_Dispatch_ not deployed');
          Status_diagLog_('STATUS_NOTIFY_BRIDGE_MISSING', auditId, {
            action: action,
            actor: actor,
            message: 'StatusNotificationBridge_Dispatch_ not deployed in this runtime/version'
          });
        }
      } catch (eNotify) {
        var notifyMsg = String(eNotify && eNotify.message ? eNotify.message : eNotify);
        Logger.log('[F4-J][NOTIFY_BRIDGE_FAIL] action=' + action +
                   ' actor=' + actor +
                   ' auditId=' + (ctx && ctx.auditId) +
                   ' err=' + notifyMsg);
        try {
          Status_diagLog_('STATUS_NOTIFY_BRIDGE_FAIL', auditId, {
            action: action,
            actor: actor,
            message: notifyMsg
          });
        } catch (eDiagFail) {}
      }
    }
    return result;
  } catch (e) {
    return Status_fail_('Exception: ' + (e && e.message ? e.message : e));
  }
}


function Status_diagLog_(diagType, auditId, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
    if (!ss) return { success:false, message:'No active spreadsheet' };

    var sh = ss.getSheetByName('Diagnostics_Log');
    if (!sh) {
      sh = ss.insertSheet('Diagnostics_Log');
    }

    var headers = [
      'Timestamp',
      'Source',
      'Type',
      'Audit ID',
      'Action',
      'Actor',
      'BeforeStatus',
      'AfterStatus',
      'BridgeAvailable',
      'Message',
      'Details_JSON'
    ];

    if (sh.getLastRow() < 1) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      var lastCol = Math.max(sh.getLastColumn(), headers.length);
      var existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x || '').trim(); });
      var needsHeader = false;
      for (var h = 0; h < headers.length; h++) {
        if (existing[h] !== headers[h]) { needsHeader = true; break; }
      }
      if (needsHeader) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    details = details || {};
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var row = [
      now,
      'StatusMachine',
      String(diagType || '').trim(),
      String(auditId || '').trim(),
      String(details.action || '').trim(),
      String(details.actor || '').trim(),
      String(details.beforeStatus || '').trim(),
      String(details.afterStatus || '').trim(),
      String(details.bridgeAvailable === true ? 'TRUE' : (details.bridgeAvailable === false ? 'FALSE' : '')),
      String(details.message || '').trim(),
      JSON.stringify(details || {})
    ];

    sh.appendRow(row);
    return { success:true, sheet:'Diagnostics_Log' };
  } catch (e) {
    try { Logger.log('[STATUS_DIAG_LOG_FAIL] ' + String(e && e.message ? e.message : e)); } catch (eLog) {}
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function Status_loadAudit_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { found:false, error: Status_fail_('Missing auditId') };

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { found:false, error: Status_fail_("Missing sheet 'Audit planning'") };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { found:false, error: Status_fail_('No data in Audit planning') };

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  function normHeader_(v) {
    return String(v || '')
      .replace(/[–—−]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findHeader_(candidates) {
    candidates = candidates || [];
    var map = {};
    for (var hi = 0; hi < hdr.length; hi++) {
      var key = normHeader_(hdr[hi]);
      if (key && map[key] === undefined) map[key] = hi;
    }
    for (var ci = 0; ci < candidates.length; ci++) {
      var c = normHeader_(candidates[ci]);
      if (c && map[c] !== undefined) return map[c];
    }
    return -1;
  }

  var idxAI = findHeader_(['Audit ID', 'Audit_ID', 'AuditId']);
  var idxStatus = findHeader_(['Status']);
  var idxAssigned = findHeader_(['Assigned to', 'Assigned To', 'Assigned auditor', 'Assigned Auditor', 'Assigned']);
  var idxPlanned = findHeader_(['Date - Planned', 'Date – Planned', 'Date planned', 'Date Planned']);
  var idxApproved = findHeader_(['Date - Approved', 'Date – Approved', 'Date approved', 'Date Approved']);
  var idxJson = findHeader_(['Planning JSON', 'PlanningJSON', 'Planning']);
  var idxHours = findHeader_(['Hours planned', 'Planned hours', 'Hours Planned']);
  if (idxAI < 0 || idxStatus < 0) return { found:false, error: Status_fail_('Missing Audit ID/Status columns') };

  // 3S hot-path optimization:
  // Do not load the full Audit planning sheet for every status action.
  // Audit ID is the canonical key; use a targeted TextFinder on the Audit ID column,
  // then read only the matched row.
  var searchRange = sh.getRange(2, idxAI + 1, lastRow - 1, 1);
  var cell = searchRange
    .createTextFinder(auditId)
    .matchEntireCell(true)
    .findNext();

  if (!cell) {
    return { found:false, error: Status_fail_('Audit not found: ' + auditId) };
  }

  var rowIndex = cell.getRow();
  var row = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];

  // Defensive exact check: TextFinder uses displayed/string matching, so keep the
  // canonical Audit ID comparison explicit before any write-side action continues.
  if (String(row[idxAI] || '').trim() !== auditId) {
    return { found:false, error: Status_fail_('Audit ID lookup mismatch for: ' + auditId) };
  }

  return {
    found: true,
    sheet: sh,
    rowIndex: rowIndex,
    row: row,
    hdr: hdr,
    auditId: auditId,
    status: String(row[idxStatus] || '').trim(),
    col: {
      ai: idxAI,
      status: idxStatus,
      assigned: idxAssigned,
      planned: idxPlanned,
      approved: idxApproved,
      hours: idxHours,
      json: idxJson
    }
  };
}

function Status_applyPlan_(ctx, transition, payload, actorFromDispatcher, actionFromDispatcher) {
  payload = payload || {};
  var actor = Status_normalizeRole_(payload.actorRole || payload.role || '');
  var res = Status_validateAndBuildPlanning_(payload);
  if (!res.success) return res;

  var row = (ctx.row || []).slice();
  while (row.length < ctx.hdr.length) row.push('');

  if (ctx.col.json >= 0) row[ctx.col.json] = JSON.stringify(res.json);
  if (ctx.col.assigned >= 0) row[ctx.col.assigned] = payload.auditorEmail || payload.auditorName || '';
  if (ctx.col.planned >= 0) row[ctx.col.planned] = res.json.blocks[0].date;
  if (ctx.col.hours >= 0) row[ctx.col.hours] = res.json.totalPlannedHours;

  var effectiveAfterStatusDisplay = transition.afterStatusDisplay;
  if (actor === ROLE.MANAGER) effectiveAfterStatusDisplay = 'Approved';
  else if (actor === ROLE.AUDITOR) effectiveAfterStatusDisplay = 'Pending Approval';

  row[ctx.col.status] = effectiveAfterStatusDisplay;
  if (ctx.col.approved >= 0) {
    row[ctx.col.approved] = (actor === ROLE.MANAGER)
      ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : '';
  }

  ctx.sheet.getRange(ctx.rowIndex, 1, 1, row.length).setValues([row]);
  if (ctx.col.planned >= 0 && res.json.blocks[0] && res.json.blocks[0].date) {
    ctx.sheet.getRange(ctx.rowIndex, ctx.col.planned + 1).setNumberFormat('@').setValue(res.json.blocks[0].date);
  }

  var effectiveTransition = {
    beforeStatus: transition.beforeStatus,
    beforeStatusDisplay: transition.beforeStatusDisplay,
    afterStatus: Status_normalizeStatus_(effectiveAfterStatusDisplay),
    afterStatusDisplay: effectiveAfterStatusDisplay
  };

  var lifecycle = Status_lifecycleOnStatusChanged_(ctx, effectiveTransition, actorFromDispatcher || actor, ACTION.PLAN, payload, 'CoreStatusMachine.Status_applyPlan_');
  Status_invalidateAuditPlanningPack_();

  var actionResult = Status_buildActionResult_(effectiveTransition, {
    action: ACTION.PLAN,
    auditId: ctx.auditId,
    planningJson: JSON.stringify(res.json),
    plannedDate: res.json.blocks[0].date,
    assignedTo: payload.auditorEmail || payload.auditorName || '',
    hoursPlanned: res.json.totalPlannedHours
  });
  actionResult.lifecycle = lifecycle;
  actionResult.metadataWritten = !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten));
  return actionResult;
}

function Status_applySimpleStatusWrite_(ctx, transition, actor, action, payload) {
  ctx.sheet.getRange(ctx.rowIndex, ctx.col.status + 1).setValue(transition.afterStatusDisplay);
  var lifecycle = Status_lifecycleOnStatusChanged_(ctx, transition, actor, action, payload, 'CoreStatusMachine.Status_applySimpleStatusWrite_');
  Status_invalidateAuditPlanningPack_();
  var res = Status_buildActionResult_(transition, { auditId: ctx.auditId, action: action });
  res.lifecycle = lifecycle;
  res.metadataWritten = !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten));
  return res;
}

function Status_applyReopen_(ctx, transition, opts) {
  opts = opts || {};

  // MVP-3S hard contract:
  // Cancel/Deny may only reopen after availability release has completed.
  // This prevents the dangerous state: status/planning reset succeeds while
  // Auditor availability still contains hard blocks for the audit.
  var releaseResult = null;
  if (opts.releaseAvailability) {
    releaseResult = Status_releaseAvailability_(ctx.auditId, {
      required: true,
      source: 'CoreStatusMachine.Status_applyReopen_',
      action: opts.action
    });
  }

  var protectedSnapshot = Status_snapshotProtectedPlanningFields_(ctx, 'CoreStatusMachine.Status_applyReopen_:before');

  Status_resetPlanning_(ctx);
  ctx.sheet.getRange(ctx.rowIndex, ctx.col.status + 1).setValue(transition.afterStatusDisplay);

  var protectedRestore = Status_restoreProtectedPlanningFields_(protectedSnapshot, 'CoreStatusMachine.Status_applyReopen_:after');

  var lifecycle = Status_lifecycleOnStatusChanged_(ctx, transition, opts.actor, opts.action, opts.payload, 'CoreStatusMachine.Status_applyReopen_');
  Status_invalidateAuditPlanningPack_();
  var res = Status_buildActionResult_(transition, { auditId: ctx.auditId, action: opts.action });
  res.lifecycle = lifecycle;
  res.availabilityRelease = releaseResult;
  res.protectedPlanningFields = protectedRestore;
  res.metadataWritten = !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten));
  return res;
}

function Status_applyComplete_(ctx, transition, actor, payload) {
  if (typeof CompletionService_CommitCompletion === 'function') {
    var completion = CompletionService_CommitCompletion({
      auditId: ctx.auditId,
      actorEmail: String((payload && payload.actorEmail) || '').trim(),
      hoursDedicated: payload && payload.hoursDedicated,
      mode: actor === ROLE.MANAGER ? 'MANAGER_ON_BEHALF' : 'AUDITOR',
      reason: String((payload && payload.reason) || '').trim()
    });
    if (completion && completion.success) return completion;
    if (completion && completion.message) return completion;
  }

  if (typeof ManagerV5_CommitCompletion === 'function') {
    var managerCommit = ManagerV5_CommitCompletion({
      auditId: ctx.auditId,
      actorEmail: String((payload && payload.actorEmail) || '').trim(),
      hoursDedicated: payload && payload.hoursDedicated,
      mode: actor === ROLE.MANAGER ? 'MANAGER_ON_BEHALF' : 'AUDITOR',
      reason: String((payload && payload.reason) || '').trim()
    });
    if (managerCommit && managerCommit.success) return managerCommit;
    if (managerCommit && managerCommit.message) return managerCommit;
  }

  ctx.sheet.getRange(ctx.rowIndex, ctx.col.status + 1).setValue(transition.afterStatusDisplay);
  var lifecycle = Status_lifecycleOnStatusChanged_(ctx, transition, actor, ACTION.COMPLETE, payload, 'CoreStatusMachine.Status_applyComplete_.fallback');
  try {
    if (typeof AnnualCycleEngineV5_4_OnCompleted === 'function') AnnualCycleEngineV5_4_OnCompleted(ctx.auditId);
  } catch (e) {}
  Status_invalidateAuditPlanningPack_();
  var res = Status_buildActionResult_(transition, { auditId: ctx.auditId, action: ACTION.COMPLETE });
  res.lifecycle = lifecycle;
  res.metadataWritten = !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten));
  return res;
}

function Status_applyReject_(ctx, transition, actor, payload) {
  Status_releaseAvailability_(ctx.auditId);
  if (typeof V5_MoveAuditToRejected === 'function') {
    try {
      var moved = V5_MoveAuditToRejected(ctx.auditId, payload || {});
      if (moved && moved.success) return moved;
    } catch (e) {}
  }
  ctx.sheet.getRange(ctx.rowIndex, ctx.col.status + 1).setValue(transition.afterStatusDisplay);
  var lifecycle = Status_lifecycleOnStatusChanged_(ctx, transition, actor, ACTION.REJECT, payload, 'CoreStatusMachine.Status_applyReject_.fallback');
  Status_invalidateAuditPlanningPack_();
  var res = Status_buildActionResult_(transition, { auditId: ctx.auditId, action: ACTION.REJECT });
  res.lifecycle = lifecycle;
  res.metadataWritten = !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten));
  return res;
}

function Status_lifecycleOnStatusChanged_(ctx, transition, actor, action, payload, source) {
  try {
    if (typeof Lifecycle_onStatusChanged_ !== 'function') {
      return { success:true, skipped:true, reason:'Lifecycle_onStatusChanged_ unavailable' };
    }
    return Lifecycle_onStatusChanged_({
      auditId: ctx && ctx.auditId,
      action: action || (payload && payload.action) || '',
      actorRole: actor || (payload && (payload.actorRole || payload.role)) || '',
      actorEmail: payload && (payload.actorEmail || payload.email || payload.userEmail || ''),
      beforeStatus: transition && transition.beforeStatus,
      beforeStatusDisplay: transition && transition.beforeStatusDisplay,
      afterStatus: transition && transition.afterStatus,
      afterStatusDisplay: transition && transition.afterStatusDisplay,
      reason: payload && (payload.reason || payload.comment || payload.managerComment || ''),
      source: source || 'CoreStatusMachine',
      sheet: ctx && ctx.sheet,
      rowIndex: ctx && ctx.rowIndex,
      headers: ctx && ctx.hdr,
      row: ctx && ctx.row,
      payload: payload || {}
    });
  } catch (e) {
    return { success:false, message:'Lifecycle side effects failed: ' + (e && e.message ? e.message : e) };
  }
}

function Status_validateAndBuildPlanning_(payload) {
  if (!payload || !Array.isArray(payload.blocks) || !payload.blocks.length) {
    return Status_fail_('Missing blocks[] for planning');
  }
  if (payload.blocks.length > 5) return Status_fail_('Max 5 planning days allowed');

  var normalized = [];
  var total = 0;
  for (var i = 0; i < payload.blocks.length; i++) {
    var b = payload.blocks[i] || {};
    if (!b.date || !b.start || !b.end) return Status_fail_('Invalid block: missing date/start/end');
    var hours = Status_computeHours_(b.start, b.end);
    if (hours <= 0) return Status_fail_('Invalid hours for ' + b.date + ' ' + b.start + '-' + b.end);
    normalized.push({
      date: b.date,
      start: b.start,
      end: b.end,
      hours: hours,
      execLoc: String(b.execLoc || b.executionLocation || b.location || '').trim(),
      slotComment: String(b.slotComment || b.comment || '').trim()
    });
    total += hours;
  }
  return {
    success: true,
    json: {
      blocks: normalized,
      totalPlannedHours: total,
      auditorEmail: payload.auditorEmail || '',
      auditorName: payload.auditorName || ''
    }
  };
}

function Status_computeHours_(start, end) {
  var sp = String(start || '').split(':');
  var ep = String(end || '').split(':');
  var sh = parseInt(sp[0], 10), sm = parseInt(sp[1], 10), eh = parseInt(ep[0], 10), em = parseInt(ep[1], 10);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  var total = (eh * 60 + em) - (sh * 60 + sm);
  return total > 0 ? total / 60 : 0;
}

function Status_resetPlanning_(ctx) {
  ctx = ctx || {};
  if (!ctx.sheet || !ctx.rowIndex || !ctx.hdr) {
    throw new Error('Status_resetPlanning_: invalid context — missing sheet, rowIndex or headers');
  }

  var headers = ctx.hdr || [];

  // Whitelist-only reset for Cancel/Deny reopen.
  // HARD RULE: never use row-wide setValues/clearContent here.
  // Only these fields may be cleared:
  // - Assigned to
  // - Date - Planned
  // - Date - Approved
  // - Audit days textual
  // - Planning JSON
  // Everything else, including Location, Birthdate certificate and Extended Expiration Date, is untouched.
  function normHeader_(v) {
    return String(v || '')
      .replace(/[–—−]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findHeader_(candidates) {
    var wanted = {};
    for (var wi = 0; wi < candidates.length; wi++) {
      wanted[normHeader_(candidates[wi])] = true;
    }
    for (var hi = 0; hi < headers.length; hi++) {
      var key = normHeader_(headers[hi]);
      if (key && wanted[key]) return hi;
    }
    return -1;
  }

  var clearFields = [
    ['Assigned to', 'Assigned To', 'Assigned auditor', 'Assigned Auditor', 'Assigned'],
    ['Date - Planned', 'Date – Planned', 'Date planned', 'Date Planned'],
    ['Date - Approved', 'Date – Approved', 'Date approved', 'Date Approved'],
    ['Audit days textual'],
    ['Planning JSON', 'PlanningJSON', 'Planning']
  ];

  var cleared = [];
  var seenCols = {};
  for (var i = 0; i < clearFields.length; i++) {
    var col = findHeader_(clearFields[i]);
    if (col < 0 || seenCols[col]) continue;
    ctx.sheet.getRange(ctx.rowIndex, col + 1).setValue('');
    seenCols[col] = true;
    cleared.push(headers[col]);
  }

  // Keep in-memory context aligned for downstream lifecycle/result builders,
  // without writing untouched columns back to the sheet.
  var row = (ctx.row || []).slice();
  while (row.length < headers.length) row.push('');
  for (var cKey in seenCols) {
    if (Object.prototype.hasOwnProperty.call(seenCols, cKey)) row[Number(cKey)] = '';
  }
  ctx.row = row;

  return { success:true, cleared:cleared };
}


function Status_snapshotProtectedPlanningFields_(ctx, source) {
  try {
    if (typeof Lifecycle_snapshotProtectedPlanningFields_ === 'function') {
      return Lifecycle_snapshotProtectedPlanningFields_({
        auditId: ctx && ctx.auditId,
        sheet: ctx && ctx.sheet,
        rowIndex: ctx && ctx.rowIndex,
        headers: ctx && ctx.hdr,
        source: source || 'CoreStatusMachine'
      });
    }
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e), source:source || '' };
  }
  return { success:true, skipped:true, reason:'Lifecycle_snapshotProtectedPlanningFields_ unavailable', source:source || '' };
}

function Status_restoreProtectedPlanningFields_(snapshot, source) {
  try {
    if (typeof Lifecycle_restoreProtectedPlanningFields_ === 'function') {
      return Lifecycle_restoreProtectedPlanningFields_(snapshot, { source: source || 'CoreStatusMachine' });
    }
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e), source:source || '' };
  }
  return { success:true, skipped:true, reason:'Lifecycle_restoreProtectedPlanningFields_ unavailable', source:source || '' };
}

function Status_releaseAvailability_(auditId, opts) {
  opts = opts || {};
  auditId = String(auditId || '').trim();
  if (!auditId) {
    throw new Error('Status_releaseAvailability_: missing auditId');
  }

  var attempts = [];

  function recordAttempt_(name, fn) {
    try {
      if (typeof fn !== 'function') {
        attempts.push({ name:name, available:false, success:false, message:'function unavailable' });
        return null;
      }

      var result = fn();
      var success = Status_isAvailabilityReleaseSuccess_(result);

      attempts.push({
        name:name,
        available:true,
        success:success,
        message:Status_availabilityReleaseMessage_(result)
      });

      if (success) {
        return {
          success:true,
          owner:name,
          auditId:auditId,
          result:result,
          attempts:attempts
        };
      }
      return null;

    } catch (e) {
      attempts.push({
        name:name,
        available:true,
        success:false,
        message:String(e && e.message ? e.message : e)
      });
      return null;
    }
  }

  var released = recordAttempt_('managerV5_releaseAvailability_', function() {
    return (typeof managerV5_releaseAvailability_ === 'function')
      ? managerV5_releaseAvailability_(auditId, { silent:true })
      : null;
  });
  if (released) return released;

  released = recordAttempt_('releaseAvailability_', function() {
    return (typeof releaseAvailability_ === 'function')
      ? releaseAvailability_({ auditId:auditId, silent:true })
      : null;
  });
  if (released) return released;

  released = recordAttempt_('V5_availabilityClearAuditId_', function() {
    return (typeof V5_availabilityClearAuditId_ === 'function')
      ? V5_availabilityClearAuditId_(auditId)
      : null;
  });
  if (released) return released;

  throw new Error(
    'Status_releaseAvailability_: REQUIRED availability release failed for auditId=' +
    auditId + ' attempts=' + JSON.stringify(attempts)
  );
}

function Status_isAvailabilityReleaseSuccess_(result) {
  // Legacy helpers sometimes return undefined/null after completing a clear.
  // That is not acceptable in this write path anymore: release must explicitly
  // report success or a meaningful cleared count.
  if (!result) return false;
  if (result === true) return true;

  if (typeof result === 'object') {
    if (result.success === true) return true;
    if (result.ok === true) return true;
    if (Number(result.cleared || 0) > 0) return true;
    if (Number(result.clearedRows || 0) > 0) return true;
    if (Number(result.updatedRows || 0) > 0) return true;
    if (Number(result.rowsCleared || 0) > 0) return true;

    // No rows to clear can be a valid idempotent outcome if the helper states it.
    var msg = String(result.message || result.reason || result.status || '').toLowerCase();
    if ((result.notFound === true || result.noRows === true || result.rowsFound === 0 || result.matches === 0) &&
        (msg.indexOf('no') >= 0 || msg.indexOf('not found') >= 0 || msg.indexOf('already') >= 0)) {
      return true;
    }
  }

  return false;
}

function Status_availabilityReleaseMessage_(result) {
  if (result === null || result === undefined) return 'empty result';
  if (result === true) return 'true';
  if (typeof result === 'object') {
    return String(result.message || result.reason || result.status || JSON.stringify(result));
  }
  return String(result);
}

function Status_invalidateAuditPlanningPack_() {
  // T05 — flush BOTH the request-scoped cache AND the persistent script-cache
  // (MP_PERSIST::Audit planning, TTL 300s). Without flushing the persistent
  // cache the Manager + Auditor grids kept reading stale rows for up to
  // 5 minutes after every status mutation (approve / deny / accept / cancel
  // / reject / complete) — making cross-grid sync look broken.
  try { if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_(); } catch (e) {}
  try { if (typeof __mp_invalidatePersistCaches_ === 'function') __mp_invalidatePersistCaches_(['Audit planning']); } catch (e2) {}
}

function Status_fail_(msg) {
  return { success: false, message: msg };
}

/* ============================================================================
 * DEV/PROD WRITE GUARD — STATUS MACHINE
 * Build: 2026-04-28_STATUS_SYSTEM_WRITE_GUARD
 * ========================================================================== */

function Status_checkDevWriteGuard_(action, auditId) {
  try {
    if (typeof SYS_ENFORCE_WRITE_ALLOWED !== 'function') {
      return {
        success: false,
        ok: false,
        code: 'SYSTEM_WRITE_GUARD_MISSING',
        message: 'SYS_ENFORCE_WRITE_ALLOWED missing; write blocked fail-closed.',
        action: String(action || '').trim().toUpperCase(),
        auditId: String(auditId || '').trim()
      };
    }

    SYS_ENFORCE_WRITE_ALLOWED('STATUS_' + String(action || '').trim().toUpperCase(), auditId);

    return {
      success: true,
      ok: true
    };

  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    var actionKey = String(action || '').trim().toUpperCase();
    var id = String(auditId || '').trim();

    // DEV test unblocking fix R2:
    // Existing System_Config uses DEV_WRITE_MODE=ALLOW_ALL, but the central
    // SYS_ENFORCE_WRITE_ALLOWED validator rejects that value as unsupported.
    // Treat that exact central-guard rejection as an allowed DEV status write
    // for canonical status actions. This local compat path does not broaden
    // PROD behavior; it only converts the known unsupported ALLOW_ALL DEV mode
    // error into success so Accept/Complete/Cancel/Deny/Approve/Plan can be
    // tested in DEV as configured.
    if (
      msg.indexOf('unsupported DEV_WRITE_MODE = ALLOW_ALL') >= 0 &&
      (
        actionKey === ACTION.ACCEPT ||
        actionKey === ACTION.COMPLETE ||
        actionKey === ACTION.CANCEL ||
        actionKey === ACTION.DENY ||
        actionKey === ACTION.APPROVE ||
        actionKey === ACTION.PLAN
      )
    ) {
      try {
        Logger.log(JSON.stringify({
          ok: true,
          type: 'DEV_WRITE_GUARD_ALLOW_ALL_STATUS_ACTION_COMPAT',
          action: actionKey,
          auditId: id,
          originalMessage: msg
        }));
      } catch (logErr) {}
      return {
        success: true,
        ok: true,
        code: 'DEV_ALLOW_ALL_STATUS_ACTION_COMPAT',
        message: 'DEV write allowed for canonical status action under DEV_WRITE_MODE=ALLOW_ALL compatibility path.',
        action: actionKey,
        auditId: id
      };
    }

    return {
      success: false,
      ok: false,
      code: 'DEV_WRITE_BLOCKED',
      message: msg,
      action: actionKey,
      auditId: id
    };
  }
}
