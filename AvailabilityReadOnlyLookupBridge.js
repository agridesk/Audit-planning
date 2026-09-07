/***********************************************************************
 * FILE: AvailabilityReadOnlyLookupBridge.gs
 * PURPOSE: read-only helper layer for availability-adjacent lookups.
 * No writeBack, no validate, no collision logic changes.
 ***********************************************************************/

var AVLOOKUP_CACHE_NS = 'availability_lookup';
var AVLOOKUP_TTL = 900;

var AVLOOKUP_EXEC = {
  auditors: null,
  companies: null,
  locations: null
};

function AVLOOKUP_ClearCache() {
  AVLOOKUP_EXEC.auditors = null;
  AVLOOKUP_EXEC.companies = null;
  AVLOOKUP_EXEC.locations = null;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace(AVLOOKUP_CACHE_NS);
    }
  } catch (e) {}

  return { ok: true };
}

function AVLOOKUP_GetAuditors(forceRefresh) {
  if (!forceRefresh && AVLOOKUP_EXEC.auditors) return AVLOOKUP_EXEC.auditors;

  var key = 'auditors:v1';

  if (!forceRefresh) {
    var cached = AVLOOKUP_cacheGet_(key);
    if (cached && cached.ok) {
      AVLOOKUP_EXEC.auditors = cached;
      return cached;
    }
  }

  var out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: 0,
    byEmail: {},
    list: []
  };

  try {
    if (typeof AuditorsIndex_GetDirectory === 'function') {
      var dir = AuditorsIndex_GetDirectory(false);
      if (dir && dir.ok) {
        out.byEmail = dir.byEmail || {};
        out.list = dir.list || [];
        out.count = dir.count || out.list.length || 0;
        AVLOOKUP_EXEC.auditors = out;
        AVLOOKUP_cachePut_(key, out);
        return out;
      }
    }
  } catch (e1) {
    out.ok = false;
    out.error = String(e1 && e1.message ? e1.message : e1);
  }

  AVLOOKUP_EXEC.auditors = out;
  return out;
}

function AVLOOKUP_GetCompanies(forceRefresh) {
  if (!forceRefresh && AVLOOKUP_EXEC.companies) return AVLOOKUP_EXEC.companies;

  var key = 'companies:v1';

  if (!forceRefresh) {
    var cached = AVLOOKUP_cacheGet_(key);
    if (cached && cached.ok) {
      AVLOOKUP_EXEC.companies = cached;
      return cached;
    }
  }

  var out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: 0,
    byUid: {},
    list: []
  };

  try {
    if (typeof CompaniesIndex_GetUidNameIndex === 'function') {
      var idx = CompaniesIndex_GetUidNameIndex(false);
      if (idx && idx.ok) {
        out.byUid = idx.byUid || {};
        out.list = idx.list || [];
        out.count = idx.count || out.list.length || 0;
        AVLOOKUP_EXEC.companies = out;
        AVLOOKUP_cachePut_(key, out);
        return out;
      }
    }
  } catch (e1) {
    out.ok = false;
    out.error = String(e1 && e1.message ? e1.message : e1);
  }

  AVLOOKUP_EXEC.companies = out;
  return out;
}

function AVLOOKUP_GetLocations(forceRefresh) {
  if (!forceRefresh && AVLOOKUP_EXEC.locations) return AVLOOKUP_EXEC.locations;

  var key = 'locations:v1';

  if (!forceRefresh) {
    var cached = AVLOOKUP_cacheGet_(key);
    if (cached && cached.ok) {
      AVLOOKUP_EXEC.locations = cached;
      return cached;
    }
  }

  var out = {
    ok: true,
    generatedAt: new Date().toISOString(),
    count: 0,
    byUid: {}
  };

  try {
    if (typeof CompaniesIndex_GetLocationSummaryIndex === 'function') {
      var idx = CompaniesIndex_GetLocationSummaryIndex(false);
      if (idx && idx.ok) {
        out.byUid = idx.byUid || {};
        out.count = idx.count || Object.keys(out.byUid).length || 0;
        AVLOOKUP_EXEC.locations = out;
        AVLOOKUP_cachePut_(key, out);
        return out;
      }
    }
  } catch (e1) {
    out.ok = false;
    out.error = String(e1 && e1.message ? e1.message : e1);
  }

  AVLOOKUP_EXEC.locations = out;
  return out;
}

