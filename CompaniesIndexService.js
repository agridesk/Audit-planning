/***********************************************************************
 * FILE: CompaniesIndexService.gs | BUILD: COMPANIES_INDEX_V3_20260427
 *
 * PURPOSE
 * - Lightweight read-only indexes for Companies
 * - Central source for company number/country/location summaries used by weekly notifications
 * - Avoid caching full Companies sheet as one oversized blob
 * - Uses AUDIT_CACHE when available
 * - Safe fallback to direct sheet read
 * - No planning/status/save/availability logic changes
 *
 * CACHE
 * - Namespace: companies_index
 * - Keys:
 *   - uid_name_index:v1
 *   - uid_core_index:v1
 *   - location_summary_index:v1
 *   - name_core_index:v1
 *   - manager_email lookup via uid/name
 *
 * PUBLIC RUNNERS
 * - RUN_COMPANIESINDEX_DIAGNOSTICS
 * - RUN_COMPANIESINDEX_CACHE_WARMUP
 * - RUN_COMPANIESINDEX_CACHE_HIT_TEST
 * - RUN_COMPANIESINDEX_CLEARCACHE
 ***********************************************************************/

var COMPANIESINDEX_SHEET_NAME = 'Companies';
var COMPANIESINDEX_CACHE_NAMESPACE = 'companies_index';
var COMPANIESINDEX_CACHE_TTL_SECONDS = 900;

var COMPANIESINDEX_EXEC_CACHE = {
  uidName: null,
  uidCore: null,
  locationSummary: null,
  nameCore: null
};

function CompaniesIndex_ClearCache() {
  COMPANIESINDEX_EXEC_CACHE.uidName = null;
  COMPANIESINDEX_EXEC_CACHE.uidCore = null;
  COMPANIESINDEX_EXEC_CACHE.locationSummary = null;
  COMPANIESINDEX_EXEC_CACHE.nameCore = null;

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace(COMPANIESINDEX_CACHE_NAMESPACE);
    }
  } catch (e) {}

  return { ok: true };
}

function CompaniesIndex_GetUidNameIndex(forceRefresh) {
  if (!forceRefresh && COMPANIESINDEX_EXEC_CACHE.uidName) return COMPANIESINDEX_EXEC_CACHE.uidName;

  var key = 'uid_name_index:v1';

  if (!forceRefresh) {
    var cached = CompaniesIndex_cacheGet_(key);
    if (cached && cached.ok) {
      COMPANIESINDEX_EXEC_CACHE.uidName = cached;
      return cached;
    }
  }

  var index = CompaniesIndex_buildUidNameIndex_();
  COMPANIESINDEX_EXEC_CACHE.uidName = index;
  CompaniesIndex_cachePut_(key, index);
  return index;
}

function CompaniesIndex_GetUidCoreIndex(forceRefresh) {
  if (!forceRefresh && COMPANIESINDEX_EXEC_CACHE.uidCore) return COMPANIESINDEX_EXEC_CACHE.uidCore;

  var key = 'uid_core_index:v1';

  if (!forceRefresh) {
    var cached = CompaniesIndex_cacheGet_(key);
    if (cached && cached.ok) {
      COMPANIESINDEX_EXEC_CACHE.uidCore = cached;
      return cached;
    }
  }

  var index = CompaniesIndex_buildUidCoreIndex_();
  COMPANIESINDEX_EXEC_CACHE.uidCore = index;
  CompaniesIndex_cachePut_(key, index);
  return index;
}

function CompaniesIndex_GetLocationSummaryIndex(forceRefresh) {
  if (!forceRefresh && COMPANIESINDEX_EXEC_CACHE.locationSummary) return COMPANIESINDEX_EXEC_CACHE.locationSummary;

  var key = 'location_summary_index:v1';

  if (!forceRefresh) {
    var cached = CompaniesIndex_cacheGet_(key);
    if (cached && cached.ok) {
      COMPANIESINDEX_EXEC_CACHE.locationSummary = cached;
      return cached;
    }
  }

  var index = CompaniesIndex_buildLocationSummaryIndex_();
  COMPANIESINDEX_EXEC_CACHE.locationSummary = index;
  CompaniesIndex_cachePut_(key, index);
  return index;
}


