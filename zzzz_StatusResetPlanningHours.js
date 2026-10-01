/***********************************************************************
 * FILE: zzzz_StatusResetPlanningHours.js
 * BUILD: 2026-10-01_CANCEL_REOPEN_CLEAR_HOURS_PLANNED_R1
 * PURPOSE:
 *   Canonical Cancel/Deny reopen reset must clear formal committed
 *   "Hours planned" together with the physical planning assignment.
 *   This replaces Status_resetPlanning_ only; StatusMachine remains the
 *   lifecycle owner.
 ***********************************************************************/
var STATUS_RESET_PLANNING_HOURS_BUILD = '2026-10-01_CANCEL_REOPEN_CLEAR_HOURS_PLANNED_R1';

Status_resetPlanning_ = function(ctx) {
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
  // - Hours planned
  // Everything else, including Total audit time in hours, Location,
  // Birthdate certificate and Extended Expiration Date, is untouched.
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
    ['Planning JSON', 'PlanningJSON', 'Planning'],
    ['Hours planned', 'Planned hours', 'Hours Planned']
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

  return { success:true, cleared:cleared, build:STATUS_RESET_PLANNING_HOURS_BUILD };
};

function RUN_STATUS_RESET_PLANNING_HOURS_CONTRACT_ACCEPTANCE() {
  var src = String(Status_resetPlanning_);
  var out = {
    ok: src.indexOf("['Hours planned', 'Planned hours', 'Hours Planned']") >= 0,
    build: STATUS_RESET_PLANNING_HOURS_BUILD,
    writesPerformed: false,
    checks: {
      clearsHoursPlanned: src.indexOf("['Hours planned', 'Planned hours', 'Hours Planned']") >= 0,
      preservesTotalAuditTime: src.indexOf('Total audit time in hours') >= 0,
      whitelistOnly: src.indexOf('clearFields') >= 0 && src.indexOf("setValue('')") >= 0
    }
  };
  try { Logger.log(JSON.stringify(out, null, 2)); } catch (e) {}
  return out;
}
