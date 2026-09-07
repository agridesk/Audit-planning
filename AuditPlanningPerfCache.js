// BUILD: AuditPlanningPerfCache_20260425
// Extracted from ManagerPlanningV5Backend.js. No behavior changes.

// ===== PERFORMANCE LOGGING (SAFE) =====
function __perfStart(label){
  var t = new Date().getTime();
  Logger.log("[PERF-START] " + label);
  return t;
}
function __perfEnd(label, t){
  var d = new Date().getTime() - t;
  Logger.log("[PERF-END] " + label + ": " + d + "ms");
}
// ===== END PERFORMANCE LOGGING =====

/**
 * Exec-scope cache (per request) to prevent repeated full-sheet reads during grid building.
 * Governance-safe: does NOT change business logic; only reduces repeated I/O and repeated header scans.
 * Reset at start of each entry-point call.
 */
var __MP_EXEC_CACHE = {};
function __mp_resetExecCache_() { __MP_EXEC_CACHE = {}; }
function __mp_getSheetDataCached_(ss, sheetName) {
  var key = 'SHEET:' + sheetName;
  if (__MP_EXEC_CACHE[key]) return __MP_EXEC_CACHE[key];
  var sh = ss.getSheetByName(sheetName);
  if (!sh) {
    var miss = { sh:null, data:[], hdr:[] };
    __MP_EXEC_CACHE[key] = miss;
    return miss;
  }
  var data = sh.getDataRange().getValues();
  var hdr = (data && data.length) ? (data[0] || []) : [];
  var pack = { sh:sh, data:data || [], hdr:hdr };
  __MP_EXEC_CACHE[key] = pack;
  return pack;
}
function __mp_cacheNamespaceForSheet_(sheetName) {
  var n = String(sheetName || '').trim().toLowerCase();
  if (n === 'auditors') return 'mp_readonly_auditors_sheet';
  if (n === 'standards') return 'mp_readonly_standards_sheet';
  if (n === 'config_scopes') return 'config_scopes';
  if (n === 'companies') return 'mp_readonly_companies_sheet';
  if (n === 'log realized audits') return 'mp_readonly_log_realized_audits_sheet';
  return 'mp_readonly_sheet';
}
function __mp_cacheKeyForSheet_(sheetName) {
  return 'sheet::' + String(sheetName || '').trim();
}
function __mp_auditCacheGet_(namespace, key) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE) {
      var v;
      if (typeof AUDIT_CACHE.get === 'function') {
        try { v = AUDIT_CACHE.get(namespace, key); } catch(e1) { v = AUDIT_CACHE.get(namespace + '::' + key); }
      } else if (typeof AUDIT_CACHE.read === 'function') {
        try { v = AUDIT_CACHE.read(namespace, key); } catch(e2) { v = AUDIT_CACHE.read(namespace + '::' + key); }
      }
      if (v !== null && v !== undefined && v !== '') {
        return (typeof v === 'string') ? JSON.parse(v) : v;
      }
    }
  } catch(e) {}
  try {
    var raw = CacheService.getScriptCache().get('MP_PERSIST::' + namespace + '::' + key);
    return raw ? JSON.parse(raw) : null;
  } catch(e3) {}
  return null;
}
function __mp_auditCachePut_(namespace, key, value, ttlSec) {
  // δ5 (2026-05-03): fail-loud on EVERY failure path. Previously silent
  // size-overflow + catch-all masked the Companies cache MISS for weeks
  // (€200 burn root cause: warmer reported ok=true while put never landed).
  // Now: every failure surface logs with namespace, key, byte-size, reason.
  var payload;
  try {
    payload = JSON.stringify(value || {});
  } catch(eStr) {
    Logger.log('[CACHE_PUT_FAIL] ns=' + namespace + ' key=' + key +
               ' reason=stringify err=' + (eStr && eStr.message || eStr));
    return false;
  }
  if (payload.length >= 90 * 1024) {
    Logger.log('[CACHE_PUT_OVERFLOW] ns=' + namespace + ' key=' + key +
               ' bytes=' + payload.length + ' cap=92160 ' +
               '(use compute-result cache like MP_CC_V1 instead of raw-sheet cache)');
    return false;
  }
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE) {
      if (typeof AUDIT_CACHE.put === 'function') {
        try { AUDIT_CACHE.put(namespace, key, value, ttlSec || 300); return true; }
        catch(e1) { AUDIT_CACHE.put(namespace + '::' + key, value, ttlSec || 300); return true; }
      }
      if (typeof AUDIT_CACHE.set === 'function') {
        try { AUDIT_CACHE.set(namespace, key, value, ttlSec || 300); return true; }
        catch(e2) { AUDIT_CACHE.set(namespace + '::' + key, value, ttlSec || 300); return true; }
      }
    }
    CacheService.getScriptCache().put('MP_PERSIST::' + namespace + '::' + key, payload, ttlSec || 300);
    return true;
  } catch(e) {
    Logger.log('[CACHE_PUT_FAIL] ns=' + namespace + ' key=' + key +
               ' bytes=' + payload.length + ' err=' + (e && e.message || e));
  }
  return false;
}
function __mp_auditCacheRemoveSheet_(sheetName) {
  var ns = __mp_cacheNamespaceForSheet_(sheetName);
  var key = __mp_cacheKeyForSheet_(sheetName);
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE) {
      if (typeof AUDIT_CACHE.remove === 'function') {
        try { AUDIT_CACHE.remove(ns, key); } catch(e1) { AUDIT_CACHE.remove(ns + '::' + key); }
      }
      if (typeof AUDIT_CACHE.removeNamespace === 'function') {
        AUDIT_CACHE.removeNamespace(ns);
      }
    }
  } catch(e) {}
  try { CacheService.getScriptCache().remove('MP_PERSIST::' + ns + '::' + key); } catch(e2) {}
  try { CacheService.getScriptCache().remove('MP_PERSIST::' + sheetName); } catch(e3) {}
}
function __mp_getSheetDataPersistCached_(ss, sheetName, ttlSec) {
  // δC (2026-05-03): HIT/MISS instrumentation — Logger.log only, no behavior change.
  // Lets us prove whether warmer-written keys actually hit on cold open.
  var __dT0 = Date.now();
  var key = 'SHEET:' + sheetName;
  if (__MP_EXEC_CACHE[key]) {
    Logger.log('[PERSIST_DIAG] sheet=' + sheetName + ' tier=EXEC ms=' + (Date.now() - __dT0));
    return __MP_EXEC_CACHE[key];
  }

  var ns = __mp_cacheNamespaceForSheet_(sheetName);
  var cacheKey = __mp_cacheKeyForSheet_(sheetName);
  var parsed = __mp_auditCacheGet_(ns, cacheKey);
  if (parsed && parsed.data && parsed.hdr) {
    var pack0 = { sh: ss.getSheetByName(sheetName), data: parsed.data || [], hdr: parsed.hdr || [] };
    __MP_EXEC_CACHE[key] = pack0;
    Logger.log('[PERSIST_DIAG] sheet=' + sheetName + ' tier=PERSIST_HIT ns=' + ns +
               ' rows=' + (parsed.data.length) + ' ms=' + (Date.now() - __dT0));
    return pack0;
  }

  var pack = __mp_getSheetDataCached_(ss, sheetName);
  __mp_auditCachePut_(ns, cacheKey, { data: pack.data || [], hdr: pack.hdr || [] }, ttlSec || 300);
  Logger.log('[PERSIST_DIAG] sheet=' + sheetName + ' tier=COLD_SHEET_READ ns=' + ns +
             ' rows=' + ((pack.data || []).length) + ' ms=' + (Date.now() - __dT0));
  return pack;
}
function __mp_invalidatePersistCaches_(sheetNames) {
  var names = (sheetNames && sheetNames.length) ? sheetNames : ['Standards','Auditors','Companies','Config_Scopes'];
  for (var i = 0; i < names.length; i++) __mp_auditCacheRemoveSheet_(names[i]);
}
function __mp_getCached_(k, computeFn) {
  var key = 'OBJ:' + k;
  if (__MP_EXEC_CACHE.hasOwnProperty(key)) return __MP_EXEC_CACHE[key];
  var v = computeFn();
  __MP_EXEC_CACHE[key] = v;
  return v;
}

