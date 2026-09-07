/**
 * =========================================================
 * LOG REALIZED AUDIT SERVICE
 * =========================================================
 * Build: 2026-04-30_STRUCTURAL_COMPLETION_OWNER_REVIEWED
 *
 * PURPOSE
 * - Own all writes to sheet "Log realized audits".
 * - Remove CompletionService dependency on ManagerV5 legacy helpers.
 * - Keep completed audits SSoT in Log realized audits.
 *
 * PUBLIC API
 * - LogRealizedAuditService_PreflightAppendFromAuditPlanning(rowObj, meta)
 * - LogRealizedAuditService_AppendFromAuditPlanning(rowObj, meta)
 * - LogRealizedAuditService_UpdateCompletedHours(auditId, hoursDedicated, meta)
 * - LogRealizedAuditService_Diagnose()
 *
 * COMPATIBILITY API
 * - managerV5_appendLogRealizedAuditRow_FromAuditPlanning_(shLog, logHeaders, rowObj, meta)
 * - managerV5_findRowByAuditIdInSheet_(sheet, headers, auditId, candidates)
 * - managerV5_getPlannedHoursForLog_(rowObj)
 * - managerV5_getHoursToBePlannedForLog_(rowObj)
 * - managerV5_getExecutedOnForLog_(rowObj)
 *
 * GOVERNANCE
 * - Completed audits SSoT = Log realized audits.
 * - Email is auditor identifier.
 * - Dates are written as yyyy-MM-dd text.
 * - No frontend-owned persistence.
 * =========================================================
 */

var LOG_REALIZED_AUDIT_SERVICE_BUILD = '2026-04-30_STRUCTURAL_COMPLETION_OWNER_REVIEWED';
var LOG_REALIZED_AUDIT_SERVICE_SHEET = 'Log realized audits';

function LogRealizedAuditService_PreflightAppendFromAuditPlanning(rowObj, meta) {
  return LogRealizedAuditService_prepareAppend_(rowObj, meta || {}, true);
}

function LogRealizedAuditService_AppendFromAuditPlanning(rowObj, meta) {
  var prepared = LogRealizedAuditService_prepareAppend_(rowObj, meta || {}, false);
  if (!prepared || prepared.success === false) return prepared;

  prepared.sheet.getRange(prepared.targetRow, 1, 1, prepared.row.length).setValues([prepared.row]);

  // δ1.5 (2026-05-03): invalidate persist cache so eligibility/rotation reads see the new row.
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_([LOG_REALIZED_AUDIT_SERVICE_SHEET]);
    }
  } catch(eInv) { Logger.log('[LogRealizedAuditService] persist invalidate failed (append): ' + eInv); }

  // δ1.5b (2026-05-03): also clear RAS pack — it embeds Log realized data
  // for rotation/consecutive computation. Without this, eligibility lists
  // would show stale rotation counts after a completion.
  try {
    if (typeof RotationAuditorService_clearCache === 'function') {
      RotationAuditorService_clearCache();
    }
  } catch(eRas) { Logger.log('[LogRealizedAuditService] RAS clear failed (append): ' + eRas); }

  return {
    success:true,
    auditId:prepared.auditId,
    rowIndex:prepared.targetRow,
    sheet:LOG_REALIZED_AUDIT_SERVICE_SHEET,
    build:LOG_REALIZED_AUDIT_SERVICE_BUILD,
    message:'Appended to Log realized audits'
  };
}

