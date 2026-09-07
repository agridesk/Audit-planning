// BUILD: AUDIT_MANAGER_HELPERS_SPLIT_20260425
/**
 * AuditManagerHelpers.gs
 * Extracted from ManagerV5.js without behavior changes.
 * Keeps legacy function names/aliases for compatibility.
 */
// BUILD: MANAGERV5_AUTOSYNC_ASSIGNED_PREASSIGNED_20260118_122412
/**
 * FULL FILE - ManagerV5.gs (FAST_ACTIONS_ASYNC_MAIL) - REGENERATED
 * This file is a complete replacement of ManagerV5.gs.
 * Includes: fast action handlers (row-level), async mail queue, perf-safe helpers.
 * No planning/availability/status logic changes.
 */

/**
 * Resolve manager (actor) email robustly for WebApp executions.
 * - Prefers explicit options.managerEmail if provided by UI
 * - Falls back to Session.getActiveUser() (when available)
 * - Falls back to Session.getEffectiveUser() (owner / executing account)
 * - Final fallback: planning@agriqa.es (system sender / single manager)
 */
// PERF-PHASE6: Per-execution memo + CacheService memoization for the
// Auditors-sheet fallback. Eliminates 3-4 redundant resolutions per save and
// ~1500ms of repeated full-sheet reads on the Auditors sheet.
var _V5_MGR_EMAIL_MEMO_ = null;            // per-execution memo (resolver result)
var _V5_MGR_AUDITORS_SHEET_MEMO_ = null;   // per-execution memo (Auditors-sheet result)


function V5_resolveManagerEmail_(options) {
  options = options || {};
  function isEmail_(s) {
    s = String(s || '').trim();
    return s && s.indexOf('@') > 0 && s.indexOf(' ') === -1;
  }

  var explicit = options.managerEmail || options.userEmail || options.actorEmail || '';
  if (isEmail_(explicit)) return String(explicit).trim();

  if (_V5_MGR_EMAIL_MEMO_ && isEmail_(_V5_MGR_EMAIL_MEMO_)) {
    return _V5_MGR_EMAIL_MEMO_;
  }

  try {
    if (Session.getActiveUser && Session.getActiveUser().getEmail) {
      var au = Session.getActiveUser().getEmail();
      if (isEmail_(au)) {
        _V5_MGR_EMAIL_MEMO_ = String(au).trim();
        return _V5_MGR_EMAIL_MEMO_;
      }
    }
  } catch (e) {}

  try {
    var mgr = v5_findManagerEmailFromAuditorsSheet_();
    if (isEmail_(mgr)) {
      _V5_MGR_EMAIL_MEMO_ = String(mgr).trim();
      return _V5_MGR_EMAIL_MEMO_;
    }
  } catch (e2) {}

  return 'UNKNOWN';
}


function v5_findManagerEmailFromAuditorsSheet_() {
  if (_V5_MGR_AUDITORS_SHEET_MEMO_ !== null) {
    return _V5_MGR_AUDITORS_SHEET_MEMO_;
  }

  var _cache = null;
  var _cacheKey = 'V5_MGR_EMAIL_FROM_AUDITORS_V3';
  try { _cache = CacheService.getScriptCache(); } catch(eC){ _cache = null; }
  if (_cache) {
    try {
      var hit = _cache.get(_cacheKey);
      if (hit) {
        _V5_MGR_AUDITORS_SHEET_MEMO_ = String(hit || '');
        return _V5_MGR_AUDITORS_SHEET_MEMO_;
      }
    } catch(eC2){}
  }

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Auditors');
  if (!sh) { _V5_MGR_AUDITORS_SHEET_MEMO_ = ''; return ''; }

  var lastRow = sh.getLastRow();
  if (lastRow < 2) { _V5_MGR_AUDITORS_SHEET_MEMO_ = ''; return ''; }

  var vals = sh.getRange(2, 3, lastRow - 1, 3).getDisplayValues();
  function norm_(v){ return String(v || '').trim().toLowerCase(); }

  var found = '';
  for (var i = 0; i < vals.length; i++) {
    var email = String(vals[i][0] || '').trim();
    var active = norm_(vals[i][1]);
    var role = norm_(vals[i][2]);
    if (!email) continue;
    if (active !== 'yes') continue;
    if (role !== 'manager') continue;
    found = email;
    break;
  }

  _V5_MGR_AUDITORS_SHEET_MEMO_ = found;
  if (_cache && found) {
    try { _cache.put(_cacheKey, found, 3600); } catch(eC3){}
  }
  return found;
}


