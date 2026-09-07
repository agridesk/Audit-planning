/***********************************************************************
 * FILE: AuditorsIndexService.gs
 *
 * PURPOSE
 * - Lightweight read-only indexes for Auditors
 * - Uses AUDIT_CACHE when available
 * - Safe fallback to direct sheet read
 * - No planning/status/save/availability logic changes
 *
 * CACHE
 * - Namespace: auditors_index
 * - Keys:
 *   - directory:v1
 *   - qualifications:v1
 *
 * PUBLIC RUNNERS
 * - RUN_AUDITORSINDEX_DIAGNOSTICS
 * - RUN_AUDITORSINDEX_CACHE_WARMUP
 * - RUN_AUDITORSINDEX_CACHE_HIT_TEST
 * - RUN_AUDITORSINDEX_CLEARCACHE
 ***********************************************************************/

var AUDITORSINDEX_SHEET_NAME = 'Auditors';
var AUDITORSINDEX_CACHE_NAMESPACE = 'auditors_index';
var AUDITORSINDEX_CACHE_TTL_SECONDS = 1800;

var AUDITORSINDEX_EXEC_CACHE = {
  directory: null,
  qualifications: null
};

function AuditorsIndex_ClearCache() {
  AUDITORSINDEX_EXEC_CACHE.directory = null;
  AUDITORSINDEX_EXEC_CACHE.qualifications = null;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace(AUDITORSINDEX_CACHE_NAMESPACE);
    }
  } catch (e) {}

  return { ok: true };
}

function AuditorsIndex_GetDirectory(forceRefresh) {
  if (!forceRefresh && AUDITORSINDEX_EXEC_CACHE.directory) return AUDITORSINDEX_EXEC_CACHE.directory;

  var key = 'directory:v1';

  if (!forceRefresh) {
    var cached = AuditorsIndex_cacheGet_(key);
    if (cached && cached.ok) {
      AUDITORSINDEX_EXEC_CACHE.directory = cached;
      return cached;
    }
  }

  var index = AuditorsIndex_buildDirectory_();
  AUDITORSINDEX_EXEC_CACHE.directory = index;
  AuditorsIndex_cachePut_(key, index);
  return index;
}

function AuditorsIndex_GetQualifications(forceRefresh) {
  if (!forceRefresh && AUDITORSINDEX_EXEC_CACHE.qualifications) return AUDITORSINDEX_EXEC_CACHE.qualifications;

  var key = 'qualifications:v1';

  if (!forceRefresh) {
    var cached = AuditorsIndex_cacheGet_(key);
    if (cached && cached.ok) {
      AUDITORSINDEX_EXEC_CACHE.qualifications = cached;
      return cached;
    }
  }

  var index = AuditorsIndex_buildQualifications_();
  AUDITORSINDEX_EXEC_CACHE.qualifications = index;
  AuditorsIndex_cachePut_(key, index);
  return index;
}

function AuditorsIndex_GetAuditorByEmail(email) {
  var key = AuditorsIndex_normEmail_(email);
  if (!key) return null;

  var dir = AuditorsIndex_GetDirectory(false);
  return dir.byEmail && dir.byEmail[key] ? dir.byEmail[key] : null;
}

function AuditorsIndex_ResolveEmail(raw) {
  var s = AuditorsIndex_clean_(raw);
  if (!s) return '';

  var lower = s.toLowerCase();
  if (lower.indexOf('@') > 0) return lower;

  var dir = AuditorsIndex_GetDirectory(false);

  if (dir.byNameKey && dir.byNameKey[AuditorsIndex_normKey_(s)]) {
    return dir.byNameKey[AuditorsIndex_normKey_(s)].email || '';
  }

  return '';
}

function AuditorsIndex_IsQualified(email, scopeName) {
  var key = AuditorsIndex_normEmail_(email);
  var scope = AuditorsIndex_clean_(scopeName);
  if (!key || !scope) return false;

  var q = AuditorsIndex_GetQualifications(false);
  var rec = q.byEmail && q.byEmail[key] ? q.byEmail[key] : null;
  if (!rec || !rec.qualifiedScopes) return false;

  var canonical = scope;
  try {
    if (typeof ConfigScopes_CanonicalName === 'function') {
      canonical = ConfigScopes_CanonicalName(scope);
    }
  } catch (e) {}

  return !!rec.qualifiedScopes[canonical] || !!rec.qualifiedScopes[scope] || !!rec.qualifiedScopes[scope.toLowerCase()];
}