function CompaniesIndex_GetNameCoreIndex(forceRefresh) {
  if (!forceRefresh && COMPANIESINDEX_EXEC_CACHE.nameCore) return COMPANIESINDEX_EXEC_CACHE.nameCore;

  var key = 'name_core_index:v1';

  if (!forceRefresh) {
    var cached = CompaniesIndex_cacheGet_(key);
    if (cached && cached.ok) {
      COMPANIESINDEX_EXEC_CACHE.nameCore = cached;
      return cached;
    }
  }

  var core = CompaniesIndex_GetUidCoreIndex(!!forceRefresh);
  var locations = CompaniesIndex_GetLocationSummaryIndex(!!forceRefresh);
  var out = {
    ok: !!(core && core.ok),
    sheetName: COMPANIESINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byName: {},
    error: core && core.error ? core.error : ''
  };

  if (!out.ok) return out;

  Object.keys(core.byUid || {}).forEach(function(uid) {
    var rec = core.byUid[uid] || {};
    var name = CompaniesIndex_clean_(rec.companyName);
    if (!name) return;
    var loc = locations && locations.byUid ? (locations.byUid[uid] || {}) : {};
    out.byName[CompaniesIndex_nameKey_(name)] = CompaniesIndex_mergeCoreAndLocation_(rec, loc);
    out.count++;
  });

  COMPANIESINDEX_EXEC_CACHE.nameCore = out;
  CompaniesIndex_cachePut_(key, out);
  return out;
}

function CompaniesIndex_GetCompanyCoreByName(companyName) {
  var key = CompaniesIndex_nameKey_(companyName);
  if (!key) return null;
  var idx = CompaniesIndex_GetNameCoreIndex(false);
  return idx.byName && idx.byName[key] ? idx.byName[key] : null;
}

function CompaniesIndex_mergeCoreAndLocation_(core, loc) {
  core = core || {};
  loc = loc || {};
  return {
    companyUid: CompaniesIndex_clean_(core.companyUid || loc.companyUid),
    companyName: CompaniesIndex_clean_(core.companyName || loc.companyName),
    number: CompaniesIndex_clean_(core.number),
    location: CompaniesIndex_clean_(loc.hqLabel || core.location),
    country: CompaniesIndex_clean_(core.country),
    region: CompaniesIndex_clean_(core.region),
    active: CompaniesIndex_clean_(core.active),
    gpsData: CompaniesIndex_clean_(loc.hqGps || core.gpsData),
    locationsToPlan: CompaniesIndex_clean_(core.locationsToPlan),
    locationsCount: Number(loc.activeLocationsCount || loc.locationsCount || core.locationsToPlan || 1) || 1,
    contactName: CompaniesIndex_clean_(core.contactName),
    contactEmail: CompaniesIndex_clean_(core.contactEmail),
    contactPhone: CompaniesIndex_clean_(core.contactPhone),
    comments: CompaniesIndex_clean_(core.comments),
    timeZone: CompaniesIndex_clean_(core.timeZone),
    languageCommunication: CompaniesIndex_clean_(core.languageCommunication),
    managerEmail: CompaniesIndex_clean_(core.managerEmail),
    nonWorkingDays: CompaniesIndex_clean_(core.nonWorkingDays),
    hoursWorking: CompaniesIndex_clean_(core.hoursWorking),
    locationsSummary: loc || null
  };
}

function CompaniesIndex_GetCompanyName(companyUid) {
  var uid = CompaniesIndex_clean_(companyUid);
  if (!uid) return '';

  var idx = CompaniesIndex_GetUidNameIndex(false);
  var rec = idx.byUid && idx.byUid[uid] ? idx.byUid[uid] : null;
  return rec ? String(rec.companyName || '') : '';
}

function CompaniesIndex_GetCompanyCore(companyUid) {
  var uid = CompaniesIndex_clean_(companyUid);
  if (!uid) return null;

  var idx = CompaniesIndex_GetUidCoreIndex(false);
  return idx.byUid && idx.byUid[uid] ? idx.byUid[uid] : null;
}

function CompaniesIndex_GetCompanyCoreByUidOrName(companyUid, companyName) {
  var uid = CompaniesIndex_clean_(companyUid);
  if (uid) {
    var byUid = CompaniesIndex_GetCompanyCore(uid);
    if (byUid) return byUid;
  }

  var name = CompaniesIndex_clean_(companyName);
  if (name) {
    var byName = CompaniesIndex_GetCompanyCoreByName(name);
    if (byName) return byName;
  }

  return null;
}