function LogRealizedAuditService_UpdateCompletedHours(auditId, hoursDedicated, meta) {
  meta = meta || {};
  auditId = LogRealizedAuditService_clean_(auditId);
  var n = Number(hoursDedicated);
  if (!auditId) return { success:false, message:'Missing auditId' };
  if (!isFinite(n) || n <= 0) return { success:false, message:'Hours dedicated must be > 0' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shLog = ss.getSheetByName(LOG_REALIZED_AUDIT_SERVICE_SHEET);
  if (!shLog) return { success:false, message:'Missing sheet: ' + LOG_REALIZED_AUDIT_SERVICE_SHEET };

  var rowIdx = LogRealizedAuditService_findRowByAuditId_(shLog, auditId);
  if (!rowIdx) return { success:false, message:'Completed audit not found in Log realized audits: ' + auditId };

  var headers = LogRealizedAuditService_getHeaders_(shLog);
  var colHours = LogRealizedAuditService_findHeaderIndex_(headers, ['Hours dedicated']);
  if (colHours < 0) return { success:false, message:'Log realized audits missing Hours dedicated column' };

  shLog.getRange(rowIdx, colHours + 1).setValue(n);

  var colStatus = LogRealizedAuditService_findHeaderIndex_(headers, ['Status']);
  if (colStatus >= 0) shLog.getRange(rowIdx, colStatus + 1).setValue(LogRealizedAuditService_clean_(meta.status || 'Completed'));

  // δ1.5 (2026-05-03): invalidate persist cache so eligibility/rotation reads see updated hours/status.
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_([LOG_REALIZED_AUDIT_SERVICE_SHEET]);
    }
  } catch(eInv) { Logger.log('[LogRealizedAuditService] persist invalidate failed (update): ' + eInv); }

  // δ1.5b (2026-05-03): also clear RAS pack (rotation engine embeds Log realized).
  try {
    if (typeof RotationAuditorService_clearCache === 'function') {
      RotationAuditorService_clearCache();
    }
  } catch(eRas) { Logger.log('[LogRealizedAuditService] RAS clear failed (update): ' + eRas); }

  return { success:true, auditId:auditId, rowIndex:rowIdx, hoursDedicated:n, message:'Completed hours updated' };
}