function AuditorsIndex_buildDirectory_() {
  var pack = AuditorsIndex_readAuditors_();

  var out = {
    ok: pack.ok,
    sheetName: AUDITORSINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byEmail: {},
    byNameKey: {},
    list: [],
    error: pack.error || ''
  };

  if (!pack.ok) return out;

  var idx = pack.idx;
  var rows = pack.rows;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];

    var email = AuditorsIndex_normEmail_(AuditorsIndex_val_(row, idx, [
      'E-mail', 'Email', 'E mail', 'Auditor email', 'Auditor_Email'
    ]));

    var name = AuditorsIndex_clean_(AuditorsIndex_val_(row, idx, [
      'Name', 'Auditor', 'Auditor name', 'Auditor Name'
    ]));

    if (!email) continue;

    var active = AuditorsIndex_clean_(AuditorsIndex_val_(row, idx, ['Active', 'ACTIVE']));
    var role = AuditorsIndex_clean_(AuditorsIndex_val_(row, idx, ['Role', 'Function']));

    if (active && !AuditorsIndex_yes_(active, true)) continue;
    if (role && role.toLowerCase() !== 'auditor') continue;

    var rec = {
      email: email,
      name: name || email,
      display: (name ? (name + ' <' + email + '>') : email),
      active: active || 'YES',
      role: role || 'auditor',
      blockedWeekdays: AuditorsIndex_clean_(AuditorsIndex_val_(row, idx, [
        'Blocked weekdays',
        'Default blocked weekdays',
        'Default blocked days',
        'Blocked weekdays (default)'
      ])),
      timezone: AuditorsIndex_clean_(AuditorsIndex_val_(row, idx, [
        'Timezone', 'Time zone', 'Default timezone'
      ]))
    };

    out.byEmail[email] = rec;
    if (rec.name) out.byNameKey[AuditorsIndex_normKey_(rec.name)] = rec;
    out.list.push(rec);
    out.count++;
  }

  out.list.sort(function(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return out;
}

function AuditorsIndex_buildQualifications_() {
  var pack = AuditorsIndex_readAuditors_();

  var out = {
    ok: pack.ok,
    sheetName: AUDITORSINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byEmail: {},
    error: pack.error || ''
  };

  if (!pack.ok) return out;

  var directory = AuditorsIndex_GetDirectory(false);
  var idx = pack.idx;
  var rows = pack.rows;
  var headers = pack.headers || [];

  var scopeNames = AuditorsIndex_getKnownScopeNames_();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];

    var email = AuditorsIndex_normEmail_(AuditorsIndex_val_(row, idx, [
      'E-mail', 'Email', 'E mail', 'Auditor email', 'Auditor_Email'
    ]));

    if (!email || !directory.byEmail[email]) continue;

    var qualifiedScopes = {};

    for (var s = 0; s < scopeNames.length; s++) {
      var scope = scopeNames[s];
      var col = AuditorsIndex_findExactHeader_(headers, scope);

      if (col < 0) {
        try {
          if (typeof ConfigScopes_GetAliasMeta === 'function') {
            var aliasMeta = ConfigScopes_GetAliasMeta(false);
            var aliases = aliasMeta.aliasesByCanonical && aliasMeta.aliasesByCanonical[scope]
              ? aliasMeta.aliasesByCanonical[scope]
              : [scope];

            for (var a = 0; a < aliases.length; a++) {
              col = AuditorsIndex_findExactHeader_(headers, aliases[a]);
              if (col >= 0) break;
            }
          }
        } catch (eAlias) {}
      }

      if (col < 0) continue;

      var val = AuditorsIndex_clean_(row[col]).toLowerCase();
      if (val === 'x' || val === 'yes' || val === 'true' || val === '1') {
        qualifiedScopes[scope] = true;
        qualifiedScopes[scope.toLowerCase()] = true;
      }
    }

    out.byEmail[email] = {
      email: email,
      name: directory.byEmail[email].name || email,
      qualifiedScopes: qualifiedScopes,
      qualifiedScopeCount: Object.keys(qualifiedScopes).length / 2
    };
    out.count++;
  }

  return out;
}

function AuditorsIndex_getKnownScopeNames_() {
  try {
    if (typeof ConfigScopes_GetActiveScopes === 'function') {
      var rows = ConfigScopes_GetActiveScopes(false) || [];
      return rows.map(function(x) { return String(x.displayName || '').trim(); }).filter(function(x) { return !!x; });
    }
  } catch (e) {}

  try {
    if (typeof ConfigScopes_GetCatalog === 'function') {
      var catalog = ConfigScopes_GetCatalog(false);
      if (catalog && Array.isArray(catalog.rows)) {
        return catalog.rows.map(function(x) { return String(x.displayName || '').trim(); }).filter(function(x) { return !!x; });
      }
    }
  } catch (e2) {}

  return [
    'MPS-ABC',
    'MPS-GAP',
    'MPS-SQ',
    'GRASP',
    'Florimark Tracecert',
    'Florimark GTP',
    'Scope 7',
    'Scope 8'
  ];
}