/** AuditId normalization helper (performance-safe, no functional change) */
function v5_normAuditId_(v) {
  v = String(v == null ? '' : v);
  // Normalize common invisible whitespace characters that can break TextFinder exact matching.
  v = v.replace(/\u00A0/g, ' ')
       .replace(/\u200B/g, '')
       .replace(/\u200C/g, '')
       .replace(/\u200D/g, '')
       .replace(/\uFEFF/g, '')
       .trim();
  return v;
}

function v5_resolveHeaderCol_(headersMap, headerAliases) {
  if (!headersMap || !headerAliases) return null;
  // headerAliases can be a string or an array of possible header names
  if (Object.prototype.toString.call(headerAliases) === '[object Array]') {
    for (var i = 0; i < headerAliases.length; i++) {
      var key = String(headerAliases[i] || '').trim();
      if (key && headersMap[key]) return headersMap[key];
    }
    return null;
  }
  var k = String(headerAliases || '').trim();
  return k && headersMap[k] ? headersMap[k] : null;
}



function __mark_(name){ /* global noop; local scopes may override */ }

/** PERF SAFE HELPERS (no functional change) **/
function v5_findAuditPlanningRowByAuditIdFast_(sheet, headersMap, auditId) {
  auditId = v5_normAuditId_(auditId);
  if (!auditId) return null;
  var col = v5_resolveHeaderCol_(headersMap, H_AUDIT_ID);
  if (!col) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  // Fast lookup using TextFinder, but be tolerant of accidental whitespace in cells.
  // We do NOT change business logic: we still require exact match after trimming.
  var rng = sheet.getRange(2, col, lastRow - 1, 1);
  var finder = rng.createTextFinder(auditId)
    .useRegularExpression(false)
    .matchCase(false)
    .matchEntireCell(false);

  var tf = finder.findNext();
  while (tf) {
    var v = tf.getDisplayValue();
    if (v5_normAuditId_(v) === auditId) return tf.getRow();
    tf = finder.findNext();
  }
  // Fallback: scan the Audit_ID column values (still fast; single column) in case TextFinder misses due to hidden chars.
  try {
    var vals = rng.getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      if (v5_normAuditId_(vals[i][0]) === auditId) return i + 2;
    }
  } catch (e) {}
  return null;
}


function v5_buildAuditPlanningRowObjectFromSheet_(sheet, rowIndex) {
  if (!rowIndex || rowIndex < 2) return null;
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var row = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  var obj = {};
  for (var c = 0; c < headers.length; c++) obj[String(headers[c])] = row[c];
  obj._rowIndex = rowIndex;
  return obj;
}
function getAuditPlanningSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET_AUDIT_PLANNING);
}

function getRejectedAuditsSheet_() {
  return SpreadsheetApp.getActive().getSheetByName(SHEET_REJECTED_AUDITS);
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function (name, idx) {
    if (!name) return;
    var raw = String(name);
    var trimmed = raw.trim();
    // Store both raw and trimmed header keys to avoid breakage from accidental spaces.
    map[raw] = idx + 1; // 1-based
    if (trimmed && trimmed !== raw) map[trimmed] = idx + 1;
  });
  return map;
}

function firstExistingHeader_(headersMap, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var h = candidates[i];
    if (headersMap[h]) return h;
  }
  return null;
}

function getCell_(rowObj, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var k = candidates[i];
    if (rowObj.hasOwnProperty(k)) return rowObj[k];
  }
  return '';
}

/**
 * Resolve scopes string from a planning row robustly.
 * - Primary: H_SCOPES (expanded header candidates)
 * - Secondary: any column header containing 'scope'/'standard'/'scheme'
 * - If JSON is detected (array/object), extract readable names.
 */