function CompaniesIndex_GetCompanyManagerEmail(companyUid, companyName) {
  var rec = CompaniesIndex_GetCompanyCoreByUidOrName(companyUid, companyName);
  return rec ? CompaniesIndex_clean_(rec.managerEmail).toLowerCase() : '';
}

function CompaniesIndex_GetLocationSummary(companyUid) {
  var uid = CompaniesIndex_clean_(companyUid);
  if (!uid) return null;

  var idx = CompaniesIndex_GetLocationSummaryIndex(false);
  return idx.byUid && idx.byUid[uid] ? idx.byUid[uid] : null;
}

function CompaniesIndex_buildUidNameIndex_() {
  var pack = CompaniesIndex_readCompanies_();

  var out = {
    ok: pack.ok,
    sheetName: COMPANIESINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byUid: {},
    list: [],
    error: pack.error || ''
  };

  if (!pack.ok) return out;

  var idx = pack.idx;
  var rows = pack.rows;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];

    var uid = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'COMPANY_UID', 'UID'
    ]));

    var companyName = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company', 'Company name', 'Name', 'Bedrijf', 'COMPANY'
    ]));

    if (!uid || !companyName) continue;

    var rec = {
      companyUid: uid,
      companyName: companyName
    };

    out.byUid[uid] = rec;
    out.list.push(rec);
    out.count++;
  }

  out.list.sort(function(a, b) {
    return String(a.companyName || '').localeCompare(String(b.companyName || ''));
  });

  return out;
}

function CompaniesIndex_buildUidCoreIndex_() {
  var pack = CompaniesIndex_readCompanies_();

  var out = {
    ok: pack.ok,
    sheetName: COMPANIESINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byUid: {},
    error: pack.error || ''
  };

  if (!pack.ok) return out;

  var idx = pack.idx;
  var rows = pack.rows;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];

    var uid = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'COMPANY_UID', 'UID'
    ]));

    var companyName = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company', 'Company name', 'Name', 'Bedrijf', 'COMPANY'
    ]));

    if (!uid || !companyName) continue;

    var rec = {
      companyUid: uid,
      companyName: companyName,
      number: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Number', 'Company Number', 'Client Number', 'Customer Number'])),
      location: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Location', 'HQ Location', 'HQ'])),
      country: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Country', 'COUNTRY'])),
      region: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Region', 'REGION'])),
      active: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Active', 'ACTIVE'])),
      gpsData: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['GPS-data', 'GPS data', 'GPS', 'GPS HQ'])),
      locationsToPlan: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Locations_to_plan', 'Locations to plan', 'Locs', 'Locations'])),
      contactName: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Contactperson', 'Contact person', 'Contactpersoon naam', 'Contact name', 'Contact Name', 'Contact'])),
      contactEmail: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Contactperson e-mail', 'Contactperson email', 'Contact e-mail', 'Contact email', 'Contact Email', 'Contactpersoon email'])),
      contactPhone: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Contactperson phone', 'Contact phone', 'Contact Phone', 'Phone', 'Contactpersoon telefoon'])),
      nonWorkingDays: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Audit planning limitations - days', 'Audit planning limitations days', 'Non working days', 'Non-working days', 'NonWorkingDays', 'Planning limitations - days'])),
      hoursWorking: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Audit planning limitations - hours', 'Audit planning limitations hours', 'Hours working', 'Working hours', 'HoursWorking', 'Planning limitations - hours'])),
      comments: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Comments', 'Comment'])),
      timeZone: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Time zone', 'Timezone'])),
      languageCommunication: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Language communication', 'Language'])),
      managerEmail: CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, ['Manager_Email', 'Manager Email', 'Manager e-mail', 'Manager email', 'Manager']))
    };

    out.byUid[uid] = rec;
    out.count++;
  }

  return out;
}

