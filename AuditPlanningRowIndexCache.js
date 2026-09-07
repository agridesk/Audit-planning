// BUILD: AuditPlanningRowIndexCache_d12 (2026-05-03)
// =====================================================================
// PURPOSE
//   Targeted single-row fetch for the 'Audit planning' sheet, replacing
//   the full-sheet read in getToolkitOpenFastV5's readAuditPlanning stage.
//
// WHY
//   AP sheet payload (~3000 rows × 92 cols, ~1MB JSON) cannot fit in the
//   90KB CacheService cap, so __mp_getSheetDataPersistCached_ always
//   falls through to COLD_SHEET_READ (~250-1100ms wall-time per cold open).
//   See ManagerPlanningBackend_CORE_SPLIT.js δ10 note (~line 4942).
//
// DESIGN (D2-light, additive only — no behaviour changes elsewhere)
//   COLD path  : 1× getDataRange().getValues() — same cost as legacy.
//                Builds index { auditId -> rowNumber } from the data array
//                AND returns the target row from that same array. Persists
//                only the index + hdr (~50KB JSON, fits 90KB cap).
//                NO regression vs legacy — same 1 sheet read.
//
//   WARM path  : index loaded from CacheService → 1× getRange(rowNumber,...)
//                for the single target row. ~80-150ms wall-time.
//
// FAILURE SEMANTICS (fail-loud, per AGENT_CONSTITUTION)
//   - Missing Audit ID column → return null + Logger.log [AP_INDEX_FAIL].
//   - Cache put overflow      → Logger.log [AP_INDEX_OVERFLOW]. Caller
//                               still receives a valid pack from the live
//                               build (just no persist for next call).
//   - Persist read corrupt    → falls through to fresh build, logs reason.
//
// INVALIDATION
//   __mp_invalidateAuditPlanningPack_() is the canonical hook already
//   called by CoreStatusMachine.js:607 and AuditPlanningEngine.js:413
//   (both via `typeof === 'function'` existence checks). Defining it
//   here means existing save paths invalidate this cache automatically;
//   no edits needed in CoreStatusMachine, AuditPlanningEngine, etc.
//
// DEPLOY DIAGNOSTIC
//   When d12 is live, getToolkitOpenFastV5 emits stage labels:
//     - 'readAuditPlanning_d12'        on cold open
//     - 'readAuditPlanning_d12[CACHE]' on warm open
//   Stage label still 'readAuditPlanning' (no _d12) ⇒ d12 NOT deployed.
// =====================================================================

var MP_AP_INDEX_BUILD     = 'AuditPlanningRowIndexCache_d15_CANONICAL_INVALIDATION_OWNER_20260514';
var MP_AP_INDEX_NS        = 'mp_audit_planning_index';
var MP_AP_INDEX_KEY       = 'ap_row_index_v1';
var MP_AP_INDEX_TTL_SEC   = 1500;
var MP_AP_INDEX_EXEC_KEY  = 'AP_ROW_INDEX_V1';

// d14: per-audit row payload cache (eliminates getRange in tier 2 hit path).
// Generation-keyed so invalidation is O(1) (bump gen, old keys orphan via TTL).
var MP_AP_ROW_NS          = 'MP_AP_ROW_V1';
var MP_AP_ROW_TTL_SEC     = 1500;
var MP_AP_ROW_GEN_KEY     = 'MP_AP_ROW_GEN_V1';
var MP_AP_ROW_WARM_CAP    = 200; // warmer-path: write at most N rows to limit cache pressure

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

function __mp_findAuditIdCol_(hdr) {
  for (var i = 0; i < (hdr || []).length; i++) {
    var h = String(hdr[i] || '').trim().toLowerCase();
    if (h === 'audit id' || h === 'audit_id' || h === 'auditid') return i;
  }
  return -1;
}

/**
 * Read persist cache (index + hdr only). Returns parsed object or null.
 */
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

/**
 * Persist write. Logs overflow + returns boolean.
 */
function __mp_writeAuditPlanningIndexPersist_(payload, ttlSec) {
  try {
    if (typeof __mp_auditCachePut_ === 'function') {
      return __mp_auditCachePut_(MP_AP_INDEX_NS, MP_AP_INDEX_KEY,
                                 payload, ttlSec || MP_AP_INDEX_TTL_SEC);
    }
  } catch (e) {
    Logger.log('[AP_INDEX_OVERFLOW] put err=' + (e && e.message || e));
  }
  return false;
}

/**
 * Targeted single-row fetch.
 *
 * Returns { sh, hdr, row, rowNumber, indexFromCache } or null when not found.
 *
 * COLD path: single getDataRange (same as legacy), builds + persists index,
 *            returns target row directly from the read data — no second
 *            getRange call. Cost ≤ legacy.
 *
 * WARM path: persist hit → single getRange for target row only.
 */