function AuditorsIndex_readAuditors_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(AUDITORSINDEX_SHEET_NAME);

  if (!sh) {
    return {
      ok: false,
      error: 'Missing sheet: ' + AUDITORSINDEX_SHEET_NAME,
      headers: [],
      idx: {},
      rows: []
    };
  }

  var values = sh.getDataRange().getValues();

  if (!values || !values.length) {
    return {
      ok: true,
      headers: [],
      idx: {},
      rows: []
    };
  }

  var headers = values[0] || [];

  return {
    ok: true,
    headers: headers,
    idx: AuditorsIndex_headerMap_(headers),
    rows: values.length > 1 ? values.slice(1) : []
  };
}

function AuditorsIndex_headerMap_(headers) {
  var map = {};
  headers = headers || [];

  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;

    map[raw] = i;
    map[raw.toUpperCase()] = i;
    map[raw.toLowerCase()] = i;
    map[AuditorsIndex_normKey_(raw)] = i;
  }

  return map;
}

function AuditorsIndex_val_(row, idx, candidates) {
  candidates = candidates || [];

  for (var i = 0; i < candidates.length; i++) {
    var c = String(candidates[i] || '').trim();
    if (!c) continue;

    if (idx.hasOwnProperty(c)) return row[idx[c]];
    if (idx.hasOwnProperty(c.toUpperCase())) return row[idx[c.toUpperCase()]];
    if (idx.hasOwnProperty(c.toLowerCase())) return row[idx[c.toLowerCase()]];

    var norm = AuditorsIndex_normKey_(c);
    if (idx.hasOwnProperty(norm)) return row[idx[norm]];
  }

  return '';
}

function AuditorsIndex_findExactHeader_(headers, target) {
  target = AuditorsIndex_clean_(target).toLowerCase();
  if (!target) return -1;

  for (var i = 0; i < headers.length; i++) {
    if (AuditorsIndex_clean_(headers[i]).toLowerCase() === target) return i;
  }

  return -1;
}

function AuditorsIndex_normKey_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function AuditorsIndex_normEmail_(v) {
  return AuditorsIndex_clean_(v).toLowerCase();
}

function AuditorsIndex_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function AuditorsIndex_yes_(v, fallback) {
  var s = AuditorsIndex_clean_(v).toUpperCase();
  if (!s) return !!fallback;
  return s === 'YES' || s === 'TRUE' || s === '1' || s === 'X';
}

function AuditorsIndex_cacheGet_(keyPart) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(AUDITORSINDEX_CACHE_NAMESPACE, keyPart);
    }
  } catch (e) {}
  return null;
}

function AuditorsIndex_cachePut_(keyPart, value) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(AUDITORSINDEX_CACHE_NAMESPACE, keyPart, value, AUDITORSINDEX_CACHE_TTL_SECONDS);
    }
  } catch (e) {}
}

/***********************************************************************
 * RUNNERS
 ***********************************************************************/

function RUN_AUDITORSINDEX_DIAGNOSTICS() {
  var started = new Date().getTime();

  var directory = AuditorsIndex_GetDirectory(false);
  var qualifications = AuditorsIndex_GetQualifications(false);

  var out = {
    ok: !!directory.ok && !!qualifications.ok,
    durationMs: new Date().getTime() - started,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    auditorCount: directory.count || 0,
    qualificationRows: qualifications.count || 0,
    sampleAuditors: (directory.list || []).slice(0, 10),
    sampleQualifications: Object.keys(qualifications.byEmail || {}).slice(0, 5).map(function(email) {
      var x = qualifications.byEmail[email];
      return {
        email: email,
        name: x.name,
        qualifiedScopeCount: x.qualifiedScopeCount
      };
    })
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_AUDITORSINDEX_CACHE_WARMUP() {
  AuditorsIndex_ClearCache();

  var started = new Date().getTime();

  var directory = AuditorsIndex_GetDirectory(true);
  var qualifications = AuditorsIndex_GetQualifications(true);

  var out = {
    ok: !!directory.ok && !!qualifications.ok,
    durationMs: new Date().getTime() - started,
    auditorCount: directory.count || 0,
    qualificationRows: qualifications.count || 0,
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

function RUN_AUDITORSINDEX_CACHE_HIT_TEST() {
  AUDITORSINDEX_EXEC_CACHE.directory = null;
  AUDITORSINDEX_EXEC_CACHE.qualifications = null;

  var started = new Date().getTime();

  var directory = AuditorsIndex_GetDirectory(false);
  var qualifications = AuditorsIndex_GetQualifications(false);

  var out = {
    ok: !!directory.ok && !!qualifications.ok,
    durationMs: new Date().getTime() - started,
    auditorCount: directory.count || 0,
    qualificationRows: qualifications.count || 0,
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

function RUN_AUDITORSINDEX_CLEARCACHE() {
  return AuditorsIndex_ClearCache();
}