function V5_resolveScopesFromRow_(row, headersMap) {
  var s = String(getCell_(row, H_SCOPES) || '').trim();
  if (s) return s;

  // Secondary scan: any scope-like header
  try {
    var keys = Object.keys(headersMap || {});
    for (var i = 0; i < keys.length; i++) {
      var h = String(keys[i] || '').toLowerCase();
      if (h.indexOf('scope') === -1 && h.indexOf('standard') === -1 && h.indexOf('scheme') === -1) continue;
      var idx = headersMap[keys[i]];
      var v;
      if (row && Object.prototype.toString.call(row) === '[object Object]' && !(row instanceof Array)) {
        v = row[keys[i]];
      } else {
        v = row[idx - 1];
      }
      if (v == null) continue;
      var raw = String(v).trim();
      if (!raw) continue;

      // If it's JSON, try to parse and flatten
      if ((raw[0] === '[' && raw[raw.length-1] === ']') || (raw[0] === '{' && raw[raw.length-1] === '}')) {
        try {
          var obj = JSON.parse(raw);
          var names = [];
          if (Array.isArray(obj)) {
            for (var j = 0; j < obj.length; j++) {
              var it = obj[j];
              if (it == null) continue;
              if (typeof it === 'string') names.push(it);
              else if (typeof it === 'object') {
                names.push(it.name || it.standard || it.scheme || it.code || it.id || '');
              }
            }
          } else if (typeof obj === 'object') {
            // common shapes: {scopes:[...]} or {standards:[...]}
            var arr = obj.scopes || obj.standards || obj.schemes || obj.items || [];
            if (Array.isArray(arr)) {
              for (var k = 0; k < arr.length; k++) {
                var it2 = arr[k];
                if (typeof it2 === 'string') names.push(it2);
                else if (it2 && typeof it2 === 'object') names.push(it2.name || it2.standard || it2.scheme || it2.code || it2.id || '');
              }
            }
          }
          names = names.map(function(x){ return String(x||'').trim(); }).filter(function(x){ return !!x; });
          if (names.length) return names.join(', ');
        } catch (ejson) {
          // fall through: return raw JSON as-is if parsing fails
          return raw;
        }
      }

      return raw;
    }
  } catch (e) {}

  return '';
}

function V5_resolveScopesForRejected_(rowObj, headersMap) {
  // Preferred: explicit Scopes_List column (AN) if present
  try {
    var v = getCell_(rowObj, H_SCOPES_LIST);
    v = (v == null) ? '' : String(v).trim();
    if (v && v !== '✗' && v !== 'x' && v !== 'X') return v;
  } catch (e) {}

  // Preferred fallback for MVP: derive from the same scope-slot logic used by the grid chips
  // (reads the scope-slot columns with "x" and maps them via v5_loadConfigScopes_()).
  try {
    var sh = getAuditPlanningSheet_();
    if (sh) {
      var hdrArr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] || [];
      var sp = v5_buildScopesPayloadForRow_(hdrArr, rowObj);
      var st = sp && sp.scopesText ? String(sp.scopesText).trim() : '';
      if (st) return st;
    }
  } catch (e2) {}

  // Last resort: whatever legacy Scopes columns contain (may be blank)
  var s = String(V5_resolveScopesFromRow_(rowObj, headersMap) || '').trim();
  if (s === '✗' || s.toLowerCase() === 'x') return '';
  return s;
}



function setCell_(rowObj, headersMap, candidates, value) {
  var key = firstExistingHeader_(headersMap, candidates);
  if (!key) return false;
  rowObj[key] = value;
  return true;
}

function v5_managerCellToYmd_(v) {
  if (v === null || typeof v === 'undefined' || v === '') return '';
  var tz = '';
  try {
    var ss = SpreadsheetApp.getActive();
    tz = ss && ss.getSpreadsheetTimeZone ? String(ss.getSpreadsheetTimeZone() || '').trim() : '';
  } catch (e) {}
  if (!tz) tz = 'Europe/Paris';

  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }

  var s = String(v == null ? '' : v).trim();
  if (!s) return '';

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];

  var d = _v5_parseDate_(v);
  if (d && !isNaN(d.getTime())) {
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  return s;
}

function normalizeDate_(v) {
  return v5_managerCellToYmd_(v);
}

function v5_formatDateYMD_(v) {
  return v5_managerCellToYmd_(v);
}

function getAllAuditPlanningRows_() {
  var sheet = getAuditPlanningSheet_();
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var headers = getHeaderMap_(sheet);
  var range   = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var values  = range.getValues();

  return values.map(function (row, idx) {
    var obj = {};
    Object.keys(headers).forEach(function (key) {
      obj[key] = row[headers[key] - 1];
    });
    obj._rowIndex = idx + 2; // actual sheet row index
    return obj;
  });
}

