// BUILD: AuditPlanningRowIndexCache_d16_AMS01_EXEC_ROW_REUSE_20260908
// =====================================================================
// PURPOSE
//   Targeted single-row fetch for the 'Audit planning' sheet.
//   AMS-01 d16 adds a true execution-local row payload tier so repeated
//   reads of the same audit within one transaction do not call Sheets again.
// =====================================================================

var MP_AP_INDEX_BUILD     = 'AuditPlanningRowIndexCache_d16_AMS01_EXEC_ROW_REUSE_20260908';
var MP_AP_INDEX_NS        = 'mp_audit_planning_index';
var MP_AP_INDEX_KEY       = 'ap_row_index_v1';
var MP_AP_INDEX_TTL_SEC   = 1500;
var MP_AP_INDEX_EXEC_KEY  = 'AP_ROW_INDEX_V1';
var MP_AP_ROW_EXEC_PREFIX = 'AP_ROW_PAYLOAD::';

var MP_AP_ROW_NS          = 'MP_AP_ROW_V1';
var MP_AP_ROW_TTL_SEC     = 1500;
var MP_AP_ROW_GEN_KEY     = 'MP_AP_ROW_GEN_V1';
var MP_AP_ROW_WARM_CAP    = 200;

function __mp_apRowGen_() {
  try {
    var v = CacheService.getScriptCache().get(MP_AP_ROW_GEN_KEY);
    if (v) return String(v);
    CacheService.getScriptCache().put(MP_AP_ROW_GEN_KEY, '1', 21600);
    return '1';
  } catch (e) { return '0'; }
}

function __mp_apRowGenBump_() {
  try {
    var cur = parseInt(CacheService.getScriptCache().get(MP_AP_ROW_GEN_KEY) || '1', 10);
    var nxt = String(isFinite(cur) ? cur + 1 : 1);
    CacheService.getScriptCache().put(MP_AP_ROW_GEN_KEY, nxt, 21600);
    return nxt;
  } catch (e) { return null; }
}

function __mp_apRowCacheKey_(auditId) {
  return MP_AP_ROW_NS + '::G' + __mp_apRowGen_() + '::' + String(auditId || '').trim();
}

function __mp_apRowCacheGet_(auditId) {
  try {
    var raw = CacheService.getScriptCache().get(__mp_apRowCacheKey_(auditId));
    if (!raw) return null;
    var p = JSON.parse(raw);
    return (p && p.row && p.hdr) ? p : null;
  } catch (e) { return null; }
}

function __mp_apRowCachePut_(auditId, hdr, row, rowNumber, lastCol) {
  try {
    var json = JSON.stringify({ hdr: hdr, row: row, rowNumber: rowNumber, lastCol: lastCol });
    if (json.length <= 95000) {
      CacheService.getScriptCache().put(__mp_apRowCacheKey_(auditId), json, MP_AP_ROW_TTL_SEC);
      return true;
    }
  } catch (e) {}
  return false;
}

function __mp_apExecRowKey_(auditId) {
  return MP_AP_ROW_EXEC_PREFIX + String(auditId || '').trim();
}

function __mp_apExecRowGet_(auditId) {
  try {
    if (typeof __MP_EXEC_CACHE !== 'object' || !__MP_EXEC_CACHE) return null;
    var p = __MP_EXEC_CACHE[__mp_apExecRowKey_(auditId)];
    return (p && p.row && p.hdr && p.rowNumber) ? p : null;
  } catch (e) { return null; }
}

function __mp_apExecRowPut_(auditId, hdr, row, rowNumber, lastCol) {
  try {
    if (typeof __MP_EXEC_CACHE !== 'object' || !__MP_EXEC_CACHE) return false;
    __MP_EXEC_CACHE[__mp_apExecRowKey_(auditId)] = {
      hdr: (hdr || []).slice(),
      row: (row || []).slice(),
      rowNumber: Number(rowNumber || 0),
      lastCol: Number(lastCol || (hdr || []).length || 0)
    };
    return true;
  } catch (e) { return false; }
}

function __mp_apExecRowsClear_() {
  try {
    if (typeof __MP_EXEC_CACHE !== 'object' || !__MP_EXEC_CACHE) return;
    var keys = Object.keys(__MP_EXEC_CACHE);
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).indexOf(MP_AP_ROW_EXEC_PREFIX) === 0) delete __MP_EXEC_CACHE[keys[i]];
    }
  } catch (e) {}
}

function __mp_findAuditIdCol_(hdr) {
  for (var i = 0; i < (hdr || []).length; i++) {
    var h = String(hdr[i] || '').trim().toLowerCase();
    if (h === 'audit id' || h === 'audit_id' || h === 'auditid') return i;
  }
  return -1;
}

