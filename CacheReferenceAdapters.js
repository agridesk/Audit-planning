/***********************************************************************
 * FILE: CacheReferenceAdapters_PRUNED_FULL.gs
 * PURPOSE: retained read-only adapter API only.
 * SOURCE: CacheService_ReadOnlyAdapters.gs
 * NOTE: adapter warmup excludes oversized full Companies table
 * REMOVED: CacheService_ConfigAdapters.gs parallel native-cache fallback route.
 * SAFETY: function names from ReadOnlyAdapters preserved.
 ***********************************************************************/

/**
 * CacheService_ReadOnlyAdapters.gs
 * BUILD: 2026-04-24_001
 *
 * Purpose:
 * - Safe adapter layer for AUDIT_CACHE.
 * - Read-only/shared reference data only.
 * - No replacement of existing local execution caches.
 * - No planning/save/status/availability business logic changes.
 *
 * Safe first integration targets:
 * - Companies
 * - Auditors
 * - Config_Scopes
 * - Notification_Config
 * - Notification_Rules
 *
 * Important:
 * - Requires CacheService.gs with global AUDIT_CACHE.
 * - This file does not create a global CacheService variable.
 */

var AUDIT_CACHE_ADAPTERS = (function () {
  var VERSION = '2026-04-24_001';

  function hasCore_() {
    return typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.getOrBuild === 'function';
  }

  function assertCore_() {
    if (!hasCore_()) {
      throw new Error('AUDIT_CACHE is missing. Add CacheService.gs before CacheService_ReadOnlyAdapters.gs.');
    }
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function clean_(v) {
    return String(v == null ? '' : v).trim();
  }

  function normHeader_(v) {
    return clean_(v).toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s\-]/g, '');
  }

  function headerMap_(headers) {
    var map = {};
    headers = headers || [];
    for (var i = 0; i < headers.length; i++) {
      var raw = clean_(headers[i]);
      var key = normHeader_(raw);
      if (key && map[key] === undefined) map[key] = i;
    }
    map.__raw = headers.map(function (h) { return clean_(h); });
    return map;
  }

  function pickHeader_(map, candidates) {
    candidates = candidates || [];
    for (var i = 0; i < candidates.length; i++) {
      var key = normHeader_(candidates[i]);
      if (map[key] !== undefined) return map[key];
    }
    return -1;
  }

  function readSheetDisplayValues_(sheetName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return [];
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return [];
    return sh.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  }

  function asTable_(values) {
    values = values || [];
    var headers = values.length ? values[0] : [];
    var rows = values.length > 1 ? values.slice(1) : [];
    return {
      headers: headers,
      headerMap: headerMap_(headers),
      rows: rows,
      rowCount: rows.length,
      columnCount: headers.length
    };
  }

  function getSheetTableCached_(namespace, keyPart, sheetName, ttlSeconds, options) {
    assertCore_();
    options = options || {};
    return AUDIT_CACHE.getOrBuild(namespace, keyPart, function () {
      return asTable_(readSheetDisplayValues_(sheetName));
    }, ttlSeconds, options);
  }

  function getCompaniesTable(options) {
    assertCore_();
    return getSheetTableCached_(
      AUDIT_CACHE.NS.COMPANIES,
      'companies:table:v1',
      'Companies',
      AUDIT_CACHE.TTL.COMPANIES,
      options
    );
  }

  function getAuditorsTable(options) {
    assertCore_();
    return getSheetTableCached_(
      AUDIT_CACHE.NS.AUDITORS,
      'auditors:table:v1',
      'Auditors',
      AUDIT_CACHE.TTL.AUDITORS,
      options
    );
  }

  function getConfigScopesTable(options) {
    assertCore_();
    return getSheetTableCached_(
      AUDIT_CACHE.NS.CONFIG_SCOPES,
      'config_scopes:table:v1',
      'Config_Scopes',
      AUDIT_CACHE.TTL.CONFIG_SCOPES,
      options
    );
  }

  function getNotificationConfigTable(options) {
    assertCore_();
    return getSheetTableCached_(
      AUDIT_CACHE.NS.NOTIFICATION_CONFIG,
      'notification_config:table:v1',
      'Notification_Config',
      AUDIT_CACHE.TTL.NOTIFICATION_CONFIG,
      options
    );
  }

  function getNotificationRulesTable(options) {
    assertCore_();
    return getSheetTableCached_(
      AUDIT_CACHE.NS.NOTIFICATION_RULES,
      'notification_rules:table:v1',
      'Notification_Rules',
      AUDIT_CACHE.TTL.NOTIFICATION_RULES,
      options
    );
  }

  function getConfigScopesCatalog(options) {
    var table = getConfigScopesTable(options);
    var hm = table.headerMap || {};
    var slotCol = pickHeader_(hm, ['SlotKey', 'Slot key', 'Slot']);
    var codeCol = pickHeader_(hm, ['ScopeCode', 'Scope code', 'Code']);
    var nameCol = pickHeader_(hm, ['DisplayName', 'Display name', 'Name', 'ScopeName', 'Scope']);
    var activeCol = pickHeader_(hm, ['Active']);
    var archivedCol = pickHeader_(hm, ['Archived']);
    var sortCol = pickHeader_(hm, ['SortOrder', 'Sort order', 'Sort']);
    var hoursCol = pickHeader_(hm, ['Default_hours', 'Default hours', 'DefaultHours']);
    var maxCol = pickHeader_(hm, ['Max number audits', 'Max number audit', 'Max audits', 'Max audit', 'Maximum audits']);
    var recurringCol = pickHeader_(hm, ['Recurring']);
    var colorCol = pickHeader_(hm, ['Color', 'Colour']);
    var textColorCol = pickHeader_(hm, ['TextColor', 'Text color']);

    var out = [];
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r] || [];
      var displayName = nameCol >= 0 ? clean_(row[nameCol]) : '';
      if (!displayName) continue;
      out.push({
        slotKey: slotCol >= 0 ? clean_(row[slotCol]) : '',
        scopeCode: codeCol >= 0 ? clean_(row[codeCol]) : '',
        displayName: displayName,
        active: activeCol >= 0 ? clean_(row[activeCol]) : '',
        archived: archivedCol >= 0 ? clean_(row[archivedCol]) : '',
        sortOrder: sortCol >= 0 ? clean_(row[sortCol]) : '',
        defaultHours: hoursCol >= 0 ? clean_(row[hoursCol]) : '',
        maxNumberAudits: maxCol >= 0 ? clean_(row[maxCol]) : '',
        recurring: recurringCol >= 0 ? clean_(row[recurringCol]) : '',
        color: colorCol >= 0 ? clean_(row[colorCol]) : '',
        textColor: textColorCol >= 0 ? clean_(row[textColorCol]) : ''
      });
    }

    out.sort(function (a, b) {
      var na = Number(a.sortOrder || 999999);
      var nb = Number(b.sortOrder || 999999);
      if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
      return String(a.displayName || '').localeCompare(String(b.displayName || ''));
    });

    return out;
  }

  function getAuditorDirectory(options) {
    var table = getAuditorsTable(options);
    var hm = table.headerMap || {};
    var nameCol = pickHeader_(hm, ['Name', 'Auditor', 'Auditor name', 'Auditor Name']);
    var emailCol = pickHeader_(hm, ['E-mail', 'Email', 'E mail', 'Auditor email', 'Auditor_Email']);
    var activeCol = pickHeader_(hm, ['Active']);
    var roleCol = pickHeader_(hm, ['Role', 'Function']);

    var out = { byEmail: {}, list: [] };
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r] || [];
      var email = emailCol >= 0 ? clean_(row[emailCol]).toLowerCase() : '';
      if (!email) continue;

      var active = activeCol >= 0 ? clean_(row[activeCol]).toUpperCase() : 'YES';
      if (active && active !== 'YES' && active !== 'TRUE' && active !== '1') continue;

      var role = roleCol >= 0 ? clean_(row[roleCol]).toLowerCase() : '';
      if (role && role !== 'auditor') continue;

      var item = {
        email: email,
        name: nameCol >= 0 ? clean_(row[nameCol]) : email
      };
      out.byEmail[email] = item;
      out.list.push(item);
    }
    return out;
  }

  function warmup(options) {
    assertCore_();
    options = options || { forceRefresh: true };
    var started = Date.now();
    var result = {
      success: true,
      version: VERSION,
      startedAt: nowIso_(),
      warmed: [],
      failed: []
    };

    var jobs = [
      /*
       * Companies table intentionally excluded from adapter warmup:
       * full Companies payload exceeds GAS cache size limits.
       * Active production route is CompaniesIndexService lightweight indexes.
       */
      { name: 'Auditors table', fn: getAuditorsTable },
      { name: 'Config_Scopes table', fn: getConfigScopesTable },
      { name: 'Config_Scopes catalog', fn: getConfigScopesCatalog },
      { name: 'Auditor directory', fn: getAuditorDirectory },
      { name: 'Notification_Config table', fn: getNotificationConfigTable },
      { name: 'Notification_Rules table', fn: getNotificationRulesTable }
    ];

    result.skipped = [
      {
        name: 'Companies table',
        reason: 'Full Companies payload too large; use CompaniesIndexService lightweight indexes'
      }
    ];

    for (var i = 0; i < jobs.length; i++) {
      try {
        var value = jobs[i].fn(options);
        result.warmed.push({
          name: jobs[i].name,
          rows: value && value.rowCount !== undefined ? value.rowCount : (value && value.length !== undefined ? value.length : '')
        });
      } catch (e) {
        result.success = false;
        result.failed.push({ name: jobs[i].name, error: e && e.message ? e.message : String(e) });
      }
    }

    result.elapsedMs = Date.now() - started;
    result.finishedAt = nowIso_();
    return result;
  }

  function diagnostics() {
    assertCore_();
    return {
      success: true,
      adapterVersion: VERSION,
      core: AUDIT_CACHE.diagnostics(),
      timestamp: nowIso_()
    };
  }

  function clearReferenceData() {
    assertCore_();
    var removed = 0;
    removed += AUDIT_CACHE.removeNamespace(AUDIT_CACHE.NS.COMPANIES);
    removed += AUDIT_CACHE.removeNamespace(AUDIT_CACHE.NS.AUDITORS);
    removed += AUDIT_CACHE.removeNamespace(AUDIT_CACHE.NS.CONFIG_SCOPES);
    removed += AUDIT_CACHE.removeNamespace(AUDIT_CACHE.NS.NOTIFICATION_CONFIG);
    removed += AUDIT_CACHE.removeNamespace(AUDIT_CACHE.NS.NOTIFICATION_RULES);
    return { success: true, removed: removed };
  }

  return {
    VERSION: VERSION,
    diagnostics: diagnostics,
    warmup: warmup,
    clearReferenceData: clearReferenceData,

    getCompaniesTable: getCompaniesTable,
    getAuditorsTable: getAuditorsTable,
    getConfigScopesTable: getConfigScopesTable,
    getNotificationConfigTable: getNotificationConfigTable,
    getNotificationRulesTable: getNotificationRulesTable,

    getConfigScopesCatalog: getConfigScopesCatalog,
    getAuditorDirectory: getAuditorDirectory
  };
})();

