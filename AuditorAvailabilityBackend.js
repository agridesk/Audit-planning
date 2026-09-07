/**
 * AuditorAvailabilityBackend_FINAL_FIX_20260413
 * FINAL FIX VERSION
 * Purpose:
 * - Exact headers only
 * - Correct per-day priority aggregation across multiple rows
 * - Supports 2 audit slots
 * - Keeps existing standalone function names compatible with current HTML
 */

/* =========================
 * CONFIG
 * ========================= */
var AV_DIAG_BUILD = '20260517_D1_DIAGNOSTIC_AV_CACHE_PATH';
var AV_DIAG_USE_CACHE = true;
var AV_EXEC_SS_CACHE = null;
var AV_EXEC_TZ_CACHE = null;

function AV_diagLog_(tag, payload) {
  try {
    payload = payload || {};
    payload.tag = tag;
    payload.serverTs = new Date().toISOString();
    Logger.log('[' + tag + '] ' + JSON.stringify(payload));
  } catch (e) {
    try { Logger.log('[' + tag + ']'); } catch (_e) {}
  }
}

/* =========================
 * CENTRAL CACHE BRIDGE — PHASE 1
 * Read-only/month/meta cache only. No mutation/business-rule changes.
 * ========================= */
function AV_auditCacheAvailable_() {
  return {
    object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
    get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
    put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
    remove: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function'),
    removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
  };
}

function AV_centralCacheNs_() {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && AUDIT_CACHE.NS && AUDIT_CACHE.NS.AVAILABILITY) {
      return AUDIT_CACHE.NS.AVAILABILITY;
    }
  } catch (e) {}
  return 'availability';
}

function AV_centralCacheGet_(keyPart) {
  try {
    var parts = AV_parseMonthCacheKey_(keyPart);
    if (parts && typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.getAvailabilityMonth === 'function') {
      return AUDIT_CACHE.getAvailabilityMonth(parts.auditorEmail, parts.monthKey);
    }
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(AV_centralCacheNs_(), keyPart);
    }
  } catch (e) {}
  return null;
}

function AV_centralCachePut_(keyPart, value, ttlSeconds) {
  try {
    var parts = AV_parseMonthCacheKey_(keyPart);
    if (parts && typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.putAvailabilityMonth === 'function') {
      return AUDIT_CACHE.putAvailabilityMonth(parts.auditorEmail, parts.monthKey, value, ttlSeconds || 600);
    }
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      return AUDIT_CACHE.put(AV_centralCacheNs_(), keyPart, value, ttlSeconds || 600);
    }
  } catch (e) {}
  return false;
}

function AV_centralCacheRemove_(keyPart) {
  try {
    var parts = AV_parseMonthCacheKey_(keyPart);
    if (parts && typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAvailabilityMonth === 'function') {
      return AUDIT_CACHE.removeAvailabilityMonth(parts.auditorEmail, parts.monthKey);
    }
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function') {
      return AUDIT_CACHE.remove(AV_centralCacheNs_(), keyPart);
    }
  } catch (e) {}
  return false;
}

function AV_centralCacheRemoveNamespace_() {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      return AUDIT_CACHE.removeNamespace(AV_centralCacheNs_());
    }
  } catch (e) {}
  return 0;
}


/* =========================
 * SSOT
 * ========================= */
function AV_getSs_() {
  if (AV_EXEC_SS_CACHE) return AV_EXEC_SS_CACHE;
  var id = '';
  try { id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim(); } catch (e) {}
  if (id) {
    AV_EXEC_SS_CACHE = SpreadsheetApp.openById(id);
    return AV_EXEC_SS_CACHE;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    AV_EXEC_SS_CACHE = ss;
    return AV_EXEC_SS_CACHE;
  }
  throw new Error('SSOT spreadsheet not configured. Set Script Property V5_SSOT_SPREADSHEET_ID');
}

function AV_getTz_() {
  if (AV_EXEC_TZ_CACHE) return AV_EXEC_TZ_CACHE;
  try {
    var ss = AV_getSs_();
    if (ss && ss.getSpreadsheetTimeZone) {
      AV_EXEC_TZ_CACHE = ss.getSpreadsheetTimeZone();
      return AV_EXEC_TZ_CACHE;
    }
  } catch (e) {}
  AV_EXEC_TZ_CACHE = Session.getScriptTimeZone();
  return AV_EXEC_TZ_CACHE;
}

/* =========================
 * BASIC HELPERS
 * ========================= */
function AV_pad2_(n) { return String(n).padStart(2, '0'); }

function AV_fmtYMD_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, AV_getTz_(), 'yyyy-MM-dd');
}

function AV_parseDate_(v) {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  var s = String(v || '').trim();
  if (!s) return null;

  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function AV_timeToMinutes_(v) {
  if (v == null || v === '') return NaN;
  if (v instanceof Date && !isNaN(v.getTime())) return v.getHours() * 60 + v.getMinutes();
  var s = String(v || '').trim();
  if (!s) return NaN;
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return NaN;
}

function AV_normTimeHHMM_(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, AV_getTz_(), 'HH:mm');
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, AV_getTz_(), 'HH:mm');
  return s;
}

function AV_normEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

function AV_normText_(v) {
  return String(v || '').trim();
}

function AV_normAvailableCell_(v) {
  if (v === false) return 'NO';
  if (v === true) return 'YES';
  var s = AV_normText_(v).toUpperCase();
  if (!s) return '';
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === '0' || s === 'UNAVAILABLE' || s === 'NOT AVAILABLE' || s === 'NIET BESCHIKBAAR') return 'NO';
  if (s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'AVAILABLE' || s === 'BESCHIKBAAR') return 'YES';
  return s;
}

function AV_isDefaultSoftStatus_(v) {
  var s = String(v || '').trim().toUpperCase();
  return s === 'DEFAULT_AUDITOR_BLOCKED_SOFT' || s === 'DEFAULT_WEEKEND_SOFT';
}

