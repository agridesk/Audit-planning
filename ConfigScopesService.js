/***********************************************************************
 * FILE: ConfigScopesService.gs
 *
 * PURPOSE
 * - Central read-only service for Config_Scopes
 * - Uses AUDIT_CACHE when available
 * - Safe fallback to direct sheet read
 * - No planning/status/save/availability logic changes
 *
 * CACHE
 * - Namespace: config_scopes
 * - Keys:
 *   - catalog:v1
 *   - by_display:v1
 *   - alias_meta:v1
 *
 * PUBLIC RUNNERS
 * - RUN_CONFIGSCOPES_DIAGNOSTICS
 * - RUN_CONFIGSCOPES_CACHE_WARMUP
 * - RUN_CONFIGSCOPES_CACHE_HIT_TEST
 * - RUN_CONFIGSCOPES_CLEARCACHE
 ***********************************************************************/

var CONFIGSCOPES_SHEET_NAME = 'Config_Scopes';
var CONFIGSCOPES_CACHE_NAMESPACE = 'config_scopes';
var CONFIGSCOPES_CACHE_TTL_SECONDS = 1800;

var CONFIGSCOPES_EXEC_CACHE = {
  catalog: null,
  byDisplay: null,
  aliasMeta: null
};

function ConfigScopes_ClearCache() {
  CONFIGSCOPES_EXEC_CACHE.catalog = null;
  CONFIGSCOPES_EXEC_CACHE.byDisplay = null;
  CONFIGSCOPES_EXEC_CACHE.aliasMeta = null;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace(CONFIGSCOPES_CACHE_NAMESPACE);
    }
  } catch (e) {}

  return { ok: true };
}

function ConfigScopes_GetCatalog(forceRefresh) {
  if (!forceRefresh && CONFIGSCOPES_EXEC_CACHE.catalog) return CONFIGSCOPES_EXEC_CACHE.catalog;

  var key = 'catalog:v1';

  if (!forceRefresh) {
    var cached = ConfigScopes_cacheGet_(key);
    if (cached && cached.ok) {
      CONFIGSCOPES_EXEC_CACHE.catalog = cached;
      return cached;
    }
  }

  var catalog = ConfigScopes_loadCatalogFromSheet_();
  CONFIGSCOPES_EXEC_CACHE.catalog = catalog;
  ConfigScopes_cachePut_(key, catalog);
  return catalog;
}

function ConfigScopes_GetByDisplayName(forceRefresh) {
  if (!forceRefresh && CONFIGSCOPES_EXEC_CACHE.byDisplay) return CONFIGSCOPES_EXEC_CACHE.byDisplay;

  var key = 'by_display:v1';

  if (!forceRefresh) {
    var cached = ConfigScopes_cacheGet_(key);
    if (cached && cached.ok) {
      CONFIGSCOPES_EXEC_CACHE.byDisplay = cached;
      return cached;
    }
  }

  var catalog = ConfigScopes_GetCatalog(!!forceRefresh);
  var map = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: 0,
    byDisplayName: {}
  };

  var rows = catalog.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {};
    var displayName = String(item.displayName || '').trim();
    if (!displayName) continue;
    map.byDisplayName[displayName] = item;
    map.byDisplayName[displayName.toLowerCase()] = item;
    map.count++;
  }

  CONFIGSCOPES_EXEC_CACHE.byDisplay = map;
  ConfigScopes_cachePut_(key, map);
  return map;
}

function ConfigScopes_GetAliasMeta(forceRefresh) {
  if (!forceRefresh && CONFIGSCOPES_EXEC_CACHE.aliasMeta) return CONFIGSCOPES_EXEC_CACHE.aliasMeta;

  var key = 'alias_meta:v1';

  if (!forceRefresh) {
    var cached = ConfigScopes_cacheGet_(key);
    if (cached && cached.ok) {
      CONFIGSCOPES_EXEC_CACHE.aliasMeta = cached;
      return cached;
    }
  }

  var catalog = ConfigScopes_GetCatalog(!!forceRefresh);
  var meta = {
    ok: true,
    generatedAt: new Date().toISOString(),
    byAnyKey: {},
    aliasesByCanonical: {}
  };

  function norm_(v) {
    return ConfigScopes_normKey_(v);
  }

  function addKey_(key, canonical) {
    key = String(key || '').trim();
    canonical = String(canonical || '').trim();
    if (!key || !canonical) return;
    meta.byAnyKey[norm_(key)] = canonical;
  }

  function addAlias_(canonical, alias) {
    canonical = String(canonical || '').trim();
    alias = String(alias || '').trim();
    if (!canonical || !alias) return;
    if (!meta.aliasesByCanonical[canonical]) meta.aliasesByCanonical[canonical] = [];
    if (meta.aliasesByCanonical[canonical].indexOf(alias) < 0) {
      meta.aliasesByCanonical[canonical].push(alias);
    }
  }

  var rows = catalog.rows || [];
  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {};
    var canonical = String(item.displayName || '').trim();
    var slotKey = String(item.slotKey || '').trim();
    var scopeCode = String(item.scopeCode || '').trim();

    if (!canonical) continue;

    addKey_(canonical, canonical);
    addKey_(slotKey, canonical);
    addKey_(scopeCode, canonical);

    addAlias_(canonical, canonical);
    addAlias_(canonical, slotKey);
    addAlias_(canonical, scopeCode);

    if (canonical === 'Florimark Tracecert') {
      addKey_('Florimark Tracecert', canonical);
      addKey_('FLORIMARK_TF', canonical);
      addAlias_(canonical, 'Florimark Tracecert');
      addAlias_(canonical, 'FLORIMARK_TF');
    }

    if (canonical === 'Florimark GTP') {
      addKey_('FLORIMARK_G', canonical);
      addAlias_(canonical, 'FLORIMARK_G');
    }
  }

  CONFIGSCOPES_EXEC_CACHE.aliasMeta = meta;
  ConfigScopes_cachePut_(key, meta);
  return meta;
}