function LogRealizedAuditService_Diagnose() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_REALIZED_AUDIT_SERVICE_SHEET);
  var out = {
    success:true,
    build:LOG_REALIZED_AUDIT_SERVICE_BUILD,
    sheetFound:!!sh,
    headers:{},
    requiredHeadersOk:false
  };
  if (!sh) {
    out.success = false;
    out.message = 'Missing sheet: ' + LOG_REALIZED_AUDIT_SERVICE_SHEET;
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }
  var headers = LogRealizedAuditService_getHeaders_(sh);
  var required = ['Company','Auditor','Status','Date planned','Hours planned','Hours dedicated','Hours to be planned','Year','Audit ID','Company_UID'];
  out.headers.lastColumn = headers.length;
  out.headers.raw = headers;
  out.headers.required = {};
  var ok = true;
  for (var i = 0; i < required.length; i++) {
    var name = required[i];
    var found = LogRealizedAuditService_findHeaderIndex_(headers, [name]) >= 0;
    out.headers.required[name] = found;
    if (!found) ok = false;
  }
  out.requiredHeadersOk = ok;
  out.success = ok;
  if (!ok) out.message = 'Required Log realized audits headers missing';
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function LogRealizedAuditService_prepareAppend_(rowObj, meta, dryRun) {
  meta = meta || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shLog = ss.getSheetByName(LOG_REALIZED_AUDIT_SERVICE_SHEET);
  if (!shLog) return { success:false, message:'Missing sheet: ' + LOG_REALIZED_AUDIT_SERVICE_SHEET };
  if (!rowObj || typeof rowObj !== 'object') return { success:false, message:'Invalid rowObj' };

  var logHeaders = LogRealizedAuditService_getHeaders_(shLog);
  if (!logHeaders.length) return { success:false, message:'Log realized audits has no headers' };

  var auditId = LogRealizedAuditService_clean_(meta.auditId || LogRealizedAuditService_getCell_(rowObj, ['Audit ID']));
  if (!auditId) return { success:false, message:'Missing Audit ID for log append' };

  var cAuditId = LogRealizedAuditService_findHeaderIndex_(logHeaders, ['Audit ID']);
  var cHoursDedicated = LogRealizedAuditService_findHeaderIndex_(logHeaders, ['Hours dedicated']);
  if (cAuditId < 0) return { success:false, message:'Log realized audits missing Audit ID column' };
  if (cHoursDedicated < 0) return { success:false, message:'Log realized audits missing Hours dedicated column' };

  var existingRow = LogRealizedAuditService_findRowByAuditId_(shLog, auditId);
  if (existingRow) {
    return {
      success:false,
      duplicate:true,
      message:'Audit already exists in Log realized audits: ' + auditId,
      rowIndex:existingRow
    };
  }

  var row = new Array(logHeaders.length);
  for (var i = 0; i < row.length; i++) row[i] = '';

  var status = LogRealizedAuditService_clean_(meta.status || 'Completed');
  var company = LogRealizedAuditService_clean_(meta.companyName || LogRealizedAuditService_getCell_(rowObj, ['Company']));
  var auditor = LogRealizedAuditService_clean_(meta.auditorEmail || LogRealizedAuditService_getCell_(rowObj, ['Assigned to', 'Assigned auditor', 'Auditor']));
  var companyUid = LogRealizedAuditService_clean_(meta.companyUid || LogRealizedAuditService_getCell_(rowObj, ['Company_UID', 'Company UID', 'CompanyUid']));
  var managerEmail = LogRealizedAuditService_clean_(meta.managerEmail || LogRealizedAuditService_getCell_(rowObj, ['Manager_Email', 'Manager Email', 'Manager e-mail']));

  var datePlanned = LogRealizedAuditService_normDateText_(meta.datePlanned || LogRealizedAuditService_getCell_(rowObj, ['Date - Planned', 'Date planned', 'Date Planned']), LogRealizedAuditService_getDisplayCell_(rowObj, ['Date - Planned', 'Date planned', 'Date Planned']));
  var dateApproved = LogRealizedAuditService_normDateText_(meta.dateApproved || LogRealizedAuditService_getCell_(rowObj, ['Date - Approved', 'Date approved', 'Date Approved']), LogRealizedAuditService_getDisplayCell_(rowObj, ['Date - Approved', 'Date approved', 'Date Approved']));
  var dateAccepted = LogRealizedAuditService_normDateText_(meta.dateAccepted || LogRealizedAuditService_getCell_(rowObj, ['Date accepted', 'Date - Accepted', 'Date Accepted']), LogRealizedAuditService_getDisplayCell_(rowObj, ['Date accepted', 'Date - Accepted', 'Date Accepted']));
  var dateCompleted = LogRealizedAuditService_normDateText_(meta.dateCompleted || new Date(), '');

  var hoursPlanned = LogRealizedAuditService_toNumberOrBlank_(meta.hoursPlanned);
  if (hoursPlanned === '') hoursPlanned = LogRealizedAuditService_getPlannedHours_(rowObj);

  var hoursDedicated = LogRealizedAuditService_toNumberOrBlank_(meta.hoursDedicated);
  if (hoursDedicated === '') return { success:false, message:'Missing Hours dedicated' };

  var hoursToBePlanned = LogRealizedAuditService_toNumberOrBlank_(meta.hoursToBePlanned);
  if (hoursToBePlanned === '') hoursToBePlanned = LogRealizedAuditService_toNumberOrBlank_(LogRealizedAuditService_getCell_(rowObj, ['Total audit time in hours', 'Total hours', 'Hours to be planned']));

  var year = LogRealizedAuditService_clean_(meta.year || '');
  if (!year && datePlanned) year = String(datePlanned).slice(0, 4);
  if (!year) {
    var expiry = LogRealizedAuditService_normDateText_(LogRealizedAuditService_getCell_(rowObj, ['Date - Will Expire', 'Will Expire']), LogRealizedAuditService_getDisplayCell_(rowObj, ['Date - Will Expire', 'Will Expire']));
    if (expiry) year = String(expiry).slice(0, 4);
  }
  if (!year) year = String(new Date().getFullYear());

  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Company'], company);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Auditor'], auditor);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Status'], status);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Date planned', 'Date - Planned'], datePlanned);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Date approved', 'Date - Approved'], dateApproved);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Hours planned'], hoursPlanned);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Hours dedicated'], hoursDedicated);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Hours to be planned'], hoursToBePlanned);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Year'], year);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Date accepted', 'Date - Accepted'], dateAccepted);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Audit ID'], auditId);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Manager_Email', 'Manager Email', 'Manager e-mail'], managerEmail);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Company_UID', 'Company UID', 'CompanyUid'], companyUid);
  LogRealizedAuditService_setByHeader_(logHeaders, row, ['Date completed', 'Date Completed'], dateCompleted);

  for (var s = 1; s <= 8; s++) {
    var key = 'SCOPE_' + ('0' + s).slice(-2);
    var scopeVal = LogRealizedAuditService_getCell_(rowObj, [key]);
    if (LogRealizedAuditService_isMarked_(scopeVal)) {
      LogRealizedAuditService_setByHeader_(logHeaders, row, [key], 'x');
    }
  }

  return {
    success:true,
    dryRun:!!dryRun,
    auditId:auditId,
    sheet:shLog,
    headers:logHeaders,
    row:row,
    targetRow:shLog.getLastRow() + 1,
    build:LOG_REALIZED_AUDIT_SERVICE_BUILD
  };
}

