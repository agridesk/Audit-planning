/***********************************************************************
 * AvailabilityPeriodReadModel.js
 * BUILD: 2026-09-09_ROADMAP_2_4_AVAILABILITY_PERIOD_READ_MODEL_R1
 *
 * PURPOSE
 *   Read-only compact period projection of canonical Auditor Availability.
 *   Intended for Planning Demand, Concept Planning and Workspace 2.0.
 *
 * GOVERNANCE
 *   - Canonical truth remains Auditor Availability + AvailabilityService.
 *   - This file owns NO availability business rules and performs NO writes.
 *   - Commit/save validation must still call canonical AvailabilityService.
 *
 * SPEED CONTRACT
 *   - One header read + one bounded bulk data read per request.
 *   - Filter by period/auditor in memory.
 *   - No per-row Spreadsheet calls.
 *   - No cache writes, no persistent telemetry.
 *   - DEV-only timing through DevPerformanceLog.
 ***********************************************************************/

var AVAILABILITY_PERIOD_READ_MODEL_BUILD = '2026-09-09_ROADMAP_2_4_AVAILABILITY_PERIOD_READ_MODEL_R1';

function APRM_clean_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g, ' ').trim();
}

function APRM_norm_(v) {
  return APRM_clean_(v).toLowerCase();
}

function APRM_headerKey_(v) {
  return APRM_norm_(v).replace(/\s+/g, '_');
}

function APRM_findCol_(headers, candidates) {
  var map = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var key = APRM_headerKey_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  for (var j = 0; j < (candidates || []).length; j++) {
    var k = APRM_headerKey_(candidates[j]);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

function APRM_isoDate_(v, tz) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = APRM_clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

function APRM_time_(v, tz) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz || Session.getScriptTimeZone(), 'HH:mm');
  }
  var s = APRM_clean_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
}

function APRM_period_(input, tz) {
  input = input || {};
  var from = APRM_isoDate_(input.from || input.start || input.periodFrom, tz);
  var to = APRM_isoDate_(input.to || input.end || input.periodTo, tz);
  if (!from || !to) throw new Error('AvailabilityPeriodReadModel: valid from/to required');
  if (to < from) throw new Error('AvailabilityPeriodReadModel: to cannot be before from');
  return { from: from, to: to };
}

function APRM_auditorSet_(input) {
  var raw = input && (input.auditors || input.auditorEmails || input.auditorEmail || input.auditor);
  if (!raw) return null;
  var arr = Array.isArray(raw) ? raw : [raw];
  var set = {};
  for (var i = 0; i < arr.length; i++) {
    var k = APRM_norm_(arr[i]);
    if (k) set[k] = true;
  }
  return Object.keys(set).length ? set : null;
}

function APRM_sheet_() {
  var ss = SpreadsheetApp.getActive();
  return ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
}

function APRM_slot_(row, startCol, endCol, auditIdCol, statusCol, tz, slot) {
  if (startCol < 0 && endCol < 0 && auditIdCol < 0 && statusCol < 0) return null;
  var start = startCol >= 0 ? APRM_time_(row[startCol], tz) : '';
  var end = endCol >= 0 ? APRM_time_(row[endCol], tz) : '';
  var auditId = auditIdCol >= 0 ? APRM_clean_(row[auditIdCol]) : '';
  var status = statusCol >= 0 ? APRM_clean_(row[statusCol]) : '';
  if (!start && !end && !auditId && !status) return null;
  return { slot: slot, start: start, end: end, auditId: auditId, status: status };
}