function AVLOOKUP_ResolveAuditorEmail(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (s.toLowerCase().indexOf('@') > 0) return s.toLowerCase();

  try {
    if (typeof AuditorsIndex_ResolveEmail === 'function') {
      return AuditorsIndex_ResolveEmail(s) || '';
    }
  } catch (e) {}

  var dir = AVLOOKUP_GetAuditors(false);
  var key = AVLOOKUP_normKey_(s);
  for (var i = 0; i < (dir.list || []).length; i++) {
    var item = dir.list[i] || {};
    if (AVLOOKUP_normKey_(item.name) === key) return String(item.email || '').toLowerCase();
  }
  return '';
}

function AVLOOKUP_GetCompanyName(companyUid) {
  var uid = String(companyUid || '').trim();
  if (!uid) return '';

  try {
    if (typeof CompaniesIndex_GetCompanyName === 'function') {
      return CompaniesIndex_GetCompanyName(uid) || '';
    }
  } catch (e) {}

  var companies = AVLOOKUP_GetCompanies(false);
  return companies.byUid && companies.byUid[uid] ? String(companies.byUid[uid].companyName || '') : '';
}

function AVLOOKUP_GetCompanyLocationSummary(companyUid) {
  var uid = String(companyUid || '').trim();
  if (!uid) return null;

  try {
    if (typeof CompaniesIndex_GetLocationSummary === 'function') {
      return CompaniesIndex_GetLocationSummary(uid);
    }
  } catch (e) {}

  var locations = AVLOOKUP_GetLocations(false);
  return locations.byUid && locations.byUid[uid] ? locations.byUid[uid] : null;
}

function AVLOOKUP_cacheGet_(key) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(AVLOOKUP_CACHE_NS, key);
    }
  } catch (e) {}
  return null;
}

function AVLOOKUP_cachePut_(key, value) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(AVLOOKUP_CACHE_NS, key, value, AVLOOKUP_TTL);
    }
  } catch (e) {}
}

function AVLOOKUP_normKey_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function RUN_AVLOOKUP_CACHE_WARMUP() {
  AVLOOKUP_ClearCache();

  var started = new Date().getTime();
  var auditors = AVLOOKUP_GetAuditors(true);
  var companies = AVLOOKUP_GetCompanies(true);
  var locations = AVLOOKUP_GetLocations(true);

  var out = {
    ok: !!auditors.ok && !!companies.ok && !!locations.ok,
    durationMs: new Date().getTime() - started,
    auditors: auditors.count || 0,
    companies: companies.count || 0,
    locations: locations.count || 0,
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

function RUN_AVLOOKUP_CACHE_HIT_TEST() {
  AVLOOKUP_EXEC.auditors = null;
  AVLOOKUP_EXEC.companies = null;
  AVLOOKUP_EXEC.locations = null;

  var started = new Date().getTime();
  var auditors = AVLOOKUP_GetAuditors(false);
  var companies = AVLOOKUP_GetCompanies(false);
  var locations = AVLOOKUP_GetLocations(false);

  var out = {
    ok: !!auditors.ok && !!companies.ok && !!locations.ok,
    durationMs: new Date().getTime() - started,
    auditors: auditors.count || 0,
    companies: companies.count || 0,
    locations: locations.count || 0,
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

function RUN_AVLOOKUP_DIAGNOSTICS() {
  return RUN_AVLOOKUP_CACHE_HIT_TEST();
}

function RUN_AVLOOKUP_CLEARCACHE() {
  return AVLOOKUP_ClearCache();
}