function AV_isSystemDefault_(v) {
  return String(v || '').trim().toUpperCase() === 'SYSTEM_DEFAULT';
}

function AV_isManualSoftStatus_(v) {
  var s = String(v || '').trim().toUpperCase();
  return s === 'MANUAL_AUDITOR_BLOCKED_SOFT' || s === 'USER_MANUAL' || s === 'MANUAL_SOFT' || s === 'MANUAL_UNAVAILABLE_SOFT';
}

function AV_isSoftStatus_(v) {
  return AV_isDefaultSoftStatus_(v) || AV_isSystemDefault_(v) || AV_isManualSoftStatus_(v);
}

function AV_isManagerPlanned_(v) {
  var s = String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return s === 'MANAGER PLANNED' || (s.indexOf('MANAGER') >= 0 && s.indexOf('PLAN') >= 0);
}

function AV_isNonDefaultHardStatus_(v) {
  var s = String(v || '').trim();
  if (!s) return false;
  if (AV_isSoftStatus_(s)) return false;
  return true;
}

function AV_monthBounds_(monthKey) {
  var m = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error('Invalid monthKey: ' + monthKey);
  var y = Number(m[1]), mo = Number(m[2]);
  var start = new Date(y, mo - 1, 1);
  var end = new Date(y, mo, 0);
  return { startISO: AV_fmtYMD_(start), endISO: AV_fmtYMD_(end) };
}

/* =========================
 * HEADERS (EXACT)
 * ========================= */
function AV_exactHeaderIndexes_(headers) {
  function idx(name) { return headers.indexOf(name); }
  var map = {
    date: idx('Date'),
    auditorEmail: idx('Auditor_Email'),
    available: idx('Available'),
    firstStart: idx('First_Audit_Start_Time'),
    firstEnd: idx('First_Audit_End_Time'),
    auditId1: idx('Audit_ID_1'),
    secondStart: idx('Second_Audit_Start_Time'),
    secondEnd: idx('Second_Audit_End_Time'),
    auditId2: idx('Audit_ID_2'),
    status1: idx('Status_1'),
    status2: idx('Status_2'),
    lastUpdated: idx('Last_Updated')
  };
  return map;
}

function AV_assertHeaders_(idx) {
  var req = ['date','auditorEmail','available','firstStart','firstEnd','auditId1','secondStart','secondEnd','auditId2','status1','status2'];
  var missing = [];
  for (var i = 0; i < req.length; i++) {
    if (idx[req[i]] < 0) missing.push(req[i]);
  }
  if (missing.length) throw new Error('Missing exact headers in "Auditor Availability": ' + missing.join(', '));
}

/* =========================
 * CORE CLASSIFIER
 * ========================= */
function AV_classifyRow_(row, idx, rowNumber) {
  var auditId1 = AV_normText_(row[idx.auditId1]);
  var auditId2 = AV_normText_(row[idx.auditId2]);
  var status1 = AV_normText_(row[idx.status1]);
  var status2 = AV_normText_(row[idx.status2]);
  var from1 = AV_normTimeHHMM_(row[idx.firstStart]);
  var to1 = AV_normTimeHHMM_(row[idx.firstEnd]);
  var from2 = AV_normTimeHHMM_(row[idx.secondStart]);
  var to2 = AV_normTimeHHMM_(row[idx.secondEnd]);
  var availableRaw = AV_normAvailableCell_(row[idx.available]);

  var slot1HasTime = !!(from1 || to1);
  var slot2HasTime = !!(from2 || to2);

  var slot1Soft = AV_isSoftStatus_(status1) || (AV_isSoftStatus_(status2) && slot1HasTime && !status1);
  var slot2Soft = AV_isSoftStatus_(status2) || (AV_isSoftStatus_(status1) && slot2HasTime && !status2);

  var slot1Hard = (!!auditId1) || AV_isManagerPlanned_(status1) || AV_isNonDefaultHardStatus_(status1);
  var slot2Hard = (!!auditId2) || AV_isManagerPlanned_(status2) || AV_isNonDefaultHardStatus_(status2);

  if (!slot1Hard && slot1HasTime && availableRaw === 'NO' && !slot1Soft && !slot2Soft && !status1 && !status2) {
    slot1Hard = true;
  }
  if (!slot2Hard && slot2HasTime && availableRaw === 'NO' && !slot1Soft && !slot2Soft && !status1 && !status2) {
    slot2Hard = true;
  }

  var anyHard = slot1Hard || slot2Hard;
  var anySoft = !anyHard && (slot1Soft || slot2Soft);

  var out = {
    rowNumber: rowNumber,
    auditId1: auditId1,
    auditId2: auditId2,
    status1: status1,
    status2: status2,
    from1: from1,
    to1: to1,
    from2: from2,
    to2: to2,
    availableRaw: availableRaw,
    slot1Hard: slot1Hard,
    slot2Hard: slot2Hard,
    slot1Soft: slot1Soft,
    slot2Soft: slot2Soft,
    anyHard: anyHard,
    anySoft: anySoft,
    finalStatus: '',
    readonly: false,
    from: '',
    to: '',
    auditFrom: '',
    auditTo: '',
    intervals: [],
    decisionReason: ''
  };

  if (slot1Hard) {
    out.intervals.push({ slot: 1, kind: 'hard', auditId: auditId1, status: status1, start: from1, end: to1 });
  }
  if (slot2Hard) {
    out.intervals.push({ slot: 2, kind: 'hard', auditId: auditId2, status: status2, start: from2, end: to2 });
  }

  if (anyHard) {
    out.finalStatus = 'hard';
    out.readonly = true;
    out.decisionReason = 'HARD because slot1Hard=' + slot1Hard + ' slot2Hard=' + slot2Hard + ' status1=' + status1 + ' status2=' + status2 + ' available=' + availableRaw;

    if (slot1Hard && slot2Hard) {
      out.auditFrom = from1 || from2 || '';
      out.auditTo = to2 || to1 || '';
      out.from = '';
      out.to = '';
    } else if (slot1Hard) {
      out.auditFrom = from1 || '';
      out.auditTo = to1 || '';
      out.from = from1 || '';
      out.to = to1 || '';
    } else if (slot2Hard) {
      out.auditFrom = from2 || '';
      out.auditTo = to2 || '';
      out.from = from2 || '';
      out.to = to2 || '';
    }
    return out;
  }

  if (anySoft) {
    out.finalStatus = 'soft';
    out.readonly = false;
    out.decisionReason = 'SOFT because default/manual/system-default unavailable status detected';
    if (slot1Soft) {
      out.from = from1 || '';
      out.to = to1 || '';
      if (slot1HasTime) out.intervals.push({ slot: 1, kind: 'soft', auditId: '', status: status1 || status2, start: from1, end: to1 });
    } else if (slot2Soft) {
      out.from = from2 || '';
      out.to = to2 || '';
      if (slot2HasTime) out.intervals.push({ slot: 2, kind: 'soft', auditId: '', status: status2 || status1, start: from2, end: to2 });
    }
    return out;
  }

  out.finalStatus = availableRaw === 'NO' ? 'hard' : 'available';
  out.readonly = availableRaw === 'NO';
  out.decisionReason = out.finalStatus === 'hard'
    ? 'HARD fallback because row matched, Available=NO, and status was non-default/empty-but-blocking'
    : 'AVAILABLE because row matched but no hard/soft blocking semantics detected';
  if (out.finalStatus === 'hard') {
    if (slot1HasTime) {
      out.from = from1 || '';
      out.to = to1 || '';
      out.auditFrom = from1 || '';
      out.auditTo = to1 || '';
      out.intervals.push({ slot: 1, kind: 'hard', auditId: auditId1, status: status1, start: from1, end: to1 });
    } else if (slot2HasTime) {
      out.from = from2 || '';
      out.to = to2 || '';
      out.auditFrom = from2 || '';
      out.auditTo = to2 || '';
      out.intervals.push({ slot: 2, kind: 'hard', auditId: auditId2, status: status2, start: from2, end: to2 });
    }
  }
  return out;
}


