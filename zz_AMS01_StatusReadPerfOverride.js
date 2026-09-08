/**
 * FILE: zz_AMS01_StatusReadPerfOverride.js
 * BUILD: AMS01_STATUS_READ_PERF_20260908_R2
 * DEV hot-path override only. Reuses canonical AuditPlanningRowIndexCache.
 * R2: exposes execution-local audit row context for downstream notification briefing.
 */

var AMS01_STATUS_READ_PERF_BUILD = 'AMS01_STATUS_READ_PERF_20260908_R2';
var AMS01_STATUS_AUDIT_CONTEXT_CACHE = {};

function Status_loadAudit_(auditId) {
  auditId = String(auditId || '').trim();
  if (!auditId) return { found:false, error: Status_fail_('Missing auditId') };
  var ss = SpreadsheetApp.getActive();
  if (!ss) return { found:false, error: Status_fail_('No active spreadsheet') };
  if (typeof __mp_getAuditPlanningRow_ !== 'function') {
    return { found:false, error: Status_fail_('__mp_getAuditPlanningRow_ unavailable') };
  }
  var pack = __mp_getAuditPlanningRow_(ss, auditId);
  if (!pack || !pack.row || !pack.hdr || !pack.rowNumber) {
    return { found:false, error: Status_fail_('Audit not found: ' + auditId) };
  }
  var hdr = pack.hdr || [];
  var row = pack.row || [];
  function normHeader_(v) {
    return String(v || '').replace(/[–—−]/g, '-').replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  var map = {};
  for (var hi = 0; hi < hdr.length; hi++) {
    var hk = normHeader_(hdr[hi]);
    if (hk && map[hk] === undefined) map[hk] = hi;
  }
  function findHeader_(candidates) {
    for (var ci = 0; ci < (candidates || []).length; ci++) {
      var key = normHeader_(candidates[ci]);
      if (key && map[key] !== undefined) return map[key];
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
  if (String(row[idxAI] || '').trim() !== auditId) return { found:false, error: Status_fail_('Audit ID lookup mismatch for: ' + auditId) };

  AMS01_STATUS_AUDIT_CONTEXT_CACHE[auditId] = {
    sh: pack.sh,
    hdr: hdr,
    row: row,
    rowNumber: pack.rowNumber,
    indexFromCache: !!pack.indexFromCache
  };

  return {
    found:true,
    sheet:pack.sh,
    rowIndex:pack.rowNumber,
    row:row,
    hdr:hdr,
    auditId:auditId,
    status:String(row[idxStatus] || '').trim(),
    col:{ ai:idxAI, status:idxStatus, assigned:idxAssigned, planned:idxPlanned, approved:idxApproved, hours:idxHours, json:idxJson },
    __ams01ReadBuild:AMS01_STATUS_READ_PERF_BUILD,
    __ams01IndexFromCache:!!pack.indexFromCache
  };
}

function AMS01_StatusReadPerfStatus() {
  var auditId = 'AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var t0 = Date.now();
  var r = Status_loadAudit_(auditId);
  return {
    success:!!(r && r.found),
    active:!!(r && r.__ams01ReadBuild === AMS01_STATUS_READ_PERF_BUILD),
    build:AMS01_STATUS_READ_PERF_BUILD,
    auditId:auditId,
    status:r && r.status || '',
    indexFromCache:!!(r && r.__ams01IndexFromCache),
    wallMs:Date.now()-t0
  };
}
