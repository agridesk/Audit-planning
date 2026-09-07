/**
 * CacheService.gs
 * Central cache layer for Audit Planning System.
 *
 * Purpose:
 * - central cache key ownership
 * - central TTL defaults
 * - JSON-safe get/put/remove/removeAll helpers
 * - namespace support
 * - forceRefresh support
 * - lightweight logging/diagnostics
 * - safe warmup helpers for read-only/shared data
 * - standard warmup excludes oversized full Companies table; use lightweight CompaniesIndexService
 *
 * Safety strategy:
 * - ADDITIVE ONLY
 * - does not replace existing local execution caches
 * - does not change planning/save/status/availability business logic
 * - intended first use: read-only/shared reference data only
 *
 * IMPORTANT:
 * This file intentionally does NOT define a global variable called CacheService,
 * because Google Apps Script already has a native CacheService object.
 */

var AUDIT_CACHE = (function () {
  var VERSION = '2026-04-27_001';
  var PREFIX = 'AUDIT';
  var REGISTRY_PROP_KEY = 'AUDIT_CACHE_REGISTRY_V1';
  var MAX_KEY_LENGTH = 240;
  var MAX_VALUE_CHARS_SAFE = 90000;

  // GATE F (2026-05-01): overflow sheet for oversized payloads.
  // Mirrors the chunked cell pattern used by MP_CalCache_Store.
  // Capacity = OVERFLOW_MAX_CELL_CHARS * OVERFLOW_MAX_CHUNKS = 180000 chars.
  // Covers manager_tools/RAS_PACK_V2 (~177068 chars) with headroom.
  var OVERFLOW_SHEET_NAME = 'AUDIT_CacheOverflow_Store';
  var OVERFLOW_MAX_CELL_CHARS = 45000;
  var OVERFLOW_MAX_CHUNKS = 4;
  var OVERFLOW_HEADER = ['key','namespace','keyPart','version','ttlSeconds','expiresAtMs','chunkCount','chunk1','chunk2','chunk3','chunk4','updatedAt'];

  var NS = {
    COMPANIES: 'companies',
    AUDITORS: 'auditors',
    AUDITOR_GRID: 'auditor_grid',
    CONFIG_SCOPES: 'config_scopes',
    NOTIFICATION_CONFIG: 'notification_config',
    NOTIFICATION_RULES: 'notification_rules',
    AVAILABILITY: 'availability',
    MANAGER: 'manager',
    MANAGER_TOOLS: 'manager_tools',
    PLANNING: 'planning',
    TOOLKIT_COMPANY: 'toolkit_company',
    DIAG: 'diag'
  };

  var TTL = {
    SHORT: 60,
    MEDIUM: 300,
    LONG: 1800,
    REFERENCE: 21600,
    READONLY: 21600,
    COMPANIES: 900,
    AUDITORS: 1800,
    AUDITOR_GRID: 60,
    CONFIG_SCOPES: 21600,
    NOTIFICATION_CONFIG: 1800,
    NOTIFICATION_RULES: 1800,
    AVAILABILITY_MONTH: 300,
    TOOLKIT_COMPANY: 900,
    DIAG: 60
  };

  var KEYS = {
    COMPANIES_ALL: 'companies:all',
    AUDITORS_ALL: 'auditors:all',
    AUDITOR_GRID_ACTIVE_PREFIX: 'auditor_grid:active:',
    AUDITOR_GRID_ARCHIVED_PREFIX: 'auditor_grid:archived:',
    CONFIG_SCOPES_ALL: 'config_scopes:all',
    NOTIFICATION_CONFIG_ALL: 'notification_config:all',
    NOTIFICATION_RULES_ALL: 'notification_rules:all',
    TOOLKIT_COMPANY_CONTEXT_PREFIX: 'toolkit_company_context:',
    AVAILABILITY_LITE_PREFIX: 'availability_lite:'
  };

  function scriptCache_() {
    return CacheService.getScriptCache();
  }

  function userCache_() {
    return CacheService.getUserCache();
  }

  function props_() {
    return PropertiesService.getScriptProperties();
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function safeString_(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function normalizeNs_(namespace) {
    var ns = safeString_(namespace || 'default').toLowerCase();
    ns = ns.replace(/[^a-z0-9_\-:.]/g, '_');
    return ns || 'default';
  }

  function normalizeKeyPart_(keyPart) {
    var key = safeString_(keyPart || 'key').toLowerCase();
    key = key.replace(/[^a-z0-9_\-:.|@]/g, '_');
    return key || 'key';
  }

  function makeKey(namespace, keyPart) {
    var raw = PREFIX + ':' + VERSION + ':' + normalizeNs_(namespace) + ':' + normalizeKeyPart_(keyPart);
    if (raw.length <= MAX_KEY_LENGTH) return raw;

    var digest = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)
    ).replace(/=/g, '').substring(0, 32);

    var head = PREFIX + ':' + VERSION + ':' + normalizeNs_(namespace) + ':';
    var allowed = Math.max(20, MAX_KEY_LENGTH - head.length - digest.length - 1);
    return head + normalizeKeyPart_(keyPart).substring(0, allowed) + ':' + digest;
  }

  function isForceRefresh_(options) {
    return !!(options && (options.forceRefresh === true || options.forceFresh === true || options.bypassCache === true));
  }

  function ttl_(ttlSeconds, fallbackSeconds) {
    var n = Number(ttlSeconds || fallbackSeconds || TTL.MEDIUM);
    if (!isFinite(n) || n <= 0) return TTL.MEDIUM;
    return Math.floor(n);
  }

  function wrap_(value) {
    return JSON.stringify({
      ok: true,
      createdAt: nowIso_(),
      version: VERSION,
      value: value
    });
  }

  function unwrap_(text) {
    if (!text) return null;
    try {
      var obj = JSON.parse(text);
      if (!obj || obj.ok !== true) return null;
      return obj.value;
    } catch (e) {
      log_('WARN', 'Cache JSON parse failed', { error: e && e.message ? e.message : String(e) });
      return null;
    }
  }

  function getCache_(scope) {
    return scope === 'user' ? userCache_() : scriptCache_();
  }

  function get(namespace, keyPart, options) {
    if (isForceRefresh_(options)) return null;
    var key = makeKey(namespace, keyPart);
    var raw = getCache_(options && options.scope).get(key);
    if (raw) {
      var v = unwrap_(raw);
      if (v !== null && v !== undefined) return v;
    }
    // GATE F: fallback to overflow sheet for oversized payloads
    if (!options || options.skipOverflow !== true) {
      try {
        var ofVal = overflowGet_(namespace, keyPart);
        if (ofVal !== null && ofVal !== undefined) return ofVal;
      } catch (e) {
        log_('WARN', 'Overflow get threw', { error: e && e.message ? e.message : String(e) });
      }
    }
    return null;
  }

  function put(namespace, keyPart, value, ttlSeconds, options) {
    var key = makeKey(namespace, keyPart);
    var text = wrap_(value);

    if (text.length > MAX_VALUE_CHARS_SAFE) {
      // GATE F: route oversized payloads to overflow sheet instead of dropping
      if (!options || options.skipOverflow !== true) {
        try {
          var ok = overflowPut_(namespace, keyPart, text, ttlSeconds);
          if (ok) {
            log_('INFO', 'Cache value too large; routed to overflow sheet', {
              namespace: namespace,
              keyPart: keyPart,
              chars: text.length
            });
            rememberKey_(namespace, keyPart, key, options);
            return true;
          }
        } catch (e) {
          log_('WARN', 'Overflow put threw', { error: e && e.message ? e.message : String(e) });
        }
      }
      log_('WARN', 'Cache value too large; skipped put', {
        namespace: namespace,
        keyPart: keyPart,
        chars: text.length
      });
      return false;
    }

    getCache_(options && options.scope).put(key, text, ttl_(ttlSeconds, TTL.MEDIUM));
    rememberKey_(namespace, keyPart, key, options);
    return true;
  }

  function remove(namespace, keyPart, options) {
    var key = makeKey(namespace, keyPart);
    getCache_(options && options.scope).remove(key);
    // GATE F: also remove from overflow sheet (silent on failure)
    try { overflowRemove_(namespace, keyPart); } catch (e) {}
    forgetKey_(namespace, keyPart, key);
    return true;
  }

  function getOrBuild(namespace, keyPart, builderFn, ttlSeconds, options) {
    if (typeof builderFn !== 'function') {
      throw new Error('AUDIT_CACHE.getOrBuild requires builderFn');
    }

    var cached = get(namespace, keyPart, options);
    if (cached !== null && cached !== undefined) return cached;

    var built = builderFn();
    put(namespace, keyPart, built, ttlSeconds, options);
    return built;
  }

  function registry_() {
    try {
      var raw = props_().getProperty(REGISTRY_PROP_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function saveRegistry_(reg) {
    try {
      props_().setProperty(REGISTRY_PROP_KEY, JSON.stringify(reg || {}));
    } catch (e) {
      log_('WARN', 'Cache registry save failed', { error: e && e.message ? e.message : String(e) });
    }
  }

  function rememberKey_(namespace, keyPart, fullKey, options) {
    if (options && options.noRegistry === true) return;

    var ns = normalizeNs_(namespace);
    var reg = registry_();
    if (!reg[ns]) reg[ns] = {};
    reg[ns][normalizeKeyPart_(keyPart)] = {
      key: fullKey,
      updatedAt: nowIso_()
    };
    saveRegistry_(reg);
  }

  function forgetKey_(namespace, keyPart, fullKey) {
    var ns = normalizeNs_(namespace);
    var kp = normalizeKeyPart_(keyPart);
    var reg = registry_();
    if (reg[ns] && reg[ns][kp]) {
      delete reg[ns][kp];
      saveRegistry_(reg);
    }
  }

  function removeNamespace(namespace, options) {
    var ns = normalizeNs_(namespace);
    var reg = registry_();
    var bucket = reg[ns] || {};
    var keys = [];
    Object.keys(bucket).forEach(function (k) {
      if (bucket[k] && bucket[k].key) keys.push(bucket[k].key);
    });

    if (keys.length) {
      getCache_(options && options.scope).removeAll(keys);
    }

    delete reg[ns];
    saveRegistry_(reg);
    return keys.length;
  }

  function removeAll(options) {
    var reg = registry_();
    var keys = [];
    Object.keys(reg).forEach(function (ns) {
      Object.keys(reg[ns] || {}).forEach(function (k) {
        if (reg[ns][k] && reg[ns][k].key) keys.push(reg[ns][k].key);
      });
    });

    if (keys.length) {
      getCache_(options && options.scope).removeAll(keys);
    }

    props_().deleteProperty(REGISTRY_PROP_KEY);
    return keys.length;
  }

  function diagnostics() {
    var reg = registry_();
    var namespaces = Object.keys(reg).sort();
    var out = {
      service: 'AUDIT_CACHE',
      version: VERSION,
      prefix: PREFIX,
      namespaces: {},
      totalRegisteredKeys: 0,
      timestamp: nowIso_()
    };

    namespaces.forEach(function (ns) {
      var count = Object.keys(reg[ns] || {}).length;
      out.namespaces[ns] = count;
      out.totalRegisteredKeys += count;
    });

    return out;
  }

  function log_(level, message, data) {
    try {
      Logger.log('[AUDIT_CACHE][' + level + '] ' + message + (data ? ' ' + JSON.stringify(data) : ''));
    } catch (e) {
      Logger.log('[AUDIT_CACHE][' + level + '] ' + message);
    }
  }

  // ===========================================================================
  // GATE F: overflow sheet store for oversized cache payloads
  // ===========================================================================

  function overflowSheet_(create) {
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss) return null;
      var sh = ss.getSheetByName(OVERFLOW_SHEET_NAME);
      if (!sh && create) {
        sh = ss.insertSheet(OVERFLOW_SHEET_NAME);
        sh.getRange(1, 1, 1, OVERFLOW_HEADER.length).setValues([OVERFLOW_HEADER]);
        sh.setFrozenRows(1);
        try { sh.hideSheet(); } catch (e) {}
      }
      return sh || null;
    } catch (e) {
      log_('WARN', 'Overflow sheet access failed', { error: e && e.message ? e.message : String(e) });
      return null;
    }
  }

  function overflowFindRow_(sh, fullKey) {
    try {
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return -1;
      var keys = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < keys.length; i++) {
        if (String(keys[i][0]) === fullKey) return i + 2;
      }
      return -1;
    } catch (e) { return -1; }
  }

  function overflowGet_(namespace, keyPart) {
    try {
      var sh = overflowSheet_(false);
      if (!sh) return null;
      var fullKey = makeKey(namespace, keyPart);
      var row = overflowFindRow_(sh, fullKey);
      if (row < 2) return null;
      var rng = sh.getRange(row, 1, 1, OVERFLOW_HEADER.length).getValues()[0];
      var expiresAtMs = Number(rng[5] || 0);
      if (expiresAtMs && Date.now() > expiresAtMs) {
        try { sh.deleteRow(row); } catch (e) {}
        return null;
      }
      var chunkCount = Math.max(0, Math.min(OVERFLOW_MAX_CHUNKS, Number(rng[6] || 0)));
      var serialized = '';
      for (var i = 0; i < chunkCount; i++) {
        serialized += String(rng[7 + i] || '');
      }
      if (!serialized) return null;
      return unwrap_(serialized);
    } catch (e) {
      log_('WARN', 'Overflow get failed', { error: e && e.message ? e.message : String(e) });
      return null;
    }
  }

  function overflowPut_(namespace, keyPart, text, ttlSeconds) {
    try {
      if (!text || typeof text !== 'string') return false;
      var capacity = OVERFLOW_MAX_CELL_CHARS * OVERFLOW_MAX_CHUNKS;
      if (text.length > capacity) {
        log_('WARN', 'Overflow put skipped: payload exceeds chunked capacity', {
          namespace: namespace,
          keyPart: keyPart,
          chars: text.length,
          capacity: capacity
        });
        return false;
      }
      var sh = overflowSheet_(true);
      if (!sh) return false;
      var fullKey = makeKey(namespace, keyPart);
      var ttl = ttl_(ttlSeconds, TTL.MEDIUM);
      var expiresAtMs = Date.now() + (ttl * 1000);
      var chunkCount = Math.max(1, Math.ceil(text.length / OVERFLOW_MAX_CELL_CHARS));
      var chunks = ['', '', '', ''];
      for (var i = 0; i < chunkCount; i++) {
        chunks[i] = text.substring(i * OVERFLOW_MAX_CELL_CHARS, (i + 1) * OVERFLOW_MAX_CELL_CHARS);
      }
      var rowVals = [
        fullKey,
        normalizeNs_(namespace),
        normalizeKeyPart_(keyPart),
        VERSION,
        ttl,
        expiresAtMs,
        chunkCount,
        chunks[0],
        chunks[1],
        chunks[2],
        chunks[3],
        nowIso_()
      ];
      var existing = overflowFindRow_(sh, fullKey);
      if (existing >= 2) {
        sh.getRange(existing, 1, 1, OVERFLOW_HEADER.length).setValues([rowVals]);
      } else {
        sh.appendRow(rowVals);
      }
      return true;
    } catch (e) {
      log_('WARN', 'Overflow put failed', { error: e && e.message ? e.message : String(e) });
      return false;
    }
  }

  function overflowRemove_(namespace, keyPart) {
    try {
      var sh = overflowSheet_(false);
      if (!sh) return false;
      var fullKey = makeKey(namespace, keyPart);
      var row = overflowFindRow_(sh, fullKey);
      if (row >= 2) {
        sh.deleteRow(row);
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function overflowClearAll_() {
    try {
      var sh = overflowSheet_(false);
      if (!sh) return 0;
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return 0;
      var n = lastRow - 1;
      sh.getRange(2, 1, n, OVERFLOW_HEADER.length).clearContent();
      return n;
    } catch (e) {
      log_('WARN', 'Overflow clearAll failed', { error: e && e.message ? e.message : String(e) });
      return 0;
    }
  }

  function overflowPurgeExpired_() {
    try {
      var sh = overflowSheet_(false);
      if (!sh) return 0;
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return 0;
      var data = sh.getRange(2, 6, lastRow - 1, 1).getValues();
      var now = Date.now();
      var deleted = 0;
      for (var i = data.length - 1; i >= 0; i--) {
        var expiresAtMs = Number(data[i][0] || 0);
        if (expiresAtMs && now > expiresAtMs) {
          try { sh.deleteRow(i + 2); deleted++; } catch (e) {}
        }
      }
      return deleted;
    } catch (e) { return 0; }
  }

  function overflowDiagnostics_() {
    try {
      var sh = overflowSheet_(false);
      if (!sh) return { rows: 0, exists: false };
      var lastRow = sh.getLastRow();
      var rows = Math.max(0, lastRow - 1);
      var out = {
        exists: true,
        sheet: OVERFLOW_SHEET_NAME,
        capacity: OVERFLOW_MAX_CELL_CHARS * OVERFLOW_MAX_CHUNKS,
        rows: rows,
        fresh: 0,
        expired: 0,
        totalChars: 0,
        byNamespace: {}
      };
      if (rows === 0) return out;
      var data = sh.getRange(2, 1, rows, OVERFLOW_HEADER.length).getValues();
      var now = Date.now();
      for (var i = 0; i < data.length; i++) {
        var ns = String(data[i][1] || '');
        var expiresAt = Number(data[i][5] || 0);
        var chunkCount = Number(data[i][6] || 0);
        var len = 0;
        for (var c = 0; c < chunkCount; c++) len += String(data[i][7 + c] || '').length;
        out.totalChars += len;
        if (!out.byNamespace[ns]) out.byNamespace[ns] = { rows: 0, fresh: 0, expired: 0, chars: 0 };
        out.byNamespace[ns].rows++;
        out.byNamespace[ns].chars += len;
        if (expiresAt && expiresAt < now) { out.expired++; out.byNamespace[ns].expired++; }
        else { out.fresh++; out.byNamespace[ns].fresh++; }
      }
      return out;
    } catch (e) {
      return { rows: 0, error: e && e.message ? e.message : String(e) };
    }
  }

  function readSheetValues_(sheetName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return [];
    return sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  }

  function getReadOnlySheet_(namespace, keyPart, sheetName, ttlSeconds, options) {
    return getOrBuild(namespace, keyPart, function () {
      return readSheetValues_(sheetName);
    }, ttlSeconds, options);
  }

  function getCompanies(options) {
    return getReadOnlySheet_(NS.COMPANIES, KEYS.COMPANIES_ALL, 'Companies', TTL.COMPANIES, options);
  }

  function getAuditors(options) {
    return getReadOnlySheet_(NS.AUDITORS, KEYS.AUDITORS_ALL, 'Auditors', TTL.AUDITORS, options);
  }

  function getConfigScopes(options) {
    return getReadOnlySheet_(NS.CONFIG_SCOPES, KEYS.CONFIG_SCOPES_ALL, 'Config_Scopes', TTL.CONFIG_SCOPES, options);
  }

  function getNotificationConfig(options) {
    return getReadOnlySheet_(NS.NOTIFICATION_CONFIG, KEYS.NOTIFICATION_CONFIG_ALL, 'Notification_Config', TTL.NOTIFICATION_CONFIG, options);
  }

  function getNotificationRules(options) {
    return getReadOnlySheet_(NS.NOTIFICATION_RULES, KEYS.NOTIFICATION_RULES_ALL, 'Notification_Rules', TTL.NOTIFICATION_RULES, options);
  }


  function normalizeEmailKey_(email) {
    var s = safeString_(email || '').trim().toLowerCase();
    s = s.replace(/[^a-z0-9@._+\-]/g, '_');
    return s || 'unknown';
  }

  function getAuditorGridKey_(view, auditorEmail) {
    var v = safeString_(view || 'active').toLowerCase();
    var prefix = (v === 'archived') ? KEYS.AUDITOR_GRID_ARCHIVED_PREFIX : KEYS.AUDITOR_GRID_ACTIVE_PREFIX;
    return prefix + normalizeEmailKey_(auditorEmail);
  }

  function getAuditorGrid(auditorEmail, view, options) {
    return get(NS.AUDITOR_GRID, getAuditorGridKey_(view, auditorEmail), options);
  }

  function putAuditorGrid(auditorEmail, view, payload, ttlSeconds, options) {
    return put(
      NS.AUDITOR_GRID,
      getAuditorGridKey_(view, auditorEmail),
      payload,
      ttlSeconds || TTL.AUDITOR_GRID,
      options
    );
  }

  function removeAuditorGrid(auditorEmail, view, options) {
    if (view) {
      return remove(NS.AUDITOR_GRID, getAuditorGridKey_(view, auditorEmail), options);
    }

    remove(NS.AUDITOR_GRID, getAuditorGridKey_('active', auditorEmail), options);
    remove(NS.AUDITOR_GRID, getAuditorGridKey_('archived', auditorEmail), options);
    return true;
  }

  function removeAuditorGridAll(options) {
    return removeNamespace(NS.AUDITOR_GRID, options);
  }


  function toolkitCompanyContextKey_(auditId) {
    return KEYS.TOOLKIT_COMPANY_CONTEXT_PREFIX + normalizeKeyPart_(auditId || 'missing');
  }

  function getToolkitCompanyContext(auditId, options) {
    auditId = safeString_(auditId).trim();
    if (!auditId) return null;
    return get(NS.TOOLKIT_COMPANY, toolkitCompanyContextKey_(auditId), options);
  }

  function putToolkitCompanyContext(auditId, payload, ttlSeconds, options) {
    auditId = safeString_(auditId).trim();
    if (!auditId) return false;
    return put(NS.TOOLKIT_COMPANY, toolkitCompanyContextKey_(auditId), payload || {}, ttlSeconds || TTL.TOOLKIT_COMPANY, options);
  }

  function removeToolkitCompanyContext(auditId, options) {
    auditId = safeString_(auditId).trim();
    if (!auditId) return false;
    return remove(NS.TOOLKIT_COMPANY, toolkitCompanyContextKey_(auditId), options);
  }


  function normalizeDateKey_(value) {
    var s = safeString_(value || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return m[1] + '-' + m[2];
    return normalizeKeyPart_(s || 'missing');
  }

  function availabilityLiteKey_(auditorEmail, rangeStartISO, rangeEndISO) {
    return KEYS.AVAILABILITY_LITE_PREFIX + normalizeEmailKey_(auditorEmail) + ':' + normalizeDateKey_(rangeStartISO) + ':' + normalizeDateKey_(rangeEndISO);
  }

  function getAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, options) {
    auditorEmail = safeString_(auditorEmail).trim();
    if (!auditorEmail) return null;
    return get(NS.AVAILABILITY, availabilityLiteKey_(auditorEmail, rangeStartISO, rangeEndISO), options);
  }

  function putAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, payload, ttlSeconds, options) {
    auditorEmail = safeString_(auditorEmail).trim();
    if (!auditorEmail) return false;
    return put(NS.AVAILABILITY, availabilityLiteKey_(auditorEmail, rangeStartISO, rangeEndISO), payload || {}, ttlSeconds || TTL.AVAILABILITY_MONTH, options);
  }

  function removeAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, options) {
    auditorEmail = safeString_(auditorEmail).trim();
    if (!auditorEmail) return false;
    return remove(NS.AVAILABILITY, availabilityLiteKey_(auditorEmail, rangeStartISO, rangeEndISO), options);
  }

  function removeAvailabilityAll(options) {
    return removeNamespace(NS.AVAILABILITY, options);
  }

  function warmupReadOnlyReferenceData(options) {
    var started = Date.now();
    var result = {
      success: true,
      warmed: [],
      failed: [],
      startedAt: nowIso_()
    };

    var jobs = [
      /*
       * Companies full-table cache intentionally excluded from standard warmup.
       * The full Companies sheet exceeds GAS cache value limits in production data.
       * Use CompaniesIndexService / RUN_COMPANIESINDEX_CACHE_WARMUP instead.
       */
      { name: 'Auditors', fn: getAuditors },
      { name: 'Config_Scopes', fn: getConfigScopes },
      { name: 'Notification_Config', fn: getNotificationConfig },
      { name: 'Notification_Rules', fn: getNotificationRules }
    ];

    result.skipped = [
      {
        name: 'Companies',
        reason: 'Full table too large for GAS CacheService; use CompaniesIndexService lightweight indexes'
      }
    ];

    jobs.forEach(function (job) {
      try {
        var values = job.fn(options || { forceRefresh: true });
        result.warmed.push({ name: job.name, rows: values ? values.length : 0 });
      } catch (e) {
        result.success = false;
        result.failed.push({ name: job.name, error: e && e.message ? e.message : String(e) });
      }
    });

    result.elapsedMs = Date.now() - started;
    result.finishedAt = nowIso_();
    log_('INFO', 'Warmup completed', result);
    return result;
  }

  return {
    VERSION: VERSION,
    NS: NS,
    TTL: TTL,
    KEYS: KEYS,

    makeKey: makeKey,
    get: get,
    put: put,
    remove: remove,
    removeNamespace: removeNamespace,
    removeAll: removeAll,
    getOrBuild: getOrBuild,
    diagnostics: diagnostics,

    getCompanies: getCompanies,
    getAuditors: getAuditors,
    getAuditorGrid: getAuditorGrid,
    putAuditorGrid: putAuditorGrid,
    removeAuditorGrid: removeAuditorGrid,
    removeAuditorGridAll: removeAuditorGridAll,
    getToolkitCompanyContext: getToolkitCompanyContext,
    putToolkitCompanyContext: putToolkitCompanyContext,
    removeToolkitCompanyContext: removeToolkitCompanyContext,
    getAvailabilityLite: getAvailabilityLite,
    putAvailabilityLite: putAvailabilityLite,
    removeAvailabilityLite: removeAvailabilityLite,
    removeAvailabilityAll: removeAvailabilityAll,
    getConfigScopes: getConfigScopes,
    getNotificationConfig: getNotificationConfig,
    getNotificationRules: getNotificationRules,
    warmupReadOnlyReferenceData: warmupReadOnlyReferenceData,

    // GATE F: overflow sheet store
    overflowDiagnostics: overflowDiagnostics_,
    overflowClearAll: overflowClearAll_,
    overflowPurgeExpired: overflowPurgeExpired_,
    overflowGet: overflowGet_,
    overflowPut: function (namespace, keyPart, value, ttlSeconds) {
      return overflowPut_(namespace, keyPart, wrap_(value), ttlSeconds);
    },
    overflowRemove: overflowRemove_
  };
})();

/**
 * Optional GAS-callable diagnostics helper.
 */
function AUDIT_CACHE_diagnostics() {
  return AUDIT_CACHE.diagnostics();
}

/**
 * Optional GAS-callable warmup helper.
 * Safe: read-only sheets only.
 */
function AUDIT_CACHE_warmupReadOnlyReferenceData() {
  return AUDIT_CACHE.warmupReadOnlyReferenceData({ forceRefresh: true });
}

/**
 * Optional GAS-callable full registered cache clear.
 * Safe: only removes keys registered by this central cache layer.
 */
function AUDIT_CACHE_removeAllRegistered() {
  return AUDIT_CACHE.removeAll();
}


/**
 * Optional GAS-callable auditor grid cache clear.
 * If auditorEmail is supplied, clears active + archived for that auditor.
 * If empty, clears all registered auditor grid cache keys.
 */
function AUDIT_CACHE_removeAuditorGrid(auditorEmail) {
  auditorEmail = String(auditorEmail || '').trim();
  if (auditorEmail) return AUDIT_CACHE.removeAuditorGrid(auditorEmail);
  return AUDIT_CACHE.removeAuditorGridAll();
}

/**
 * Optional GAS-callable auditor grid cache diagnostics.
 */
function AUDIT_CACHE_auditorGridDiagnostics() {
  var d = AUDIT_CACHE.diagnostics();
  return {
    ok: true,
    service: 'AUDIT_CACHE_AUDITOR_GRID',
    version: AUDIT_CACHE.VERSION,
    namespace: AUDIT_CACHE.NS.AUDITOR_GRID,
    ttlSeconds: AUDIT_CACHE.TTL.AUDITOR_GRID,
    registeredKeys: d && d.namespaces ? (d.namespaces[AUDIT_CACHE.NS.AUDITOR_GRID] || 0) : 0,
    diagnostics: d
  };
}


/**
 * Optional GAS-callable selected Toolkit company context cache helpers.
 * These route through the central AUDIT_CACHE owner.
 */
function AUDIT_CACHE_getToolkitCompanyContext(auditId) {
  return AUDIT_CACHE.getToolkitCompanyContext(auditId);
}

function AUDIT_CACHE_putToolkitCompanyContext(auditId, payload) {
  return AUDIT_CACHE.putToolkitCompanyContext(auditId, payload || {});
}

function AUDIT_CACHE_removeToolkitCompanyContext(auditId) {
  return AUDIT_CACHE.removeToolkitCompanyContext(auditId);
}

/**
 * Optional GAS-callable Toolkit availability-lite cache helpers.
 * These route through the central AUDIT_CACHE owner.
 */
function AUDIT_CACHE_getAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO) {
  return AUDIT_CACHE.getAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO);
}