function AV_getColumnValues_(sh, rowStart, colIndexZeroBased, numRows) {
  if (!sh || numRows <= 0 || colIndexZeroBased < 0) return [];
  return sh.getRange(rowStart, colIndexZeroBased + 1, numRows, 1).getValues();
}

function AV_compressRowNumbers_(rowNumbers) {
  var out = [];
  if (!rowNumbers || !rowNumbers.length) return out;
  rowNumbers = rowNumbers.slice().sort(function(a, b){ return a - b; });
  var start = rowNumbers[0];
  var prev = rowNumbers[0];
  for (var i = 1; i < rowNumbers.length; i++) {
    var n = rowNumbers[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push({ start: start, count: prev - start + 1 });
    start = n;
    prev = n;
  }
  out.push({ start: start, count: prev - start + 1 });
  return out;
}


function AV_monthCacheKey_(auditorEmail, monthKey) {
  return 'AV_MONTH|' + AV_normEmail_(auditorEmail) + '|' + AV_normText_(monthKey);
}

function AV_parseMonthCacheKey_(keyPart) {
  var s = AV_normText_(keyPart);
  var m = s.match(/^AV_MONTH\|([^|]+)\|(\d{4}-\d{2})$/);
  if (!m) return null;
  return { auditorEmail: AV_normEmail_(m[1]), monthKey: AV_normText_(m[2]) };
}

function AV_getMonthCache_(auditorEmail, monthKey) {
  if (AV_DIAG_USE_CACHE !== true) return null;
  var key = AV_monthCacheKey_(auditorEmail, monthKey);

  var central = AV_centralCacheGet_(key);
  if (central && central.success === true) {
    try {
      central.debug = central.debug || {};
      central.debug.cacheService = 'AUDIT_CACHE';
    } catch (e0) {}
    return central;
  }

  try {
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (obj && obj.success === true) {
      try {
        obj.debug = obj.debug || {};
        obj.debug.cacheService = 'CacheServiceFallback';
      } catch (e1) {}
      return obj;
    }
  } catch(e) {}
  return null;
}

function AV_compactMonthCachePayload_(obj) {
  obj = obj || {};
  var timing = (obj.debug && obj.debug.timing) ? obj.debug.timing : {};
  return {
    success: obj.success === true,
    marker: obj.marker || 'AV_DIAG_JSON_OK',
    build: obj.build || AV_DIAG_BUILD,
    auditorEmail: AV_normEmail_(obj.auditorEmail),
    monthKey: AV_normText_(obj.monthKey),
    days: obj.days || {},
    blockedWeekdaysCsv: AV_normText_(obj.blockedWeekdaysCsv),
    debug: {
      build: (obj.debug && obj.debug.build) || AV_DIAG_BUILD,
      serverMs: obj.debug && obj.debug.serverMs || timing.serverMs || 0,
      sourceMode: obj.debug && obj.debug.sourceMode || '',
      timing: {
        totalMs: timing.totalMs || 0,
        serverMs: obj.debug && obj.debug.serverMs || timing.serverMs || 0,
        readSheetMs: timing.readSheetMs || 0,
        loopMs: timing.loopMs || 0,
        matchedRows: obj.debug && obj.debug.matchedRows || 0,
        matchedEmailRows: timing.matchedEmailRows || 0,
        cacheHit: false,
        lite: true
      }
    }
  };
}

function AV_setMonthCache_(auditorEmail, monthKey, obj) {
  if (AV_DIAG_USE_CACHE !== true) return;
  var key = AV_monthCacheKey_(auditorEmail, monthKey);
  var compact = AV_compactMonthCachePayload_(obj);

  var putOk = AV_centralCachePut_(key, compact, 600);
  if (putOk) return;

  try { CacheService.getScriptCache().put(key, JSON.stringify(compact), 600); } catch(e) {}
}

function AV_clearMonthCache_(auditorEmail, monthKey) {
  try {
    if (!auditorEmail) return;
    if (monthKey) {
      var key = AV_monthCacheKey_(auditorEmail, monthKey);
      AV_centralCacheRemove_(key);
      try { CacheService.getScriptCache().remove(key); } catch (e1) {}
      try {
        if (typeof TDM_invalidateAvailabilityMonthCache === 'function') {
          TDM_invalidateAvailabilityMonthCache(auditorEmail, monthKey, { lite: true });
        }
      } catch (eTdm) {
        Logger.log('[AV][R6] Toolkit direct-month cache invalidate failed: ' + eTdm);
      }
      return;
    }

    var keys = [];
    var emailNorm = AV_normEmail_(auditorEmail);
    var now = new Date();
    for (var delta = -24; delta <= 24; delta++) {
      var d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
      var mk = Utilities.formatDate(d, AV_getTz_(), 'yyyy-MM');
      keys.push(AV_monthCacheKey_(emailNorm, mk));
      try {
        if (typeof TDM_invalidateAvailabilityMonthCache === 'function') {
          TDM_invalidateAvailabilityMonthCache(emailNorm, mk, { lite: true });
        }
      } catch (eTdmAll) {
        Logger.log('[AV][R6] Toolkit direct-month cache invalidate failed for ' + mk + ': ' + eTdmAll);
      }
    }

    for (var i = 0; i < keys.length; i++) AV_centralCacheRemove_(keys[i]);
    try { CacheService.getScriptCache().removeAll(keys); } catch (e2) {}
  } catch(e) {}
}

/* =========================
 * MONTH JSON
 * ========================= */

function AV_findAuditorRowNumbersFast_(sh, auditorEmail, idxAuditorEmail) {
  var out = [];
  auditorEmail = AV_normEmail_(auditorEmail);
  if (!sh || !auditorEmail || idxAuditorEmail < 0) return out;
  try {
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return out;
    var rg = sh.getRange(2, idxAuditorEmail + 1, lastRow - 1, 1);
    var finder = rg.createTextFinder(auditorEmail).matchEntireCell(true);
    var hits = finder.findAll() || [];
    for (var i = 0; i < hits.length; i++) {
      var row = hits[i] && hits[i].getRow ? hits[i].getRow() : 0;
      if (row >= 2) out.push(row);
    }
  } catch(e) {}
  if (!out.length) return out;
  out.sort(function(a, b){ return a - b; });
  var uniq = [];
  for (var j = 0; j < out.length; j++) {
    if (!uniq.length || uniq[uniq.length - 1] !== out[j]) uniq.push(out[j]);
  }
  return uniq;
}

function AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh) {
  var t0 = new Date().getTime();
  forceFresh = (forceFresh === true || String(forceFresh || "").toLowerCase() === "true" || String(forceFresh || "") === "1");
  var tNorm = 0, tSs = 0, tRead = 0, tHeaders = 0, tLoop = 0, tBlocked = 0;
  var liteMode = true;

  auditorEmail = AV_normEmail_(auditorEmail);
  monthKey = AV_normText_(monthKey);
  tNorm = new Date().getTime();

  if (!auditorEmail) return { success:false, reason:'MISSING_EMAIL' };
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { success:false, reason:'INVALID_MONTHKEY', monthKey:monthKey };

  var cached = forceFresh ? null : AV_getMonthCache_(auditorEmail, monthKey);
  if (cached && cached.success === true) {
    try {
      cached.debug = cached.debug || {};
      cached.debug.timing = cached.debug.timing || {};
      cached.debug.timing.cacheHit = true;
      cached.debug.serverMs = new Date().getTime() - t0;
      cached.debug.sourceMode = cached.debug.cacheService || 'SERVER_CACHE';
      cached.debug.timing.serverMs = cached.debug.serverMs;
      AV_diagLog_('AV_CACHE_PATH', {
        auditorEmail: auditorEmail,
        monthKey: monthKey,
        serverCacheHit: true,
        sourceMode: cached.debug.sourceMode,
        serverMs: cached.debug.serverMs,
        forceFresh: forceFresh
      });
    } catch(e){}
    return cached;
  }

  var tSs0 = new Date().getTime();
  var ss = AV_getSs_();
  var sh = ss.getSheetByName('Auditor Availability');
  tSs = new Date().getTime();
  if (!sh) return { success:false, reason:'MISSING_SHEET', sheet:'Auditor Availability' };

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return {
      success:true,
      auditorEmail:auditorEmail,
      monthKey:monthKey,
      days:{},
      blockedWeekdaysCsv:'',
      debug:{
        build:AV_DIAG_BUILD,
        trace:[],
        dayMap:{},
        timing:{
          forceFresh: forceFresh,
          totalMs:(new Date().getTime()-t0),
          normalizeMs:(tNorm-t0),
          openSheetMs:(tSs-tSs0),
          readSheetMs:0,
          headersMs:0,
          loopMs:0,
          blockedWeekdaysMs:0,
          matchedEmailRows:0
        }
      }
    };
  }

  var tRead0 = new Date().getTime();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(x){ return String(x || '').trim(); });
  var idx = AV_exactHeaderIndexes_(headers);
  AV_assertHeaders_(idx);

  var numDataRows = lastRow - 1;
  var matchedRowNumbers = AV_findAuditorRowNumbersFast_(sh, auditorEmail, idx.auditorEmail);
  if (!matchedRowNumbers.length) {
    var emailCol = AV_getColumnValues_(sh, 2, idx.auditorEmail, numDataRows);
    for (var i = 0; i < emailCol.length; i++) {
      if (AV_normEmail_(emailCol[i][0]) === auditorEmail) matchedRowNumbers.push(i + 2);
    }
  }

  var blocks = AV_compressRowNumbers_(matchedRowNumbers);
  var values = [headers];
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    var blockValues = sh.getRange(block.start, 1, block.count, lastCol).getValues();
    for (var j = 0; j < blockValues.length; j++) values.push(blockValues[j]);
  }
  tRead = new Date().getTime();

  if (!values || values.length < 2) {
    var tBlockedEmpty0 = new Date().getTime();
    var blockedWeekdaysCsvEmpty = AV_getBlockedWeekdaysCsv_(auditorEmail);
    tBlocked = new Date().getTime();
    var emptyMonthResult = {
      success:true,
      marker:'AV_DIAG_JSON_OK',
      build:AV_DIAG_BUILD,
      auditorEmail:auditorEmail,
      monthKey:monthKey,
      days:{},
      blockedWeekdaysCsv:blockedWeekdaysCsvEmpty,
      debug:{
        headers:headers,
        headerIndexes:idx,
        monthBounds: AV_monthBounds_(monthKey),
        matchedRows:0,
        trace:[],
        dayMap:{},
        timing:{
          forceFresh: forceFresh,
          totalMs:(new Date().getTime()-t0),
          normalizeMs:(tNorm-t0),
          openSheetMs:(tSs-tSs0),
          readSheetMs:(tRead-tRead0),
          headersMs:0,
          loopMs:0,
          blockedWeekdaysMs:(tBlocked-tBlockedEmpty0),
          matchedEmailRows:matchedRowNumbers.length,
          cacheHit:false,
          forceFresh: forceFresh,
          emptyMonth:true
        }
      }
    };
    try {
      emptyMonthResult.debug = emptyMonthResult.debug || {};
      emptyMonthResult.debug.serverMs = new Date().getTime() - t0;
      emptyMonthResult.debug.sourceMode = 'SERVER_LIVE_BUILD_EMPTY';
      emptyMonthResult.debug.timing = emptyMonthResult.debug.timing || {};
      emptyMonthResult.debug.timing.serverMs = emptyMonthResult.debug.serverMs;
      emptyMonthResult.debug.timing.cacheHit = false;
      AV_diagLog_('AV_CACHE_PATH', {
        auditorEmail: auditorEmail,
        monthKey: monthKey,
        serverCacheHit: false,
        sourceMode: emptyMonthResult.debug.sourceMode,
        serverMs: emptyMonthResult.debug.serverMs,
        forceFresh: forceFresh,
        matchedRows: 0,
        matchedEmailRows: matchedRowNumbers.length
      });
    } catch(eDiagEmpty) {}
    var emptyLiteResult = AV_compactMonthCachePayload_(emptyMonthResult);
    try {
      emptyLiteResult.debug = emptyLiteResult.debug || {};
      emptyLiteResult.debug.serverMs = emptyMonthResult.debug.serverMs || (new Date().getTime() - t0);
      emptyLiteResult.debug.sourceMode = 'SERVER_LIVE_BUILD_EMPTY';
      emptyLiteResult.debug.timing = emptyLiteResult.debug.timing || {};
      emptyLiteResult.debug.timing.serverMs = emptyLiteResult.debug.serverMs;
      emptyLiteResult.debug.timing.cacheHit = false;
    } catch(eDiagEmptyLite) {}
    AV_setMonthCache_(auditorEmail, monthKey, emptyLiteResult);
    return emptyLiteResult;
  }

  var tHead0 = new Date().getTime();
  var bounds = AV_monthBounds_(monthKey);
  var startISO = bounds.startISO, endISO = bounds.endISO;
  tHeaders = new Date().getTime();

  var days = {};
  var trace = [];
  var dayMap = {};
  var matchedRows = 0;

  var tLoop0 = new Date().getTime();
  for (var r = 1; r < values.length; r++) {
    var row = values[r];

    var sourceRowNumber = (blocks.length ? matchedRowNumbers[r - 1] : (r + 1));

    var rawEmail = row[idx.auditorEmail];
    var normEmail = AV_normEmail_(rawEmail);
    var rawDate = row[idx.date];
    var parsedDate = AV_parseDate_(rawDate);
    var iso = parsedDate ? AV_fmtYMD_(parsedDate) : '';

    var rowInfo = {
      rowNumber: sourceRowNumber,
      rawDate: String(rawDate),
      parsedISO: iso,
      rawAuditorEmail: String(rawEmail),
      normAuditorEmail: normEmail,
      targetAuditorEmail: auditorEmail,
      emailMatch: normEmail === auditorEmail,
      inMonthRange: !!(iso && iso >= startISO && iso <= endISO),
      auditId1: AV_normText_(row[idx.auditId1]),
      auditId2: AV_normText_(row[idx.auditId2]),
      status1: AV_normText_(row[idx.status1]),
      status2: AV_normText_(row[idx.status2]),
      from1: AV_normText_(row[idx.firstStart]),
      to1: AV_normText_(row[idx.firstEnd]),
      from2: AV_normText_(row[idx.secondStart]),
      to2: AV_normText_(row[idx.secondEnd]),
      include: false,
      skipReason: '',
      finalStatus: '',
      overwrite: false
    };

    if (normEmail !== auditorEmail) {
      rowInfo.skipReason = 'EMAIL_MISMATCH';
      if (!liteMode) trace.push(rowInfo);
      continue;
    }

    if (!iso) {
      rowInfo.skipReason = 'DATE_PARSE_FAILED';
      if (!liteMode) trace.push(rowInfo);
      continue;
    }

    if (!(iso >= startISO && iso <= endISO)) {
      rowInfo.skipReason = 'OUTSIDE_MONTH_RANGE';
      if (!liteMode) trace.push(rowInfo);
      continue;
    }

    matchedRows++;

    var cls = AV_classifyRow_(row, idx, sourceRowNumber);

    rowInfo.include = true;
    rowInfo.finalStatus = cls.finalStatus;

    var newObj = {
      date: iso,
      status: cls.finalStatus,
      readonly: cls.readonly,
      rowNumber: sourceRowNumber,
      availableRaw: cls.availableRaw,
      from: cls.from,
      to: cls.to,
      auditFrom: cls.auditFrom,
      auditTo: cls.auditTo,
      intervals: cls.intervals,
      status1: cls.status1,
      status2: cls.status2,
      auditId1: cls.auditId1,
      auditId2: cls.auditId2,
      decisionReason: cls.decisionReason
    };

    var existing = days[iso];
    var replace = false;
    var replaceReason = '';

    function rankStatus_(s) {
      s = String(s || '').toLowerCase();
      if (s === 'hard') return 3;
      if (s === 'soft' || s === 'blocked') return 2;
      return 1;
    }

    if (!existing) {
      replace = true;
      replaceReason = 'FIRST_ENTRY_FOR_DAY';
    } else {
      var oldRank = rankStatus_(existing.status);
      var newRank = rankStatus_(newObj.status);
      if (newRank > oldRank) {
        replace = true;
        replaceReason = 'HIGHER_PRIORITY_STATUS';
      } else if (newRank < oldRank) {
        replace = false;
        replaceReason = 'LOWER_PRIORITY_STATUS';
      } else {
        var oldHasAuditId = !!(existing.auditId1 || existing.auditId2);
        var newHasAuditId = !!(newObj.auditId1 || newObj.auditId2);
        if (newHasAuditId && !oldHasAuditId) {
          replace = true;
          replaceReason = 'SAME_PRIORITY_BUT_NEW_HAS_AUDIT_ID';
        } else {
          replace = false;
          replaceReason = 'SAME_PRIORITY_KEEP_EXISTING';
        }
      }
      rowInfo.overwrite = replace;
      rowInfo.skipReason = replace ? 'REPLACED_PREVIOUS_DAY_ENTRY:' + replaceReason : 'KEPT_PREVIOUS_DAY_ENTRY:' + replaceReason;
    }

    if (replace) {
      days[iso] = newObj;
      if (!liteMode) dayMap[iso] = {
        chosenRow: sourceRowNumber,
        chosenStatus: cls.finalStatus,
        chosenReason: cls.decisionReason + ' | ' + replaceReason,
        auditId1: cls.auditId1,
        auditId2: cls.auditId2,
        status1: cls.status1,
        status2: cls.status2,
        intervals: cls.intervals
      };
    }

    if (!liteMode) trace.push(rowInfo);
  }
  tLoop = new Date().getTime();

  var tBlocked0 = new Date().getTime();
  var blockedWeekdaysCsv = AV_getBlockedWeekdaysCsv_(auditorEmail);
  tBlocked = new Date().getTime();

  var result = {
    success: true,
    marker: 'AV_DIAG_JSON_OK',
    build: AV_DIAG_BUILD,
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    days: days,
    blockedWeekdaysCsv: blockedWeekdaysCsv,
    debug: {
      headers: headers,
      headerIndexes: idx,
      monthBounds: { startISO:startISO, endISO:endISO },
      matchedRows: matchedRows,
      trace: trace,
      dayMap: dayMap,
      timing: {
        totalMs: (new Date().getTime() - t0),
        normalizeMs: (tNorm - t0),
        openSheetMs: (tSs - tSs0),
        readSheetMs: (tRead - tRead0),
        headersMs: (tHeaders - tHead0),
        loopMs: (tLoop - tLoop0),
        blockedWeekdaysMs: (tBlocked - tBlocked0),
        matchedEmailRows: matchedRowNumbers.length,
        cacheHit: false,
        forceFresh: forceFresh
      }
    }
  };
  try {
    result.debug = result.debug || {};
    result.debug.serverMs = new Date().getTime() - t0;
    result.debug.sourceMode = 'SERVER_LIVE_BUILD';
    result.debug.timing = result.debug.timing || {};
    result.debug.timing.serverMs = result.debug.serverMs;
    result.debug.timing.cacheHit = false;
    AV_diagLog_('AV_CACHE_PATH', {
      auditorEmail: auditorEmail,
      monthKey: monthKey,
      serverCacheHit: false,
      sourceMode: result.debug.sourceMode,
      serverMs: result.debug.serverMs,
      forceFresh: forceFresh,
      matchedRows: matchedRows,
      matchedEmailRows: matchedRowNumbers.length
    });
  } catch(eDiagLive) {}
  var liteResult = AV_compactMonthCachePayload_(result);
  try {
    liteResult.debug = liteResult.debug || {};
    liteResult.debug.serverMs = result.debug && result.debug.serverMs ? result.debug.serverMs : (new Date().getTime() - t0);
    liteResult.debug.sourceMode = 'SERVER_LIVE_BUILD';
    liteResult.debug.timing = liteResult.debug.timing || {};
    liteResult.debug.timing.serverMs = liteResult.debug.serverMs;
    liteResult.debug.timing.cacheHit = false;
  } catch(eDiagLite) {}
  AV_setMonthCache_(auditorEmail, monthKey, liteResult);
  return liteResult;
}