function __mp_readAuditPlanningIndexPersist_() {
  try {
    if (typeof __mp_auditCacheGet_ === 'function') {
      var v = __mp_auditCacheGet_(MP_AP_INDEX_NS, MP_AP_INDEX_KEY);
      if (v && v.hdr && v.index) return v;
    }
  } catch (e) {
    Logger.log('[AP_INDEX_DIAG] persist read err=' + (e && e.message || e));
  }
  return null;
}

function __mp_writeAuditPlanningIndexPersist_(payload, ttlSec) {
  try {
    if (typeof __mp_auditCachePut_ === 'function') {
      return __mp_auditCachePut_(MP_AP_INDEX_NS, MP_AP_INDEX_KEY, payload, ttlSec || MP_AP_INDEX_TTL_SEC);
    }
  } catch (e) {
    Logger.log('[AP_INDEX_OVERFLOW] put err=' + (e && e.message || e));
  }
  return false;
}

function __mp_getAuditPlanningRow_(ss, auditId) {
  var t0 = Date.now();
  var key = String(auditId || '').trim();
  if (!key) return null;
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) {
    Logger.log('[AP_INDEX_FAIL] sheet "Audit planning" not found');
    return null;
  }

  // Tier 0: true execution-local row payload. This is authoritative only
  // within the current execution and is cleared by canonical invalidation.
  var execRowPayload = __mp_apExecRowGet_(key);
  if (execRowPayload) {
    Logger.log('[AP_INDEX_DIAG] tier=EXEC_ROW ms=' + (Date.now() - t0));
    return {
      sh: sh,
      hdr: execRowPayload.hdr || [],
      row: (execRowPayload.row || []).slice(),
      rowNumber: execRowPayload.rowNumber || 0,
      indexFromCache: true,
      execRowHit: true
    };
  }

  // Tier 1: per-audit CacheService row payload BEFORE index-only execution tier.
  // The previous order caused an unnecessary getRange whenever an execution
  // index was present, even though the exact row payload was already cached.
  var rowCached = __mp_apRowCacheGet_(key);
  if (rowCached && rowCached.row) {
    __mp_apExecRowPut_(key, rowCached.hdr || [], rowCached.row, rowCached.rowNumber || 0, rowCached.lastCol || (rowCached.hdr || []).length);
    Logger.log('[AP_INDEX_DIAG] tier=ROW_CACHE_d16 cols=' + (rowCached.row.length || 0) + ' ms=' + (Date.now() - t0));
    return { sh: sh, hdr: rowCached.hdr || [], row: rowCached.row, rowNumber: rowCached.rowNumber || 0, indexFromCache: true };
  }

  // Tier 1.5: execution-local index. A sheet row read is required only when
  // neither execution-row nor CacheService row payload exists.
  if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE && __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY]) {
    var execPack = __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];
    var execRowNum = execPack.index && execPack.index[key];
    if (execRowNum && execPack.lastCol > 0) {
      var execRow = sh.getRange(execRowNum, 1, 1, execPack.lastCol).getValues()[0] || [];
      __mp_apExecRowPut_(key, execPack.hdr || [], execRow, execRowNum, execPack.lastCol);
      __mp_apRowCachePut_(key, execPack.hdr || [], execRow, execRowNum, execPack.lastCol);
      Logger.log('[AP_INDEX_DIAG] tier=EXEC_INDEX_ROW_READ count=' + execPack.count + ' ms=' + (Date.now() - t0));
      return { sh: sh, hdr: execPack.hdr || [], row: execRow, rowNumber: execRowNum, indexFromCache: true };
    }
  }

  // Tier 2: persisted index.
  var parsed = __mp_readAuditPlanningIndexPersist_();
  if (parsed && parsed.index && parsed.lastCol > 0) {
    var rowNum = parsed.index[key];
    if (rowNum) {
      var hotPack = {
        hdr: parsed.hdr || [],
        index: parsed.index,
        count: parsed.count || 0,
        lastRow: parsed.lastRow || 0,
        lastCol: parsed.lastCol
      };
      if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
        __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY] = hotPack;
      }
      var hotRow = sh.getRange(rowNum, 1, 1, parsed.lastCol).getValues()[0] || [];
      __mp_apExecRowPut_(key, hotPack.hdr || [], hotRow, rowNum, parsed.lastCol);
      __mp_apRowCachePut_(key, hotPack.hdr || [], hotRow, rowNum, parsed.lastCol);
      Logger.log('[AP_INDEX_DIAG] tier=PERSIST_HIT count=' + hotPack.count + ' ms=' + (Date.now() - t0));
      return { sh: sh, hdr: hotPack.hdr, row: hotRow, rowNumber: rowNum, indexFromCache: true };
    }
    Logger.log('[AP_INDEX_DIAG] tier=PERSIST_HIT_BUT_MISS auditId=' + key + ' (rebuilding)');
  }

  // Tier 3: cold rebuild.
  var data = sh.getDataRange().getValues() || [];
  var hdr = (data.length > 0) ? (data[0] || []) : [];
  var colAI = __mp_findAuditIdCol_(hdr);
  if (colAI < 0) {
    Logger.log('[AP_INDEX_FAIL] no Audit ID column; aborting cold build');
    return null;
  }
  var index = {};
  var count = 0;
  var targetRow = null;
  var targetRowNum = -1;
  for (var r = 1; r < data.length; r++) {
    var rowAi = String(data[r][colAI] || '').trim();
    if (!rowAi) continue;
    var sheetRowNum = r + 1;
    index[rowAi] = sheetRowNum;
    count++;
    if (rowAi === key) {
      targetRow = data[r];
      targetRowNum = sheetRowNum;
    }
  }
  var lastCol = hdr.length;

  __mp_writeAuditPlanningIndexPersist_({
    hdr: hdr, index: index, count: count,
    lastRow: data.length, lastCol: lastCol
  }, MP_AP_INDEX_TTL_SEC);
  if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
    __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY] = {
      hdr: hdr, index: index, count: count,
      lastRow: data.length, lastCol: lastCol
    };
  }

  if (targetRow) {
    __mp_apExecRowPut_(key, hdr, targetRow, targetRowNum, lastCol);
    __mp_apRowCachePut_(key, hdr, targetRow, targetRowNum, lastCol);
  }

  Logger.log('[AP_INDEX_DIAG] tier=COLD_BUILD count=' + count + ' ms=' + (Date.now() - t0));
  if (!targetRow) return null;
  return { sh: sh, hdr: hdr, row: targetRow, rowNumber: targetRowNum, indexFromCache: false };
}