function __mp_getAuditPlanningRow_(ss, auditId) {
  var t0 = Date.now();
  var key = String(auditId || '').trim();
  if (!key) return null;
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) {
    Logger.log('[AP_INDEX_FAIL] sheet "Audit planning" not found');
    return null;
  }

  // ---- Tier 1: per-execution cache (cheapest) ----
  if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE && __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY]) {
    var execPack = __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];
    var execRowNum = execPack.index && execPack.index[key];
    if (execRowNum && execPack.lastCol > 0) {
      var execRow = sh.getRange(execRowNum, 1, 1, execPack.lastCol).getValues()[0] || [];
      Logger.log('[AP_INDEX_DIAG] tier=EXEC count=' + execPack.count + ' ms=' + (Date.now() - t0));
      return { sh: sh, hdr: execPack.hdr || [], row: execRow, rowNumber: execRowNum, indexFromCache: true };
    }
  }

  // ---- Tier 1.5 (d14): per-audit row payload cache — skips getRange entirely ----
  var rowCached = __mp_apRowCacheGet_(key);
  if (rowCached && rowCached.row) {
    Logger.log('[AP_INDEX_DIAG] tier=ROW_CACHE_d14 cols=' + (rowCached.row.length || 0) + ' ms=' + (Date.now() - t0));
    return { sh: sh, hdr: rowCached.hdr || [], row: rowCached.row, rowNumber: rowCached.rowNumber || 0, indexFromCache: true };
  }

  // ---- Tier 2: persist cache (CacheService / AUDIT_CACHE) ----
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
      // d14: populate per-audit row cache for next call (skips getRange next time)
      __mp_apRowCachePut_(key, hotPack.hdr || [], hotRow, rowNum, parsed.lastCol);
      Logger.log('[AP_INDEX_DIAG] tier=PERSIST_HIT count=' + hotPack.count + ' ms=' + (Date.now() - t0));
      return { sh: sh, hdr: hotPack.hdr, row: hotRow, rowNumber: rowNum, indexFromCache: true };
    }
    // Index hit but auditId not in index → fresh row was added since last
    // persist write. Fall through to cold rebuild so the new row lands.
    Logger.log('[AP_INDEX_DIAG] tier=PERSIST_HIT_BUT_MISS auditId=' + key + ' (rebuilding)');
  }

  // ---- Tier 3: COLD rebuild ----
  // SINGLE getDataRange().getValues() — identical cost to legacy path.
  // Build index AND extract target row from the same data array, so the
  // cold path makes ZERO extra sheet reads vs legacy.
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
    var sheetRowNum = r + 1; // header=1, data starts at row 2
    index[rowAi] = sheetRowNum;
    count++;
    if (rowAi === key) {
      targetRow = data[r];
      targetRowNum = sheetRowNum;
    }
  }
  var lastCol = hdr.length;

  // Persist + exec cache
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

  // d14: also persist target row in per-audit cache for sub-ms next read.
  if (targetRow) __mp_apRowCachePut_(key, hdr, targetRow, targetRowNum, lastCol);

  Logger.log('[AP_INDEX_DIAG] tier=COLD_BUILD count=' + count + ' ms=' + (Date.now() - t0));
  if (!targetRow) return null;
  return { sh: sh, hdr: hdr, row: targetRow, rowNumber: targetRowNum, indexFromCache: false };
}

/**
 * Canonical invalidation hook.
 * Already called via `typeof === 'function'` checks by:
 *   - CoreStatusMachine.js:607
 *   - AuditPlanningEngine.js:413
 * Defining it here means save paths automatically invalidate the index.
 */
function __mp_invalidateAuditPlanningPack_() {
  // d14: bump row-cache generation (orphans all per-audit row keys).
  try { __mp_apRowGenBump_(); } catch (e0) {}
  // d14: bump planning-window generation (orphans all per-audit window keys).
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
    }
  } catch (e3) {}
  Logger.log('[' + MP_AP_INDEX_BUILD + '] invalidated');
}

/**
 * Warmer-callable: forces a fresh build + persist write so cold opens HIT.
 * Returns { ok, count, ms, error }.
 *
 * Uses the same single-getDataRange cold-build path — no extra reads.
 */
function __mp_warmAuditPlanningRowIndex_(ss) {
  var t0 = Date.now();
  try {
    if (!ss) ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit planning');
    if (!sh) return { ok: false, error: 'sheet not found', ms: Date.now() - t0 };

    // Force fresh build by clearing persist + exec first.
    try {
      CacheService.getScriptCache().remove('MP_PERSIST::' + MP_AP_INDEX_NS + '::' + MP_AP_INDEX_KEY);
    } catch (eRm) {}
    try {
      if (typeof __MP_EXEC_CACHE === 'object' && __MP_EXEC_CACHE) {
        delete __MP_EXEC_CACHE[MP_AP_INDEX_EXEC_KEY];
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
      // d14: pre-fill per-audit row cache (capped to bound CacheService pressure).
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