function AV_getAvailabilityMonthLiteJSON(auditorEmail, monthKey, forceFresh) {
  return AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh);
}

function AV5_getAvailabilityMonthLiteJSON(auditorEmail, monthKey, forceFresh) {
  return AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh);
}

function AV5_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh) {
  return AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh);
}

function AV5_getAvailabilityMonthJSON_(auditorEmail, monthKey, forceFresh) {
  return AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh);
}

function AV_getAvailabilityMonthJSON_(auditorEmail, monthKey, forceFresh) {
  return AV_getAvailabilityMonthJSON(auditorEmail, monthKey, forceFresh);
}

var AV_BLOCKED_WEEKDAYS_CACHE = {};

/* =========================
 * AUDITORS DEFAULT WEEKDAYS
 * ========================= */
function AV_getBlockedWeekdaysCsv_(auditorEmail) {
  auditorEmail = AV_normEmail_(auditorEmail);
  if (AV_BLOCKED_WEEKDAYS_CACHE.hasOwnProperty(auditorEmail)) return AV_BLOCKED_WEEKDAYS_CACHE[auditorEmail];
  try {
    var ss = AV_getSs_();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return '';
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return '';

    var headers = values[0].map(function(x){ return String(x || '').trim(); });
    var idxEmail = headers.indexOf('Email');
    if (idxEmail < 0) idxEmail = headers.indexOf('E-mail');
    if (idxEmail < 0) return '';

    var idxBlocked = headers.indexOf('Unavailable weekdays');
    if (idxBlocked < 0) idxBlocked = headers.indexOf('Blocked weekdays');
    if (idxBlocked < 0) idxBlocked = headers.indexOf('Default unavailable weekdays');
    if (idxBlocked < 0) return '';

    for (var r = 1; r < values.length; r++) {
      var em = AV_normEmail_(values[r][idxEmail]);
      if (em === auditorEmail) { AV_BLOCKED_WEEKDAYS_CACHE[auditorEmail] = AV_normText_(values[r][idxBlocked]); return AV_BLOCKED_WEEKDAYS_CACHE[auditorEmail]; }
    }
  } catch (e) {}
  AV_BLOCKED_WEEKDAYS_CACHE[auditorEmail] = '';
  return '';
}


