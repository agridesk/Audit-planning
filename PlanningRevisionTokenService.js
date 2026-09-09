/***********************************************************************
 * PlanningRevisionTokenService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_REVISION_TOKEN_R1
 *
 * PURPOSE
 *   Derive a deterministic optimistic-concurrency token from the current
 *   canonical planning state of one Audit planning row.
 *
 * GOVERNANCE
 *   - Audit planning remains the SSoT.
 *   - Revision token is derived metadata only; it owns no planning truth.
 *   - Fingerprint covers the planning/lifecycle fields whose concurrent
 *     change must force a Workspace reload before Commit:
 *       Status, Assigned to, Date - Planned, Planning JSON.
 *   - No writes and no new revision column/property.
 *   - Future Commit must reread this token under Platform_withLock and pass
 *     it to PlanningOptimisticRevisionGuard before canonical preflight/write.
 *
 * SPEED CONTRACT
 *   - One targeted audit-row read when available.
 *   - No full-sheet scan when __mp_getAuditPlanningRow_ or Platform PAL can
 *     resolve the row directly.
 *   - Hashing is in-memory only.
 ***********************************************************************/

var PLANNING_REVISION_TOKEN_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_REVISION_TOKEN_R1';

function PRT_clean_(v) {
  if (v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'UTC', 'yyyy-MM-dd');
  }
  return String(v).trim();
}

function PRT_normJson_(v) {
  var s = PRT_clean_(v);
  if (!s) return '';
  try { return JSON.stringify(JSON.parse(s)); }
  catch (e) { return s; }
}

function PRT_findCol_(headers, candidates) {
  headers = headers || [];
  var normalized = headers.map(function(h) {
    return PRT_clean_(h).toLowerCase().replace(/[ _\-–—]/g, '');
  });
  for (var c = 0; c < candidates.length; c++) {
    var key = PRT_clean_(candidates[c]).toLowerCase().replace(/[ _\-–—]/g, '');
    var ix = normalized.indexOf(key);
    if (ix >= 0) return ix;
  }
  return -1;
}

function PRT_value_(headers, row, candidates) {
  var ix = PRT_findCol_(headers, candidates);
  return ix >= 0 ? row[ix] : '';
}

function PRT_snapshotFromRow_(headers, row) {
  headers = headers || [];
  row = row || [];
  return {
    auditId: PRT_clean_(PRT_value_(headers, row, ['Audit ID','Audit_ID','AuditId','Audit Id'])),
    status: PRT_clean_(PRT_value_(headers, row, ['Status'])),
    assignedTo: PRT_clean_(PRT_value_(headers, row, ['Assigned to','Assigned To','Assigned auditor','Auditor'])),
    datePlanned: PRT_clean_(PRT_value_(headers, row, ['Date - Planned','Date planned','Date Planned','Planned date'])),
    planningJson: PRT_normJson_(PRT_value_(headers, row, ['Planning JSON','PlanningJson','Planning_JSON']))
  };
}

function PRT_serializeSnapshot_(snapshot) {
  snapshot = snapshot || {};
  return [
    'auditId=' + PRT_clean_(snapshot.auditId),
    'status=' + PRT_clean_(snapshot.status),
    'assignedTo=' + PRT_clean_(snapshot.assignedTo).toLowerCase(),
    'datePlanned=' + PRT_clean_(snapshot.datePlanned),
    'planningJson=' + PRT_normJson_(snapshot.planningJson)
  ].join('\n');
}

function PRT_sha1_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, String(text || ''));
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var n = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    var h = n.toString(16);
    out += h.length === 1 ? '0' + h : h;
  }
  return out;
}

function PRT_tokenFromSnapshot_(snapshot) {
  return 'PRT1-' + PRT_sha1_(PRT_serializeSnapshot_(snapshot));
}

function PRT_readCanonicalRow_(auditId, perf) {
  auditId = PRT_clean_(auditId);
  if (!auditId) throw new Error('PlanningRevisionTokenService: auditId is required');

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (typeof __mp_getAuditPlanningRow_ === 'function') {
    var targeted = __mp_getAuditPlanningRow_(ss, auditId);
    if (targeted && targeted.row) {
      if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'targetedRead', { source:'__mp_getAuditPlanningRow_', rowNumber:targeted.rowNumber || 0 });
      return { headers: targeted.hdr || [], row: targeted.row, rowNumber: targeted.rowNumber || 0, source:'__mp_getAuditPlanningRow_' };
    }
  }

  if (typeof Platform_findRowByKey === 'function' && typeof Platform_readRow === 'function') {
    var rowNum = Platform_findRowByKey('Audit planning', 'Audit ID', auditId);
    if (rowNum) {
      var obj = Platform_readRow('Audit planning', rowNum);
      if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'targetedRead', { source:'Platform PAL', rowNumber:rowNum });
      return { headers: obj._hdr || [], row: obj._raw || [], rowNumber:rowNum, source:'Platform PAL' };
    }
  }

  throw new Error('PlanningRevisionTokenService: audit not found: ' + auditId);
}

function PlanningRevisionTokenService_get(input) {
  input = input || {};
  var auditId = PRT_clean_(input.auditId);
  if (!auditId) throw new Error('PlanningRevisionTokenService: auditId is required');

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningRevisionTokenService_get', { auditId:auditId }) : null;
  var canonical = PRT_readCanonicalRow_(auditId, perf);
  var snapshot = PRT_snapshotFromRow_(canonical.headers, canonical.row);
  if (snapshot.auditId && snapshot.auditId !== auditId) throw new Error('PlanningRevisionTokenService: canonical row Audit ID mismatch');
  snapshot.auditId = auditId;
  var revision = PRT_tokenFromSnapshot_(snapshot);

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'deriveRevision', {
    source: canonical.source,
    planningJsonChars: snapshot.planningJson.length
  });

  var result = {
    success: true,
    build: PLANNING_REVISION_TOKEN_BUILD,
    auditId: auditId,
    revision: revision,
    snapshot: snapshot,
    meta: {
      writes: false,
      readOnly: true,
      derivedOnly: true,
      revisionIsConcurrencyTokenOnly: true,
      canonicalOwner: 'Audit planning',
      fields: ['Status','Assigned to','Date - Planned','Planning JSON'],
      rowSource: canonical.source,
      rowNumber: canonical.rowNumber || 0,
      lockRequiredForCommitReread: true,
      lockOwner: 'Platform_withLock'
    }
  };
  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, { rowSource:canonical.source, revisionPrefix:revision.substring(0,9) });
  return result;
}