function CompaniesIndex_buildLocationSummaryIndex_() {
  var pack = CompaniesIndex_readCompanies_();

  var out = {
    ok: pack.ok,
    sheetName: COMPANIESINDEX_SHEET_NAME,
    generatedAt: new Date().toISOString(),
    count: 0,
    byUid: {},
    error: pack.error || ''
  };

  if (!pack.ok) return out;

  var idx = pack.idx;
  var rows = pack.rows;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || [];

    var uid = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company_UID', 'Company UID', 'CompanyUID', 'COMPANY_UID', 'UID'
    ]));

    var companyName = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Company', 'Company name', 'Name', 'Bedrijf', 'COMPANY'
    ]));

    if (!uid || !companyName) continue;

    var rawJson = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Locations_JSON', 'Locations JSON', 'LocationsJSON'
    ]));

    var legacyLocation = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'Location', 'HQ Location', 'HQ'
    ]));

    var legacyGps = CompaniesIndex_clean_(CompaniesIndex_val_(row, idx, [
      'GPS-data', 'GPS data', 'GPS', 'GPS HQ'
    ]));

    var summary = CompaniesIndex_parseLocationSummary_(rawJson, legacyLocation, legacyGps);

    out.byUid[uid] = {
      companyUid: uid,
      companyName: companyName,
      locationsCount: summary.locationsCount,
      activeLocationsCount: summary.activeLocationsCount,
      hqLabel: summary.hqLabel,
      hqGps: summary.hqGps,
      hasLocationsJson: summary.hasLocationsJson,
      locations: summary.locations
    };

    out.count++;
  }

  return out;
}

function CompaniesIndex_parseLocationSummary_(rawJson, legacyLocation, legacyGps) {
  var out = {
    hasLocationsJson: false,
    locationsCount: 0,
    activeLocationsCount: 0,
    hqLabel: legacyLocation || '',
    hqGps: legacyGps || '',
    locations: []
  };

  if (!rawJson) {
    if (legacyLocation || legacyGps) {
      out.locations = [{
        code: 'HQ',
        label: legacyLocation || '',
        gps: legacyGps || '',
        comment: ''
      }];
      out.locationsCount = 1;
      out.activeLocationsCount = 1;
    }
    return out;
  }

  try {
    var parsed = JSON.parse(rawJson);
    var list = [];

    if (parsed && Array.isArray(parsed.locations)) {
      list = parsed.locations;
    } else if (Array.isArray(parsed)) {
      list = parsed;
    }

    if (!list.length) return out;

    out.hasLocationsJson = true;

    for (var i = 0; i < list.length; i++) {
      var loc = list[i] || {};
      var code = CompaniesIndex_clean_(loc.code);
      var label = CompaniesIndex_clean_(loc.label || loc.name || loc.location);
      var gps = CompaniesIndex_clean_(loc.gps || loc.GPS || loc.gpsData);
      var comment = CompaniesIndex_clean_(loc.comment || loc.notes);

      var isActive = !!(label || gps || comment);
      if (!isActive) continue;

      var item = {
        code: code || ('L' + (i + 1)),
        label: label,
        gps: gps,
        comment: comment
      };

      out.locations.push(item);
    }

    out.locationsCount = out.locations.length;
    out.activeLocationsCount = out.locations.length;

    var hq = null;
    for (var j = 0; j < out.locations.length; j++) {
      if (String(out.locations[j].code || '').toUpperCase() === 'HQ') {
        hq = out.locations[j];
        break;
      }
    }
    if (!hq && out.locations.length) hq = out.locations[0];

    if (hq) {
      out.hqLabel = hq.label || legacyLocation || '';
      out.hqGps = hq.gps || legacyGps || '';
    }

    return out;
  } catch (e) {
    if (legacyLocation || legacyGps) {
      out.locations = [{
        code: 'HQ',
        label: legacyLocation || '',
        gps: legacyGps || '',
        comment: ''
      }];
      out.locationsCount = 1;
      out.activeLocationsCount = 1;
    }
    return out;
  }
}

function CompaniesIndex_readCompanies_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(COMPANIESINDEX_SHEET_NAME);

  if (!sh) {
    return {
      ok: false,
      error: 'Missing sheet: ' + COMPANIESINDEX_SHEET_NAME,
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
    idx: CompaniesIndex_headerMap_(headers),
    rows: values.length > 1 ? values.slice(1) : []
  };
}

function CompaniesIndex_headerMap_(headers) {
  var map = {};
  headers = headers || [];

  for (var i = 0; i < headers.length; i++) {
    var raw = String(headers[i] || '').trim();
    if (!raw) continue;

    map[raw] = i;
    map[raw.toUpperCase()] = i;
    map[raw.toLowerCase()] = i;
    map[CompaniesIndex_normKey_(raw)] = i;
  }

  return map;
}