function AV_setBlockedWeekdaysCsv_(auditorEmail, weekdaysCsv) {
  auditorEmail = AV_normEmail_(auditorEmail);
  weekdaysCsv = AV_normText_(weekdaysCsv);
  try {
    var ss = AV_getSs_();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return false;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return false;

    var headers = values[0].map(function(x){ return String(x || '').trim(); });
    var idxEmail = headers.indexOf('E-mail');
    if (idxEmail < 0) idxEmail = headers.indexOf('Email');
    var idxBlocked = headers.indexOf('Blocked weekdays');
    if (idxBlocked < 0) idxBlocked = headers.indexOf('Unavailable weekdays');
    if (idxBlocked < 0) idxBlocked = headers.indexOf('Default unavailable weekdays');
    if (idxEmail < 0 || idxBlocked < 0) return false;

    for (var r = 1; r < values.length; r++) {
      if (AV_normEmail_(values[r][idxEmail]) === auditorEmail) {
        sh.getRange(r + 1, idxBlocked + 1).setValue(weekdaysCsv);
        AV_BLOCKED_WEEKDAYS_CACHE[auditorEmail] = weekdaysCsv;
        return true;
      }
    }
  } catch (e) {}
  return false;
}


function AV_findHeaderIndexByAliases_(headers, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var target = String(aliases[i] || '').trim().toLowerCase();
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c] || '').trim().toLowerCase() === target) return c;
    }
  }
  return -1;
}