function ConfigScopes_CanonicalName(rawScope) {
  var raw = String(rawScope || '').trim();
  if (!raw) return '';
  var meta = ConfigScopes_GetAliasMeta(false);
  return meta.byAnyKey[ConfigScopes_normKey_(raw)] || raw;
}

function ConfigScopes_GetActiveScopes(forceRefresh) {
  var catalog = ConfigScopes_GetCatalog(!!forceRefresh);
  var rows = catalog.rows || [];

  return rows.filter(function(item) {
    return ConfigScopes_yes_(item.active, true) && !ConfigScopes_yes_(item.archived, false);
  });
}

function ConfigScopes_loadCatalogFromSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIGSCOPES_SHEET_NAME);

  if (!sh) {
    return {
      ok: false,
      sheetName: CONFIGSCOPES_SHEET_NAME,
      generatedAt: new Date().toISOString(),
      rowCount: 0,
      rows: [],
      error: 'Missing sheet: ' + CONFIGSCOPES_SHEET_NAME
    };
  }

  var values = sh.getDataRange().getValues();

  if (!values || values.length < 2) {
    return {
      ok: true,
      sheetName: CONFIGSCOPES_SHEET_NAME,
      generatedAt: new Date().toISOString(),
      rowCount: 0,
      rows: []
    };
  }

  var headers = values[0] || [];
  var idx = ConfigScopes_headerMap_(headers);

  var rows = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];

    var displayName = ConfigScopes_clean_(ConfigScopes_val_(row, idx, [
      'DisplayName',
      'Display name',
      'Name',
      'ScopeName',
      'Scope'
    ]));

    if (!displayName) continue;

    rows.push({
      slotKey: ConfigScopes_clean_(ConfigScopes_val_(row, idx, ['SlotKey', 'Slot key', 'Slot'])),
      scopeCode: ConfigScopes_clean_(ConfigScopes_val_(row, idx, ['ScopeCode', 'Scope code', 'Code'])),
      displayName: displayName,
      color: ConfigScopes_clean_(ConfigScopes_val_(row, idx, ['Color', 'Colour', 'BackgroundColor', 'Background color'])),
      textColor: ConfigScopes_clean_(ConfigScopes_val_(row, idx, ['TextColor', 'Text color', 'FontColor', 'Font color'])),
      active: ConfigScopes_val_(row, idx, ['Active', 'ACTIVE']),
      archived: ConfigScopes_val_(row, idx, ['Archived', 'ARCHIVED']),
      sortOrder: ConfigScopes_num_(ConfigScopes_val_(row, idx, ['SortOrder', 'Sort order', 'Sort']), r),
      defaultHours: ConfigScopes_num_(ConfigScopes_val_(row, idx, ['Default_hours', 'Default hours', 'DefaultHours']), 0),
      maxNumberAudits: ConfigScopes_numOrNull_(ConfigScopes_val_(row, idx, ['Max number audits', 'Max number audit', 'Max audits', 'Max audit', 'Maximum audits'])),
      planningFrom: ConfigScopes_numOrNull_(ConfigScopes_val_(row, idx, ['Planning from', 'Planning_from', 'PlanningFrom'])),
      planningTo: ConfigScopes_numOrNull_(ConfigScopes_val_(row, idx, ['Planning to', 'Planning_to', 'PlanningTo'])),
      extension: ConfigScopes_numOrNull_(ConfigScopes_val_(row, idx, ['Extension'])),
      recurring: ConfigScopes_clean_(ConfigScopes_val_(row, idx, ['Recurring', 'RECURRENCE', 'Recurring audit']))
    });
  }

  rows.sort(function(a, b) {
    var so = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (so !== 0) return so;
    return String(a.displayName || '').localeCompare(String(b.displayName || ''));
  });

  return {
    ok: true,
    sheetName: CONFIGSCOPES_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows: rows
  };
}