function AvailabilityPeriodReadModel_get(input) {
  input = input || {};
  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('AvailabilityPeriodReadModel_get', {
    from: input.from || input.start || input.periodFrom || '',
    to: input.to || input.end || input.periodTo || '',
    auditorCount: Array.isArray(input.auditors || input.auditorEmails) ? (input.auditors || input.auditorEmails).length : ((input.auditorEmail || input.auditor) ? 1 : 0)
  }) : null;

  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var period = APRM_period_(input, tz);
  var auditorSet = APRM_auditorSet_(input);
  var sh = APRM_sheet_();
  if (!sh) throw new Error("AvailabilityPeriodReadModel: missing sheet 'Auditor Availability'");

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) {
    var empty0 = { success: true, build: AVAILABILITY_PERIOD_READ_MODEL_BUILD, period: period, days: {}, rows: [], meta: { sourceRows: 0, returnedRows: 0, writes: false } };
    if (typeof DPL_end_ === 'function') empty0.devPerformance = DPL_end_(perf, { returnedRows: 0 });
    return empty0;
  }

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var cDate = APRM_findCol_(headers, ['Date']);
  var cAud = APRM_findCol_(headers, ['Auditor_Email','Auditor Email','Email','E-mail','Auditor_Name','Auditor Name']);
  var cAvail = APRM_findCol_(headers, ['Available']);
  var cS1 = APRM_findCol_(headers, ['First_Audit_Start_Time','First Audit Start Time']);
  var cE1 = APRM_findCol_(headers, ['First_Audit_End_Time','First Audit End Time']);
  var cID1 = APRM_findCol_(headers, ['Audit_ID_1','Audit ID 1','AuditId1']);
  var cSt1 = APRM_findCol_(headers, ['Status_1','Status 1','Status','Source']);
  var cS2 = APRM_findCol_(headers, ['Second_Audit_Start_Time','Second Audit Start Time']);
  var cE2 = APRM_findCol_(headers, ['Second_Audit_End_Time','Second Audit End Time']);
  var cID2 = APRM_findCol_(headers, ['Audit_ID_2','Audit ID 2','AuditId2']);
  var cSt2 = APRM_findCol_(headers, ['Status_2','Status 2']);
  var cUpd = APRM_findCol_(headers, ['Last_Updated','Last Updated','Timestamp']);

  if (cDate < 0 || cAud < 0 || cAvail < 0) {
    throw new Error('AvailabilityPeriodReadModel: required columns missing');
  }

  var required = [cDate,cAud,cAvail,cS1,cE1,cID1,cSt1,cS2,cE2,cID2,cSt2,cUpd].filter(function(x){ return x >= 0; });
  var maxCol = required.length ? (Math.max.apply(null, required) + 1) : lastCol;
  var values = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, maxCol).getValues() : [];
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'bulkRead', { rows: values.length, cols: maxCol });

  var rows = [];
  var days = {};
  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    var date = APRM_isoDate_(row[cDate], tz);
    if (!date || date < period.from || date > period.to) continue;

    var auditorEmail = APRM_norm_(row[cAud]);
    if (!auditorEmail) continue;
    if (auditorSet && !auditorSet[auditorEmail]) continue;

    var rec = {
      date: date,
      auditorEmail: auditorEmail,
      available: APRM_clean_(row[cAvail]),
      slots: [],
      lastUpdated: cUpd >= 0 ? APRM_clean_(row[cUpd]) : '',
      sourceRow: r + 2
    };
    var s1 = APRM_slot_(row, cS1, cE1, cID1, cSt1, tz, 1);
    var s2 = APRM_slot_(row, cS2, cE2, cID2, cSt2, tz, 2);
    if (s1) rec.slots.push(s1);
    if (s2) rec.slots.push(s2);

    rows.push(rec);
    if (!days[auditorEmail]) days[auditorEmail] = {};
    if (!days[auditorEmail][date]) days[auditorEmail][date] = [];
    days[auditorEmail][date].push(rec);
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'filterProject', { returnedRows: rows.length, auditors: Object.keys(days).length });

  rows.sort(function(a, b) {
    if (a.auditorEmail !== b.auditorEmail) return a.auditorEmail.localeCompare(b.auditorEmail);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sourceRow - b.sourceRow;
  });

  var result = {
    success: true,
    build: AVAILABILITY_PERIOD_READ_MODEL_BUILD,
    period: period,
    rows: rows,
    days: days,
    meta: {
      sourceRows: values.length,
      returnedRows: rows.length,
      auditors: Object.keys(days).length,
      columnsRead: maxCol,
      canonicalOwner: 'AvailabilityService / Auditor Availability',
      writes: false
    }
  };
  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, { returnedRows: rows.length, auditors: Object.keys(days).length });
  return result;
}