function AV_getAuditMetaCacheKey_(auditId) {
  return 'AV_AUDIT_META|' + AV_normText_(auditId);
}

function AV_getAuditMetaCache_(auditId) {
  var key = AV_getAuditMetaCacheKey_(auditId);

  var central = AV_centralCacheGet_(key);
  if (central && typeof central === 'object') return central;

  try {
    var raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

function AV_setAuditMetaCache_(auditId, obj) {
  var key = AV_getAuditMetaCacheKey_(auditId);
  if (AV_centralCachePut_(key, obj || {}, 21600)) return;
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(obj || {}), 21600);
  } catch (e) {}
}

function AV_findAuditMetaInWorkbook_(auditId) {
  auditId = AV_normText_(auditId);
  if (!auditId) return null;

  var cached = AV_getAuditMetaCache_(auditId);
  if (cached) return cached;

  var ss = AV_getSs_();
  var sheets = ss.getSheets();

  var auditIdAliases = ['Audit_ID', 'Audit ID', 'AuditID', 'Audit Id', 'ID'];
  var companyAliases = ['Company', 'Company name', 'Company_Name', 'Client', 'Client name', 'Customer', 'Customer name', 'Bedrijf'];
  var scopesAliases = ['Scopes', 'Scope', 'Scope(s)', 'Selected scopes', 'Schema', 'Schemas'];

  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    var name = String(sh.getName() || '').trim();
    if (!name) continue;
    if (name === 'Auditor Availability' || name === 'Auditors') continue;

    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) continue;

    var headerRowIndex = -1;
    var idxAudit = -1, idxCompany = -1, idxScopes = -1;

    var maxHeaderScan = Math.min(values.length, 5);
    for (var r = 0; r < maxHeaderScan; r++) {
      var headers = values[r].map(function(x){ return String(x || '').trim(); });
      idxAudit = AV_findHeaderIndexByAliases_(headers, auditIdAliases);
      if (idxAudit < 0) continue;
      idxCompany = AV_findHeaderIndexByAliases_(headers, companyAliases);
      idxScopes = AV_findHeaderIndexByAliases_(headers, scopesAliases);
      headerRowIndex = r;
      break;
    }
    if (headerRowIndex < 0 || idxAudit < 0) continue;

    for (var r2 = headerRowIndex + 1; r2 < values.length; r2++) {
      var row = values[r2];
      if (AV_normText_(row[idxAudit]) !== auditId) continue;
      var meta = {
        auditId: auditId,
        company: idxCompany >= 0 ? AV_normText_(row[idxCompany]) : '',
        scopes: idxScopes >= 0 ? AV_normText_(row[idxScopes]) : '',
        sheet: name,
        rowNumber: r2 + 1
      };
      AV_setAuditMetaCache_(auditId, meta);
      return meta;
    }
  }

  var miss = { auditId: auditId, company: '', scopes: '', sheet: '', rowNumber: 0 };
  AV_setAuditMetaCache_(auditId, miss);
  return miss;
}