function AUDIT_CACHE_ADAPTERS_Diagnostics() {
  return AUDIT_CACHE_ADAPTERS.diagnostics();
}

function AUDIT_CACHE_ADAPTERS_Warmup() {
  return AUDIT_CACHE_ADAPTERS.warmup({ forceRefresh: true });
}

function AUDIT_CACHE_ADAPTERS_ClearReferenceData() {
  return AUDIT_CACHE_ADAPTERS.clearReferenceData();
}

function AUDIT_CACHE_getCompaniesTable(options) {
  return AUDIT_CACHE_ADAPTERS.getCompaniesTable(options || {});
}

function AUDIT_CACHE_getAuditorsTable(options) {
  return AUDIT_CACHE_ADAPTERS.getAuditorsTable(options || {});
}

function AUDIT_CACHE_getConfigScopesTable(options) {
  return AUDIT_CACHE_ADAPTERS.getConfigScopesTable(options || {});
}

function AUDIT_CACHE_getNotificationConfigTable(options) {
  return AUDIT_CACHE_ADAPTERS.getNotificationConfigTable(options || {});
}

function AUDIT_CACHE_getNotificationRulesTable(options) {
  return AUDIT_CACHE_ADAPTERS.getNotificationRulesTable(options || {});
}

function AUDIT_CACHE_getConfigScopesCatalog(options) {
  return AUDIT_CACHE_ADAPTERS.getConfigScopesCatalog(options || {});
}

function AUDIT_CACHE_getAuditorDirectory(options) {
  return AUDIT_CACHE_ADAPTERS.getAuditorDirectory(options || {});
}