function AUDIT_CACHE_putAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, payload) {
  return AUDIT_CACHE.putAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO, payload || {});
}

function AUDIT_CACHE_removeAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO) {
  return AUDIT_CACHE.removeAvailabilityLite(auditorEmail, rangeStartISO, rangeEndISO);
}

function AUDIT_CACHE_removeAvailabilityAll() {
  return AUDIT_CACHE.removeAvailabilityAll();
}

/**
 * GATE F: GAS-callable overflow sheet diagnostics.
 * Returns rows, fresh, expired, totalChars, byNamespace.
 * Auto-logs via Logger.log so the result is visible in the Apps Script execution log.
 */
function AUDIT_CACHE_overflowDiagnostics() {
  var out = AUDIT_CACHE.overflowDiagnostics();
  try { Logger.log('[GATE F] overflow stats: ' + JSON.stringify(out)); } catch (e) {}
  return out;
}

/**
 * GATE F: GAS-callable overflow sheet clearAll.
 * Removes ALL rows from AUDIT_CacheOverflow_Store. Use with care.
 * Auto-logs the number of rows cleared.
 */
function AUDIT_CACHE_overflowClearAll() {
  var n = AUDIT_CACHE.overflowClearAll();
  try { Logger.log('[GATE F] overflow clearAll: ' + n + ' rows cleared'); } catch (e) {}
  return n;
}

/**
 * GATE F: GAS-callable overflow sheet expired-row purge.
 * Returns number of expired rows deleted.
 * Auto-logs the count.
 */
function AUDIT_CACHE_overflowPurgeExpired() {
  var n = AUDIT_CACHE.overflowPurgeExpired();
  try { Logger.log('[GATE F] overflow purgeExpired: ' + n + ' expired rows deleted'); } catch (e) {}
  return n;
}