function writeAuditPlanningRow_(rowIndex, rowObj) {
  var sheet = getAuditPlanningSheet_();
  if (!sheet) throw new Error("Missing sheet '" + SHEET_AUDIT_PLANNING + "'");

  var headers = getHeaderMap_(sheet);
  var row = [];
  for (var col = 1; col <= sheet.getLastColumn(); col++) row.push('');

  Object.keys(headers).forEach(function (key) {
    row[headers[key] - 1] = rowObj[key];
  });

  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

// Fast partial write for Extension toggle (only touches the two extension columns)
// This is safe because applying/undoing extension only changes these columns.
function v5_writeExtensionCells_(rowIndex, headersMap, extendedExpireZ, extensionAppliedText) {
  var sheet = getAuditPlanningSheet_();
  if (!sheet) throw new Error("Missing sheet '" + SHEET_AUDIT_PLANNING + "'");
  var colZ = headersMap && headersMap[H_EXTENDED_EXPIRE_Z];
  var colExt = headersMap && headersMap[H_EXTENSION];
  if (!colZ || !colExt) throw new Error('Missing extension columns in Audit planning');

  // Try to batch into a single setValues() when columns are adjacent.
  var cMin = Math.min(colZ, colExt);
  var cMax = Math.max(colZ, colExt);
  if (cMax - cMin === 1) {
    var row = (colZ === cMin) ? [[extendedExpireZ, extensionAppliedText]] : [[extensionAppliedText, extendedExpireZ]];
    sheet.getRange(rowIndex, cMin, 1, 2).setValues(row);
    return;
  }

  // Fallback: two writes (non-adjacent columns)
  sheet.getRange(rowIndex, colZ, 1, 1).setValue(extendedExpireZ);
  sheet.getRange(rowIndex, colExt, 1, 1).setValue(extensionAppliedText);
}

function logManagerV5_(message, data) {
  try {
    var payload = {
      env: MANAGER_V5_ENVIRONMENT,
      version: MANAGER_V5_VERSION,
      message: message,
      data: data || {},
      user: (Session.getActiveUser && Session.getActiveUser().getEmail && Session.getActiveUser().getEmail()) || 'UNKNOWN'
    };
    // logging disabled in MVP runtime
  } catch (e) {
    // ignore
  }
}

// === Column candidate lists (robust to header naming) ========

var H_AUDIT_ID      = ['Audit ID', 'AuditId', 'auditId'];
var H_COMPANY       = ['Company', 'Company name', 'Company Name'];
var H_LOCATION      = ['Location', 'Site', 'Plant'];
var H_SCOPES        = ['Scopes', 'Scope', 'Audit scopes', 'Audit Scopes', 'Scopes JSON', 'Scopes_JSON', 'AuditScopes', 'Standards', 'Standard', 'Schemes', 'Scheme', 'Requested scopes', 'Requested Scopes'];
var H_SCOPES_LIST   = ['Scopes_List','Scopes list','Scope list','ScopesList','Scopes list (AN)','Scopes_List (AN)'];
var H_PREASSIGNED_AUDITOR = ['Preassigned Auditor', 'Preassigned auditor', 'Preassigned'];
var H_ASSIGNED_TO   = ['Assigned to', 'Assigned', 'Assigned Auditor', 'Assigned auditor', 'Assigned To'];

var H_STATUS        = ['Status'];
var H_ASSIGNED      = ['Assigned', 'Assigned auditor', 'Assigned Auditor', 'Assigned to', 'Assigned To'];
var H_DATE_PLANNED  = ['Date - Planned', 'Planned date', 'Planned Date', 'Date Planned'];
var H_DATE_APPROVED = ['Date - Approved', 'Approved date', 'Approved Date', 'Date Approved'];
var H_ALLOW_SELF    = ['Allow self planning', 'Allow Self Planning'];
var H_PLANNING_JSON = ['Planning JSON', 'PlanningJson'];
var H_DAYS_TEXT     = ['Audit days textual', 'Audit days text', 'Audit Days Textual'];
var H_TOTAL_HOURS_S = ['Total time in hours','Total audit time in hours','Total hours','Required hours'];
var H_HOURS_PLANNED = ['Hours planned','Planned hours','Hours Planned'];
var H_EXTENSION     = ['Extension applied', 'Extension Applied'];
var H_WILL_EXPIRE_Y = ['Date - Will Expire'];
var H_EXTENDED_EXPIRE_Z = ['Extende Expiration Date','Extended Expiration Date','Extended Expiry Date'];

// Optional decision log columns (AJ/AK in most deployments)
var H_LAST_DECISION    = ['Last manager decision', 'Last Manager Decision'];
var H_LAST_DECISION_TS = ['Last decision timestamp', 'Last Decision Timestamp'];

// B) Status since (AL)
var H_STATUS_SINCE      = ['Status since', 'Status Since', 'Status since (ts)', 'Status Since (ts)'];