function AV_getAuditMetaMapStandalone(req) {
  req = req || {};
  var ids = Array.isArray(req.auditIds) ? req.auditIds : [];
  var out = {};
  for (var i = 0; i < ids.length; i++) {
    var auditId = AV_normText_(ids[i]);
    if (!auditId) continue;
    out[auditId] = AV_findAuditMetaInWorkbook_(auditId);
  }
  return { success: true, auditMeta: out };
}

function AV5_getAuditMetaMapStandalone(req) { return AV_getAuditMetaMapStandalone(req); }

/* =========================
 * NOTE
 * ========================= */
// Legacy global standalone aliases are centralized in AvailabilityService.gs.
// This backend remains read/model/month-JSON only.


/* =========================
 * CENTRAL CACHE DIAGNOSTICS — PHASE 1
 * ========================= */
function AV_cacheBridgePickTestAuditorEmail_() {
  try {
    var active = AV_normEmail_(Session.getActiveUser().getEmail());
    if (active) return active;
  } catch (e0) {}
  try {
    var ss = AV_getSs_();
    var sh = ss.getSheetByName('Auditors');
    if (!sh) return '';
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return '';
    var headers = values[0].map(function(x){ return String(x || '').trim(); });
    var idxEmail = headers.indexOf('Email');
    if (idxEmail < 0) idxEmail = headers.indexOf('E-mail');
    if (idxEmail < 0) return '';
    for (var r = 1; r < values.length; r++) {
      var email = AV_normEmail_(values[r][idxEmail]);
      if (email) return email;
    }
  } catch (e1) {}
  return '';
}