function ConfigScopes_headerMap_(headers) {
  var map = {};
  headers = headers || [];

  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;

    map[raw] = i;
    map[raw.toUpperCase()] = i;
    map[raw.toLowerCase()] = i;
    map[ConfigScopes_normKey_(raw)] = i;
  }

  return map;
}

function ConfigScopes_val_(row, idx, candidates) {
  candidates = candidates || [];

  for (var i = 0; i < candidates.length; i++) {
    var c = String(candidates[i] || '').trim();
    if (!c) continue;

    if (idx.hasOwnProperty(c)) return row[idx[c]];
    if (idx.hasOwnProperty(c.toUpperCase())) return row[idx[c.toUpperCase()]];
    if (idx.hasOwnProperty(c.toLowerCase())) return row[idx[c.toLowerCase()]];

    var norm = ConfigScopes_normKey_(c);
    if (idx.hasOwnProperty(norm)) return row[idx[norm]];
  }

  return '';
}

function ConfigScopes_normKey_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function ConfigScopes_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function ConfigScopes_num_(v, fallback) {
  if (v === '' || v === null || typeof v === 'undefined') return fallback;
  var n = Number(v);
  return isNaN(n) ? fallback : n;
}

function ConfigScopes_numOrNull_(v) {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function ConfigScopes_yes_(v, fallback) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  if (!s) return !!fallback;
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'X';
}

function ConfigScopes_cacheGet_(keyPart) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(CONFIGSCOPES_CACHE_NAMESPACE, keyPart);
    }
  } catch (e) {}
  return null;
}

function ConfigScopes_cachePut_(keyPart, value) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(CONFIGSCOPES_CACHE_NAMESPACE, keyPart, value, CONFIGSCOPES_CACHE_TTL_SECONDS);
    }
  } catch (e) {}
}

/***********************************************************************
 * RUNNERS
 ***********************************************************************/

function RUN_CONFIGSCOPES_DIAGNOSTICS() {
  var started = new Date().getTime();

  var catalog = ConfigScopes_GetCatalog(false);
  var byDisplay = ConfigScopes_GetByDisplayName(false);
  var aliasMeta = ConfigScopes_GetAliasMeta(false);
  var active = ConfigScopes_GetActiveScopes(false);

  var out = {
    ok: !!catalog.ok,
    durationMs: new Date().getTime() - started,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    catalogRows: catalog.rowCount || 0,
    activeRows: active.length,
    byDisplayCount: byDisplay.count || 0,
    aliasKeys: Object.keys(aliasMeta.byAnyKey || {}).length,
    sampleScopes: (catalog.rows || []).slice(0, 10).map(function(x) {
      return {
        slotKey: x.slotKey,
        scopeCode: x.scopeCode,
        displayName: x.displayName,
        defaultHours: x.defaultHours,
        maxNumberAudits: x.maxNumberAudits
      };
    })
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_CONFIGSCOPES_CACHE_WARMUP() {
  ConfigScopes_ClearCache();

  var started = new Date().getTime();

  var catalog = ConfigScopes_GetCatalog(true);
  var byDisplay = ConfigScopes_GetByDisplayName(true);
  var aliasMeta = ConfigScopes_GetAliasMeta(true);

  var out = {
    ok: !!catalog.ok,
    durationMs: new Date().getTime() - started,
    catalogRows: catalog.rowCount || 0,
    byDisplayCount: byDisplay.count || 0,
    aliasKeys: Object.keys(aliasMeta.byAnyKey || {}).length,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_CONFIGSCOPES_CACHE_HIT_TEST() {
  CONFIGSCOPES_EXEC_CACHE.catalog = null;
  CONFIGSCOPES_EXEC_CACHE.byDisplay = null;
  CONFIGSCOPES_EXEC_CACHE.aliasMeta = null;

  var started = new Date().getTime();

  var catalog = ConfigScopes_GetCatalog(false);
  var byDisplay = ConfigScopes_GetByDisplayName(false);
  var aliasMeta = ConfigScopes_GetAliasMeta(false);

  var out = {
    ok: !!catalog.ok,
    durationMs: new Date().getTime() - started,
    catalogRows: catalog.rowCount || 0,
    byDisplayCount: byDisplay.count || 0,
    aliasKeys: Object.keys(aliasMeta.byAnyKey || {}).length,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_CONFIGSCOPES_CLEARCACHE() {
  return ConfigScopes_ClearCache();
}