function CompaniesIndex_val_(row, idx, candidates) {
  candidates = candidates || [];

  for (var i = 0; i < candidates.length; i++) {
    var c = String(candidates[i] || '').trim();
    if (!c) continue;

    if (idx.hasOwnProperty(c)) return row[idx[c]];
    if (idx.hasOwnProperty(c.toUpperCase())) return row[idx[c.toUpperCase()]];
    if (idx.hasOwnProperty(c.toLowerCase())) return row[idx[c.toLowerCase()]];

    var norm = CompaniesIndex_normKey_(c);
    if (idx.hasOwnProperty(norm)) return row[idx[norm]];
  }

  return '';
}

function CompaniesIndex_normKey_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function CompaniesIndex_nameKey_(v) {
  return CompaniesIndex_clean_(v).toLowerCase();
}

function CompaniesIndex_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CompaniesIndex_cacheGet_(keyPart) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      return AUDIT_CACHE.get(COMPANIESINDEX_CACHE_NAMESPACE, keyPart);
    }
  } catch (e) {}
  return null;
}

function CompaniesIndex_cachePut_(keyPart, value) {
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      AUDIT_CACHE.put(COMPANIESINDEX_CACHE_NAMESPACE, keyPart, value, COMPANIESINDEX_CACHE_TTL_SECONDS);
    }
  } catch (e) {}
}

/***********************************************************************
 * RUNNERS
 ***********************************************************************/

function RUN_COMPANIESINDEX_DIAGNOSTICS() {
  var started = new Date().getTime();

  var uidName = CompaniesIndex_GetUidNameIndex(false);
  var uidCore = CompaniesIndex_GetUidCoreIndex(false);
  var locations = CompaniesIndex_GetLocationSummaryIndex(false);
  var nameCore = CompaniesIndex_GetNameCoreIndex(false);

  var out = {
    ok: !!uidName.ok && !!uidCore.ok && !!locations.ok && !!nameCore.ok,
    durationMs: new Date().getTime() - started,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    uidNameCount: uidName.count || 0,
    uidCoreCount: uidCore.count || 0,
    locationSummaryCount: locations.count || 0,
    nameCoreCount: nameCore.count || 0,
    sampleCompanies: (uidName.list || []).slice(0, 10),
    sampleLocationSummaries: Object.keys(locations.byUid || {}).slice(0, 5).map(function(uid) {
      return locations.byUid[uid];
    })
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_COMPANIESINDEX_CACHE_WARMUP() {
  CompaniesIndex_ClearCache();

  var started = new Date().getTime();

  var uidName = CompaniesIndex_GetUidNameIndex(true);
  var uidCore = CompaniesIndex_GetUidCoreIndex(true);
  var locations = CompaniesIndex_GetLocationSummaryIndex(true);
  var nameCore = CompaniesIndex_GetNameCoreIndex(true);

  var out = {
    ok: !!uidName.ok && !!uidCore.ok && !!locations.ok && !!nameCore.ok,
    durationMs: new Date().getTime() - started,
    uidNameCount: uidName.count || 0,
    uidCoreCount: uidCore.count || 0,
    locationSummaryCount: locations.count || 0,
    nameCoreCount: nameCore.count || 0,
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

function RUN_COMPANIESINDEX_CACHE_HIT_TEST() {
  COMPANIESINDEX_EXEC_CACHE.uidName = null;
  COMPANIESINDEX_EXEC_CACHE.uidCore = null;
  COMPANIESINDEX_EXEC_CACHE.locationSummary = null;
  COMPANIESINDEX_EXEC_CACHE.nameCore = null;

  var started = new Date().getTime();

  var uidName = CompaniesIndex_GetUidNameIndex(false);
  var uidCore = CompaniesIndex_GetUidCoreIndex(false);
  var locations = CompaniesIndex_GetLocationSummaryIndex(false);
  var nameCore = CompaniesIndex_GetNameCoreIndex(false);

  var out = {
    ok: !!uidName.ok && !!uidCore.ok && !!locations.ok && !!nameCore.ok,
    durationMs: new Date().getTime() - started,
    uidNameCount: uidName.count || 0,
    uidCoreCount: uidCore.count || 0,
    locationSummaryCount: locations.count || 0,
    nameCoreCount: nameCore.count || 0,
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

function RUN_COMPANIESINDEX_CLEARCACHE() {
  return CompaniesIndex_ClearCache();
}