function __mp_invalidateAuditPlanningPack_() {
  try { __mp_apRowGenBump_(); } catch (e0) {}
  try { if (typeof _mp_pwGenBump_ === 'function') _mp_pwGenBump_(); } catch (e0b) {}
  try {
    CacheService.getScriptCache().remove('MP_PERSIST::' + MP_AP_INDEX_NS + '::' + MP_AP_INDEX_KEY);
  } catch (e1) {}
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE) {
      if (typeof AUDIT_CACHE.remove === 'function') {
        try { AUDIT_CACHE.remove(MP_AP_INDEX_NS, MP_AP_INDEX_KEY); }
        catch (e2a) { AUDIT_CACHE.remove(MP_AP_INDEX_NS + '::' + MP_AP_INDEX_KEY); }
      }
    }
  } catch (e2) {}
  try {
    if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
      delete __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];
      __mp_apExecRowsClear_();
    }
  } catch (e3) {}
  Logger.log('[' + MP_AP_INDEX_BUILD + '] invalidated');
}

function __mp_warmAuditPlanningRowIndex_(ss) {
  var t0 = Date.now();
  try {
    if (!ss) ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return { ok: false, error: 'sheet not found', ms: Date.now() - t0 };

    try {
      CacheService.getScriptCache().remove('MP_PERSIST::' + MP_AP_INDEX_NS + '::' + MP_AP_INDEX_KEY);
    } catch (eRm) {}
    try {
      if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
        delete __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];
        __mp_apExecRowsClear_();
      }
    } catch (eRm2) {}

    var data = sh.getDataRange().getValues() || [];
    var hdr = (data.length > 0) ? (data[0] || []) : [];
    var colAI = __mp_findAuditIdCol_(hdr);
    if (colAI < 0) {
      Logger.log('[' + MP_AP_INDEX_BUILD + '] warm SKIPPED: no Audit ID column');
      return { ok: false, error: 'no Audit ID column', ms: Date.now() - t0 };
    }
    var index = {};
    var count = 0;
    var rowsWritten = 0;
    for (var r = 1; r < data.length; r++) {
      var v = String(data[r][colAI] || '').trim();
      if (!v) continue;
      index[v] = r + 1;
      count++;
      if (rowsWritten < MP_AP_ROW_WARM_CAP) {
        if (__mp_apRowCachePut_(v, hdr, data[r], r + 1, hdr.length)) rowsWritten++;
      }
    }
    var ok = __mp_writeAuditPlanningIndexPersist_({
      hdr: hdr, index: index, count: count,
      lastRow: data.length, lastCol: hdr.length
    }, MP_AP_INDEX_TTL_SEC);
    if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
      __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY] = {
        hdr: hdr, index: index, count: count,
        lastRow: data.length, lastCol: hdr.length
      };
    }
    return { ok: !!ok, count: count, ms: Date.now() - t0 };
  } catch (e) {
    Logger.log('[' + MP_AP_INDEX_BUILD + '] warm FAIL: ' + (e && e.message || e));
    return { ok: false, error: String(e && e.message || e), ms: Date.now() - t0 };
  }
}
