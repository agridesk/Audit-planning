// FILE: GhostAvailabilityCleanup_MVP3S_20260504.gs
// PURPOSE:
//   Read-only diagnostic + optional cleanup for ghost availability blocks.
//   Ghost = Audit_ID exists in Auditor availability, while matching Audit planning row is:
//     - missing, OR
//     - Status = Pending Planning, OR
//     - Planning JSON is empty
//
// 3S / GOVERNANCE:
//   - No status writes
//   - No Audit planning writes
//   - No row-wide clears
//   - Whitelist-only writes in Auditor availability:
//       Audit_ID_1, Status_1, First_Audit_Start_Time, First_Audit_End_Time
//       Audit_ID_2, Status_2, Second_Audit_Start_Time, Second_Audit_End_Time
//
// USAGE:
//   1) Run MVP3S_reportGhostAvailabilityBlocks()
//   2) Inspect result/log
//   3) Run MVP3S_cleanupGhostAvailabilityBlocks()
//      only if report is correct

function MVP3S_reportGhostAvailabilityBlocks() {
  return MVP3S_findGhostAvailabilityBlocks_(false);
}

function MVP3S_cleanupGhostAvailabilityBlocks() {
  return MVP3S_findGhostAvailabilityBlocks_(true);
}

function MVP3S_findGhostAvailabilityBlocks_(applyCleanup) {
  var ss = SpreadsheetApp.getActive();

  var availabilitySheet = ss.getSheetByName('Auditor availability');
  var planningSheet = ss.getSheetByName('Audit planning');

  if (!availabilitySheet) throw new Error("Missing sheet: Auditor availability");
  if (!planningSheet) throw new Error("Missing sheet: Audit planning");

  var avValues = availabilitySheet.getDataRange().getValues();
  var apValues = planningSheet.getDataRange().getValues();

  if (!avValues || avValues.length < 2) {
    return { success: true, applyCleanup: !!applyCleanup, ghostCount: 0, cleanedCells: 0, ghosts: [] };
  }
  if (!apValues || apValues.length < 2) {
    throw new Error("Audit planning has no data rows");
  }

  var avHeaders = avValues[0];
  var apHeaders = apValues[0];

  var av = {
    auditId1: MVP3S_findHeader_(avHeaders, ['Audit_ID_1', 'Audit ID 1', 'AuditId1']),
    auditId2: MVP3S_findHeader_(avHeaders, ['Audit_ID_2', 'Audit ID 2', 'AuditId2']),
    status1: MVP3S_findHeader_(avHeaders, ['Status_1', 'Status 1']),
    status2: MVP3S_findHeader_(avHeaders, ['Status_2', 'Status 2']),
    firstStart: MVP3S_findHeader_(avHeaders, ['First_Audit_Start_Time', 'First Audit Start Time']),
    firstEnd: MVP3S_findHeader_(avHeaders, ['First_Audit_End_Time', 'First Audit End Time']),
    secondStart: MVP3S_findHeader_(avHeaders, ['Second_Audit_Start_Time', 'Second Audit Start Time']),
    secondEnd: MVP3S_findHeader_(avHeaders, ['Second_Audit_End_Time', 'Second Audit End Time']),
    date: MVP3S_findHeader_(avHeaders, ['Date']),
    auditorEmail: MVP3S_findHeader_(avHeaders, ['Auditor_Email', 'Auditor Email'])
  };

  var ap = {
    auditId: MVP3S_findHeader_(apHeaders, ['Audit ID', 'Audit_ID', 'AuditId']),
    status: MVP3S_findHeader_(apHeaders, ['Status']),
    planningJson: MVP3S_findHeader_(apHeaders, ['Planning JSON', 'PlanningJSON', 'Planning'])
  };

  if (av.auditId1 < 0 && av.auditId2 < 0) throw new Error("Missing Audit_ID_1/Audit_ID_2 columns in Auditor availability");
  if (ap.auditId < 0) throw new Error("Missing Audit ID column in Audit planning");
  if (ap.status < 0) throw new Error("Missing Status column in Audit planning");
  if (ap.planningJson < 0) throw new Error("Missing Planning JSON column in Audit planning");

  var planningByAuditId = {};
  for (var r = 1; r < apValues.length; r++) {
    var auditId = String(apValues[r][ap.auditId] || '').trim();
    if (!auditId) continue;
    planningByAuditId[auditId] = {
      rowIndex: r + 1,
      status: String(apValues[r][ap.status] || '').trim(),
      planningJson: String(apValues[r][ap.planningJson] || '').trim()
    };
  }

  var ghosts = [];
  var cleanedCells = 0;

  for (var ar = 1; ar < avValues.length; ar++) {
    cleanedCells += MVP3S_checkAvailabilitySlot_({
      applyCleanup: !!applyCleanup,
      sheet: availabilitySheet,
      values: avValues,
      rowIndex0: ar,
      rowIndex1: ar + 1,
      headers: avHeaders,
      planningByAuditId: planningByAuditId,
      ghosts: ghosts,
      slot: 1,
      auditIdCol: av.auditId1,
      statusCol: av.status1,
      startCol: av.firstStart,
      endCol: av.firstEnd,
      dateCol: av.date,
      auditorEmailCol: av.auditorEmail
    });

    cleanedCells += MVP3S_checkAvailabilitySlot_({
      applyCleanup: !!applyCleanup,
      sheet: availabilitySheet,
      values: avValues,
      rowIndex0: ar,
      rowIndex1: ar + 1,
      headers: avHeaders,
      planningByAuditId: planningByAuditId,
      ghosts: ghosts,
      slot: 2,
      auditIdCol: av.auditId2,
      statusCol: av.status2,
      startCol: av.secondStart,
      endCol: av.secondEnd,
      dateCol: av.date,
      auditorEmailCol: av.auditorEmail
    });
  }

  var result = {
    success: true,
    applyCleanup: !!applyCleanup,
    ghostCount: ghosts.length,
    cleanedCells: cleanedCells,
    ghosts: ghosts
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function MVP3S_checkAvailabilitySlot_(cfg) {
  if (!cfg || cfg.auditIdCol < 0) return 0;

  var auditId = String(cfg.values[cfg.rowIndex0][cfg.auditIdCol] || '').trim();
  if (!auditId) return 0;

  var planning = cfg.planningByAuditId[auditId] || null;
  var reason = '';

  if (!planning) {
    reason = 'AUDIT_ID_NOT_FOUND_IN_AUDIT_PLANNING';
  } else if (MVP3S_normalizeStatus_(planning.status) === 'PENDING_PLANNING') {
    reason = 'PENDING_PLANNING_WITH_AVAILABILITY_BLOCK';
  } else if (!String(planning.planningJson || '').trim()) {
    reason = 'EMPTY_PLANNING_JSON_WITH_AVAILABILITY_BLOCK';
  }

  if (!reason) return 0;

  cfg.ghosts.push({
    auditId: auditId,
    reason: reason,
    availabilityRow: cfg.rowIndex1,
    slot: cfg.slot,
    auditorEmail: cfg.auditorEmailCol >= 0 ? String(cfg.values[cfg.rowIndex0][cfg.auditorEmailCol] || '').trim() : '',
    date: cfg.dateCol >= 0 ? cfg.values[cfg.rowIndex0][cfg.dateCol] : '',
    planningStatus: planning ? planning.status : '',
    planningJsonEmpty: planning ? !String(planning.planningJson || '').trim() : true
  });

  if (!cfg.applyCleanup) return 0;

  var cellsToClear = [cfg.auditIdCol, cfg.statusCol, cfg.startCol, cfg.endCol]
    .filter(function(col) { return col >= 0; });

  for (var i = 0; i < cellsToClear.length; i++) {
    cfg.sheet.getRange(cfg.rowIndex1, cellsToClear[i] + 1).setValue('');
  }

  return cellsToClear.length;
}

function MVP3S_findHeader_(headers, candidates) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = MVP3S_normHeader_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }

  for (var c = 0; c < candidates.length; c++) {
    var wanted = MVP3S_normHeader_(candidates[c]);
    if (wanted && map[wanted] !== undefined) return map[wanted];
  }

  return -1;
}

function MVP3S_normHeader_(value) {
  return String(value || '')
    .replace(/[–—−]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function MVP3S_normalizeStatus_(raw) {
  var s = String(raw || '').trim().toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (s === 'pending planning' || s === 'pendingplanning') return 'PENDING_PLANNING';
  if (s === 'pending approval' || s === 'pendingapproval') return 'PENDING_APPROVAL';
  if (s === 'pending acceptance' || s === 'pendingacceptance') return 'APPROVED';
  if (s === 'approved') return 'APPROVED';
  if (s === 'accepted') return 'ACCEPTED';
  if (s === 'completed' || s === 'complete') return 'COMPLETED';
  if (s === 'rejected' || s === 'reject') return 'REJECTED';

  return String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
}