function managerV5_appendLogRealizedAuditRow_FromAuditPlanning_(shLog, logHeaders, rowObj, meta) {
  return LogRealizedAuditService_AppendFromAuditPlanning(rowObj, meta || {});
}

function managerV5_findRowByAuditIdInSheet_(sheet, headers, auditId, candidates) {
  if (!sheet) return 0;
  auditId = LogRealizedAuditService_clean_(auditId);
  if (!auditId) return 0;
  var hdr = headers;
  if (!Array.isArray(hdr)) hdr = LogRealizedAuditService_getHeaders_(sheet);
  var col = LogRealizedAuditService_findHeaderIndex_(hdr, candidates || ['Audit ID']);
  if (col < 0) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var vals = sheet.getRange(2, col + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (LogRealizedAuditService_clean_(vals[i][0]) === auditId) return i + 2;
  }
  return 0;
}

function managerV5_getPlannedHoursForLog_(rowObj) {
  return LogRealizedAuditService_getPlannedHours_(rowObj);
}

function managerV5_getHoursToBePlannedForLog_(rowObj) {
  return LogRealizedAuditService_toNumberOrBlank_(LogRealizedAuditService_getCell_(rowObj, ['Total audit time in hours', 'Total hours', 'Hours to be planned']));
}

function managerV5_getExecutedOnForLog_(rowObj) {
  return LogRealizedAuditService_normDateText_(LogRealizedAuditService_getCell_(rowObj, ['Date - Planned', 'Date planned']), LogRealizedAuditService_getDisplayCell_(rowObj, ['Date - Planned', 'Date planned']));
}

function LogRealizedAuditService_getPlannedHours_(rowObj) {
  var direct = LogRealizedAuditService_toNumberOrBlank_(LogRealizedAuditService_getCell_(rowObj, ['Hours planned', 'Planned hours']));
  if (direct !== '') return direct;

  var rawJson = LogRealizedAuditService_clean_(LogRealizedAuditService_getCell_(rowObj, ['Planning JSON', 'PlanningJSON']));
  if (!rawJson) return '';

  try {
    var parsed = JSON.parse(rawJson);
    var blocks = [];
    if (parsed && Array.isArray(parsed.blocks)) blocks = parsed.blocks;
    else if (parsed && Array.isArray(parsed.slots)) blocks = parsed.slots;
    else if (Array.isArray(parsed)) blocks = parsed;

    var mins = 0;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i] || {};
      var s = LogRealizedAuditService_timeToMinutes_(b.start || b.startTime || b.from);
      var e = LogRealizedAuditService_timeToMinutes_(b.end || b.endTime || b.to);
      if (isFinite(s) && isFinite(e) && e > s) mins += (e - s);
    }
    if (mins > 0) return Math.round((mins / 60) * 100) / 100;
  } catch (eJson) {}

  return '';
}