/**
 * PERF-PHASE1: lightweight lookup of Preassigned auditor for one auditId.
 * Replaces the full getPlanningContextV5() call inside saveManagerPlanning's
 * role-guard, which was wasteful (full context build + cache reset) just to
 * read one field. Uses the request-scoped cache so it's near-free if the
 * Audit planning sheet was already loaded earlier in the same execution.
 */
function __mp_getPreassignedAuditorForId_(auditId) {
  try {
    var ss = SpreadsheetApp.getActive();
    var pack = __mp_getSheetDataCached_(ss, 'Audit planning');
    var data = pack.data || [];
    var hdr  = pack.hdr  || [];
    if (data.length < 2 || !hdr.length) return '';
    var iId = -1, iPre = -1;
    for (var i = 0; i < hdr.length; i++) {
      var hLow = String(hdr[i]||'').trim().toLowerCase();
      if (iId < 0 && (hLow === 'audit id' || hLow === 'audit_id' || hLow === 'auditid')) iId = i;
      if (iPre < 0 && hLow.indexOf('pre') >= 0 && hLow.indexOf('auditor') >= 0) iPre = i;
    }
    if (iId < 0 || iPre < 0) return '';
    var target = String(auditId||'').trim();
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][iId]||'').trim() === target) {
        return String(data[r][iPre]||'').trim();
      }
    }
  } catch(e) {}
  return '';
}