function RUN_AV_CACHE_BRIDGE_CLEAR_READONLY() {
  var out = {
    ok: true,
    service: 'Auditor Availability central cache bridge v3 compact empty-month cache',
    cleared: {
      availabilityNamespace: 0,
      nativeAvailabilityMonths: 0
    },
    auditCacheAvailable: AV_auditCacheAvailable_(),
    timestamp: new Date().toISOString()
  };

  try {
    out.cleared.availabilityNamespace = AV_centralCacheRemoveNamespace_();
  } catch (e1) {
    out.ok = false;
    out.error = String(e1 && e1.message ? e1.message : e1);
  }

  try {
    var email = AV_cacheBridgePickTestAuditorEmail_();
    if (email) {
      var keys = [];
      var now = new Date();
      for (var delta = -24; delta <= 24; delta++) {
        var d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
        var mk = Utilities.formatDate(d, AV_getTz_(), 'yyyy-MM');
        keys.push(AV_monthCacheKey_(email, mk));
      }
      CacheService.getScriptCache().removeAll(keys);
      out.cleared.nativeAvailabilityMonths = keys.length;
    }
  } catch (e2) {}

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_AV_CACHE_BRIDGE_HIT_TEST() {
  var started = new Date().getTime();
  var email = AV_cacheBridgePickTestAuditorEmail_();
  var monthKey = Utilities.formatDate(new Date(), AV_getTz_(), 'yyyy-MM');

  var out = {
    ok: true,
    service: 'Auditor Availability central cache bridge v3 compact empty-month cache',
    auditorEmail: email,
    monthKey: monthKey,
    auditCacheAvailable: AV_auditCacheAvailable_(),
    checks: {},
    errors: [],
    timestamp: new Date().toISOString()
  };

  function AV_diagCheck_(name, fn) {
    var t0 = new Date().getTime();
    try {
      var summary = fn();
      out.checks[name] = {
        ok: true,
        durationMs: new Date().getTime() - t0,
        summary: summary || {}
      };
    } catch (e) {
      out.ok = false;
      out.checks[name] = {
        ok: false,
        durationMs: new Date().getTime() - t0,
        error: String(e && e.message ? e.message : e)
      };
      out.errors.push({ check: name, error: String(e && e.message ? e.message : e) });
    }
  }

  AV_diagCheck_('centralCacheRoundtrip', function () {
    var key = 'diag:roundtrip:' + String(new Date().getTime());
    var payload = { marker: 'ok', ts: new Date().toISOString() };
    var putOk = AV_centralCachePut_(key, payload, 60);
    var hit = AV_centralCacheGet_(key);
    return {
      putOk: putOk,
      hit: !!(hit && hit.marker === 'ok'),
      marker: hit && hit.marker ? hit.marker : '',
      cacheService: putOk ? 'AUDIT_CACHE' : 'fallback/unavailable'
    };
  });

  AV_diagCheck_('monthCacheFirst', function () {
    if (!email) return { skipped: true, reason: 'No test auditor email found' };
    AV_clearMonthCache_(email, monthKey);
    var res = AV_getAvailabilityMonthJSON(email, monthKey);
    return {
      success: !!(res && res.success === true),
      daysCount: res && res.days ? Object.keys(res.days).length : 0,
      cacheHit: !!(res && res.debug && res.debug.timing && res.debug.timing.cacheHit),
      cacheService: res && res.debug && res.debug.cacheService ? res.debug.cacheService : ''
    };
  });

  AV_diagCheck_('monthCacheSecond', function () {
    if (!email) return { skipped: true, reason: 'No test auditor email found' };
    var res = AV_getAvailabilityMonthJSON(email, monthKey);
    return {
      success: !!(res && res.success === true),
      daysCount: res && res.days ? Object.keys(res.days).length : 0,
      cacheHit: !!(res && res.debug && res.debug.timing && res.debug.timing.cacheHit),
      cacheService: res && res.debug && res.debug.cacheService ? res.debug.cacheService : '',
      timingTotalMs: res && res.debug && res.debug.timing ? res.debug.timing.totalMs : ''
    };
  });

  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