function LogRealizedAuditService_getHeaders_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
}

function LogRealizedAuditService_findRowByAuditId_(sheet, auditId) {
  return managerV5_findRowByAuditIdInSheet_(sheet, LogRealizedAuditService_getHeaders_(sheet), auditId, ['Audit ID']);
}

function LogRealizedAuditService_setByHeader_(headers, row, candidates, value) {
  var idx = LogRealizedAuditService_findHeaderIndex_(headers, candidates);
  if (idx >= 0 && idx < row.length) row[idx] = value;
}

function LogRealizedAuditService_getCell_(rowObj, candidates) {
  if (!rowObj) return '';
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var byHeader = rowObj.byHeader || rowObj.valuesByHeader || rowObj.map || {};
  for (var i = 0; i < candidates.length; i++) {
    var k = LogRealizedAuditService_normHeader_(candidates[i]);
    if (byHeader.hasOwnProperty(k)) return byHeader[k];
  }
  return '';
}

function LogRealizedAuditService_getDisplayCell_(rowObj, candidates) {
  if (!rowObj) return '';
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var byHeader = rowObj.displayByHeader || rowObj.displayMap || {};
  for (var i = 0; i < candidates.length; i++) {
    var k = LogRealizedAuditService_normHeader_(candidates[i]);
    if (byHeader.hasOwnProperty(k)) return byHeader[k];
  }
  return '';
}

function LogRealizedAuditService_findHeaderIndex_(headers, candidates) {
  headers = headers || [];
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = LogRealizedAuditService_normHeader_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var k = LogRealizedAuditService_normHeader_(candidates[j]);
    if (map[k] !== undefined) return map[k];
  }
  return -1;
}

function LogRealizedAuditService_normHeader_(s) {
  return String(s || '')
    .replace(/[–—−]/g, '-')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function LogRealizedAuditService_clean_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function LogRealizedAuditService_isMarked_(v) {
  var s = LogRealizedAuditService_clean_(v).toLowerCase();
  return s === 'x' || s === 'yes' || s === 'true' || s === '1';
}

function LogRealizedAuditService_toNumberOrBlank_(v) {
  if (v === null || v === '' || typeof v === 'undefined') return '';
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : '';
}

function LogRealizedAuditService_timeToMinutes_(v) {
  if (v === null || v === '' || typeof v === 'undefined') return NaN;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v.getHours() * 60 + v.getMinutes();
  var s = LogRealizedAuditService_clean_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return NaN;
  var hh = Number(m[1]);
  var mm = Number(m[2]);
  if (!isFinite(hh) || !isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

function LogRealizedAuditService_normDateText_(value, displayValue) {
  var display = LogRealizedAuditService_clean_(displayValue);
  var parsedDisplay = LogRealizedAuditService_parseDateText_(display);
  if (parsedDisplay) return parsedDisplay;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }

  var raw = LogRealizedAuditService_clean_(value);
  var parsedRaw = LogRealizedAuditService_parseDateText_(raw);
  if (parsedRaw) return parsedRaw;
  return raw;
}

function LogRealizedAuditService_parseDateText_(s) {
  s = LogRealizedAuditService_clean_(s);
  if (!s) return '';

  var mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3];

  var mIsoTime = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (mIsoTime) return mIsoTime[1] + '-' + mIsoTime[2] + '-' + mIsoTime[3];

  var mSlash = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})$/);
  if (mSlash) {
    var dd = ('0' + Number(mSlash[1])).slice(-2);
    var mm = ('0' + Number(mSlash[2])).slice(-2);
    var yy = mSlash[3];
    return yy + '-' + mm + '-' + dd;
  }

  return '';
}
