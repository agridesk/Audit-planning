// CompaniesBackend_PRELOAD_FULL_FIXED.gs
// Central backend for Companies UI preload + save.
// Owner: Companies masterdata only. No audit/planning logic here.

function getCompaniesDataset() {
  var sh = COMP_getCompaniesSheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return { list: [], detailsByUid: {} };

  var headers = COMP_getHeaders_(sh);
  if (lastRow < 2) return { list: [], detailsByUid: {} };

  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var list = [];
  var detailsByUid = {};

  values.forEach(function(row, i) {
    if (COMP_rowIsEmpty_(row)) return;

    var rowNumber = i + 2;
    var detail = COMP_buildDetailFromRow_(headers, row, rowNumber);
    var uid = String(detail.uid || '').trim();
    if (!uid) uid = 'ROW_' + rowNumber;
    detail.uid = uid;

    detailsByUid[uid] = detail;
    list.push({
      uid: uid,
      company: detail.company || '',
      status: detail.status || '',
      country: detail.country || '',
      locations: String(detail.locationsToPlan || '')
    });
  });

  list.sort(function(a, b) {
    return String(a.company || '').localeCompare(String(b.company || ''), undefined, { sensitivity: 'base' });
  });

  return {
    list: list,
    detailsByUid: detailsByUid
  };
}

function saveCompanyDetail(payload) {
  payload = payload || {};

  var sh = COMP_getCompaniesSheet_();
  var headers = COMP_getHeaders_(sh);
  var headerMap = COMP_getHeaderMap_(headers);

  var company = COMP_cleanText_(payload.company);
  if (!company) {
    return { success: false, message: 'Company is required.' };
  }

  var locations = COMP_normalizeLocations_(payload.locations);
  var hq = locations.filter(function(x) { return String(x.code || '') === 'HQ'; })[0] || { code: 'HQ', active: true, name: '', gps: '', comment: '' };
  var locationsToPlan = COMP_countActiveLocations_(locations);

  var clean = {
    uid: COMP_cleanText_(payload.uid),
    company: company,
    status: COMP_cleanText_(payload.status) || 'Active',
    managerEmail: COMP_cleanText_(payload.managerEmail),
    contactperson: COMP_cleanText_(payload.contactperson),
    contactEmail: COMP_cleanText_(payload.contactEmail),
    contactPhone: COMP_cleanText_(payload.contactPhone),
    language: COMP_cleanText_(payload.language),
    region: COMP_cleanText_(payload.region),
    country: COMP_cleanText_(payload.country),
    timeZone: COMP_cleanText_(payload.timeZone) || 'Europe/Madrid',
    days: COMP_normalizeDays_(payload.days),
    hours: COMP_normalizeHours_(payload.hours),
    comments: COMP_cleanText_(payload.comments),
    preferredAuditMonths: COMP_normalizePreferredAuditMonths_(payload.preferredAuditMonths),
    location: COMP_cleanText_(hq.name),
    gps: COMP_cleanText_(hq.gps),
    locationsToPlan: String(locationsToPlan),
    locationsJson: JSON.stringify(locations),
    slotTemplatesJson: JSON.stringify({
      locations: locations.map(function(loc){
        return {
          code: String(loc.code || ''),
          label: COMP_cleanText_(loc.name),
          gps: COMP_cleanText_(loc.gps),
          comment: COMP_cleanText_(loc.comment)
        };
      }),
      slots: []
    })
  };

  var rowNumber = COMP_findExistingRow_(sh, headers, clean.uid, company);

  if (!rowNumber) {
    rowNumber = sh.getLastRow() + 1;
    if (COMP_hasHeader_(headerMap, ['company uid', 'company_uid', 'uid'])) {
      clean.uid = clean.uid || COMP_makeUid_();
    } else if (!clean.uid) {
      clean.uid = 'ROW_' + rowNumber;
    }
  }

  if (!clean.uid && COMP_hasHeader_(headerMap, ['company uid', 'company_uid', 'uid'])) {
    clean.uid = COMP_makeUid_();
  }

  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['company uid', 'company_uid', 'uid'], clean.uid);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['company'], clean.company);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['status'], clean.status);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['contactperson'], clean.contactperson);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['contactperson e-mail', 'contactperson email'], clean.contactEmail);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['contactperson phone'], clean.contactPhone);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['region'], clean.region);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['country'], clean.country);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['time zone', 'timezone'], clean.timeZone);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['comments'], clean.comments);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['preferred_audit_months', 'preferred audit months'], clean.preferredAuditMonths);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['audit planning limitations days', 'audit planning limitations - days', 'blocked weekdays', 'days', 'less suitable days'], clean.days);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['audit planning limitations hours', 'audit planning limitations - hours', 'time window', 'hours', 'typical working hours'], clean.hours);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['language communication'], clean.language);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['manager_email', 'manager email'], clean.managerEmail);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['location'], clean.location);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['gps-data', 'gps data', 'gps'], clean.gps);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['locations_to_plan', 'locations to plan'], clean.locationsToPlan);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['locations_json', 'locations json'], clean.locationsJson);
  COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, ['slot_templates', 'slot templates'], clean.slotTemplatesJson);

  // δ9 (2026-05-03): Companies row mutated → evict persist + MP_CC_V1 cache
  // both uid-key and NM-key. Without this, _mp_companyConstraintsCached_ readers
  // serve stale constraints up to 300s after edit (manager sees old hours/days).
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_(['Companies']);
    }
    if (typeof _mp_invalidateCompanyConstraintsCache_ === 'function') {
      _mp_invalidateCompanyConstraintsCache_(clean.uid, clean.company, clean.location);
    }
  } catch (_e9) {
    try { Logger.log('[δ9][CompaniesBackend.saveCompanyDetail] invalidate failed: ' + _e9); } catch (_) {}
  }

  return {
    success: true,
    uid: clean.uid,
    rowNumber: rowNumber,
    message: 'Saved'
  };
}

function COMP_getCompaniesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Companies');
  if (!sh) throw new Error('Companies sheet not found.');
  return sh;
}

function COMP_getHeaders_(sh) {
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) return [];
  return sh.getRange(1, 1, 1, lastCol).getValues()[0];
}

function COMP_getHeaderMap_(headers) {
  var map = {};
  headers.forEach(function(h, i) {
    var key = COMP_normHeader_(h);
    if (key) map[key] = i + 1;
  });
  return map;
}

function COMP_normHeader_(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function COMP_hasHeader_(headerMap, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    if (headerMap[COMP_normHeader_(aliases[i])]) return true;
  }
  return false;
}

function COMP_getByAliases_(headerMap, row, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = headerMap[COMP_normHeader_(aliases[i])];
    if (idx) return row[idx - 1];
  }
  return '';
}

function COMP_writeIfHeaderExists_(sh, headerMap, rowNumber, aliases, value) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = headerMap[COMP_normHeader_(aliases[i])];
    if (idx) {
      sh.getRange(rowNumber, idx).setValue(value);
      return true;
    }
  }
  return false;
}

function COMP_buildDetailFromRow_(headers, row, rowNumber) {
  var map = COMP_getHeaderMap_(headers);
  var uid = COMP_cleanText_(COMP_getByAliases_(map, row, ['company uid', 'company_uid', 'uid'])) || ('ROW_' + rowNumber);
  var locationsJsonRaw = COMP_getByAliases_(map, row, ['locations_json', 'locations json']);
  var slotTemplatesRaw = COMP_getByAliases_(map, row, ['slot_templates', 'slot templates']);
  var locations = COMP_parseLocations_(locationsJsonRaw, {
    location: COMP_getByAliases_(map, row, ['location']),
    gps: COMP_getByAliases_(map, row, ['gps-data', 'gps data', 'gps'])
  });
  if ((!locationsJsonRaw || !String(locationsJsonRaw).trim()) && slotTemplatesRaw) {
    locations = COMP_parseSlotTemplatesLocations_(slotTemplatesRaw, {
      location: COMP_getByAliases_(map, row, ['location']),
      gps: COMP_getByAliases_(map, row, ['gps-data', 'gps data', 'gps'])
    });
  }

  var detail = {
    isNew: false,
    uid: uid,
    company: COMP_cleanText_(COMP_getByAliases_(map, row, ['company'])),
    status: COMP_cleanText_(COMP_getByAliases_(map, row, ['status'])) || 'Active',
    managerEmail: COMP_cleanText_(COMP_getByAliases_(map, row, ['manager_email', 'manager email'])),
    contactperson: COMP_cleanText_(COMP_getByAliases_(map, row, ['contactperson'])),
    contactEmail: COMP_cleanText_(COMP_getByAliases_(map, row, ['contactperson e-mail', 'contactperson email'])),
    contactPhone: COMP_cleanText_(COMP_getByAliases_(map, row, ['contactperson phone'])),
    language: COMP_cleanText_(COMP_getByAliases_(map, row, ['language communication'])),
    region: COMP_cleanText_(COMP_getByAliases_(map, row, ['region'])),
    country: COMP_cleanText_(COMP_getByAliases_(map, row, ['country'])),
    timeZone: COMP_cleanText_(COMP_getByAliases_(map, row, ['time zone', 'timezone'])) || 'Europe/Madrid',
    days: COMP_cleanText_(COMP_getByAliases_(map, row, ['audit planning limitations days', 'audit planning limitations - days', 'blocked weekdays', 'days', 'less suitable days'])),
    hours: COMP_cleanText_(COMP_getByAliases_(map, row, ['audit planning limitations hours', 'audit planning limitations - hours', 'time window', 'hours', 'typical working hours'])),
    comments: COMP_cleanText_(COMP_getByAliases_(map, row, ['comments'])),
    preferredAuditMonths: COMP_cleanText_(COMP_getByAliases_(map, row, ['preferred_audit_months', 'preferred audit months'])),
    locationsToPlan: COMP_cleanText_(COMP_getByAliases_(map, row, ['locations_to_plan', 'locations to plan'])) || String(COMP_countActiveLocations_(locations)),
    locations: locations
  };

  return detail;
}

function COMP_parseLocations_(raw, fallback) {
  var fallbackRows = [
    { code: 'HQ', name: COMP_cleanText_(fallback && fallback.location), gps: COMP_cleanText_(fallback && fallback.gps), comment: '', active: true },
    { code: 'S1', name: '', gps: '', comment: '', active: false },
    { code: 'S2', name: '', gps: '', comment: '', active: false },
    { code: 'S3', name: '', gps: '', comment: '', active: false },
    { code: 'S4', name: '', gps: '', comment: '', active: false }
  ];

  var s = String(raw == null ? '' : raw).trim();
  if (!s) return fallbackRows;

  try {
    var parsed = JSON.parse(s);
    return COMP_normalizeLocations_(parsed);
  } catch (e) {
    return fallbackRows;
  }
}

function COMP_parseSlotTemplatesLocations_(raw, fallback) {
  var fallbackRows = COMP_parseLocations_('', fallback);
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return fallbackRows;
  try {
    var parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.locations)) return fallbackRows;
    return COMP_normalizeLocations_(parsed.locations.map(function(loc) {
      return {
        code: loc && loc.code,
        name: loc && (loc.name || loc.label),
        gps: loc && loc.gps,
        comment: loc && loc.comment,
        active: loc && (loc.code === 'HQ' ? true : true)
      };
    }));
  } catch (e) {
    return fallbackRows;
  }
}

function COMP_normalizeLocations_(locations) {
  var byCode = {};
  (Array.isArray(locations) ? locations : []).forEach(function(loc) {
    var code = String((loc && loc.code) || '').trim().toUpperCase();
    if (!code) return;
    if (['HQ', 'S1', 'S2', 'S3', 'S4'].indexOf(code) === -1) return;
    byCode[code] = {
      code: code,
      name: COMP_cleanText_(loc.name),
      gps: COMP_cleanText_(loc.gps),
      comment: COMP_cleanText_(loc.comment),
      active: code === 'HQ' ? true : !!loc.active
    };
  });

  return ['HQ', 'S1', 'S2', 'S3', 'S4'].map(function(code) {
    return byCode[code] || {
      code: code,
      name: '',
      gps: '',
      comment: '',
      active: code === 'HQ'
    };
  });
}

function COMP_countActiveLocations_(locations) {
  var n = (Array.isArray(locations) ? locations : []).filter(function(x) { return !!(x && x.active); }).length;
  return n < 1 ? 1 : n;
}

function COMP_rowIsEmpty_(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] == null ? '' : row[i]).trim() !== '') return false;
  }
  return true;
}

function COMP_findExistingRow_(sh, headers, uid, company) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;

  var values = sh.getRange(2, 1, lastRow - 1, sh.getLastColumn()).getValues();
  var map = COMP_getHeaderMap_(headers);
  var uidIdx = map[COMP_normHeader_('company uid')] || map[COMP_normHeader_('company_uid')] || map[COMP_normHeader_('uid')];
  var companyIdx = map[COMP_normHeader_('company')];

  var cleanUid = COMP_cleanText_(uid);
  var cleanCompany = COMP_cleanText_(company);

  if (cleanUid && /^ROW_\d+$/.test(cleanUid)) {
    var rowNumber = Number(cleanUid.replace('ROW_', ''));
    if (rowNumber >= 2 && rowNumber <= lastRow) return rowNumber;
  }

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (uidIdx && cleanUid && COMP_cleanText_(row[uidIdx - 1]) === cleanUid) return i + 2;
  }

  for (var j = 0; j < values.length; j++) {
    var row2 = values[j];
    if (companyIdx && cleanCompany && COMP_cleanText_(row2[companyIdx - 1]) === cleanCompany) return j + 2;
  }

  return 0;
}

function COMP_makeUid_() {
  return Utilities.getUuid();
}


function COMP_normalizePreferredAuditMonths_(value) {
  var allowed = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (Array.isArray(value)) {
    value = value.join(',');
  }

  var raw = String(value || '')
    .split(',')
    .map(function(x) {
      return String(x || '').trim();
    })
    .filter(Boolean);

  var seen = {};
  var out = [];

  raw.forEach(function(month) {
    var normalized =
      month.charAt(0).toUpperCase() +
      month.slice(1, 3).toLowerCase();

    if (allowed.indexOf(normalized) === -1) return;
    if (seen[normalized]) return;

    seen[normalized] = true;
    out.push(normalized);
  });

  return out.join(',');
}

function COMP_cleanText_(v) {
  return String(v == null ? '' : v).trim();
}

function COMP_normalizeDays_(days) {
  var allowed = { Mo: true, Tu: true, We: true, Th: true, Fr: true };
  var out = [];
  String(days == null ? '' : days).split(',').forEach(function(x) {
    var d = String(x || '').trim();
    if (allowed[d] && out.indexOf(d) === -1) out.push(d);
  });
  return out.join(',');
}

function COMP_normalizeHours_(hours) {
  var s = String(hours == null ? '' : hours).trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (!m) return s;
  return m[1] + '-' + m[2];
}


/***************************************************************************************
 * CompanyMap backend — read-only geo dataset
 * Source of truth: Companies.Locations_JSON + Companies.Locations_to_plan
 * BUILD: COMPANY_MAP_DIRECT_COLUMNS_C04_20260424
 ***************************************************************************************/

function CompanyMap_getConfig() {
  return {
    success: true,
    mapsApiKey: String(PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_API_KEY') || '').trim(),
    generatedAt: new Date().toISOString(),
    build: 'COMPANY_MAP_DIRECT_COLUMNS_C04_20260424'
  };
}

function getCompanyMapConfig() {
  return CompanyMap_getConfig();
}

function CompanyMap_getDataset() {
  return CompanyMap_getDataset_C04();
}

function getCompanyMapDataset() {
  return CompanyMap_getDataset_C04();
}

function getCompanyMapDataset_C04() {
  return CompanyMap_getDataset_C04();
}

function CompanyMap_getDataset_C04() {
  var sh = COMP_getCompaniesSheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var out = {
    success: true,
    build: 'COMPANY_MAP_DIRECT_COLUMNS_C04_20260424',
    generatedAt: new Date().toISOString(),
    source: 'Companies',
    entities: [],
    companies: [],
    gpsIssues: [],
    diagnostics: {
      rowsRead: 0,
      parsedLocationRows: 0,
      fallbackHqOnlyRows: 0,
      locationsToPlanMismatchRows: 0,
      validGpsEntities: 0,
      invalidGpsEntities: 0
    }
  };
  if (lastRow < 2 || lastCol < 1) return out;

  var headers = COMP_getHeaders_(sh);
  var map = COMP_getHeaderMap_(headers);
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  values.forEach(function(row, i) {
    if (COMP_rowIsEmpty_(row)) return;
    out.diagnostics.rowsRead++;

    var rowNumber = i + 2;
    var companyId = COMP_cleanText_(COMP_getByAliases_(map, row, ['company uid', 'company_uid', 'uid'])) || (row.length >= 20 ? COMP_cleanText_(row[19]) : '') || ('ROW_' + rowNumber);
    var companyName = COMP_cleanText_(COMP_getByAliases_(map, row, ['company']));
    if (!companyName) companyName = companyId;

    var status = COMP_cleanText_(COMP_getByAliases_(map, row, ['status'])) || 'Active';
    var country = COMP_cleanText_(COMP_getByAliases_(map, row, ['country']));
    var region = COMP_cleanText_(COMP_getByAliases_(map, row, ['region']));
    var locationsToPlanRaw = COMP_getByAliases_(map, row, ['locations_to_plan', 'locations to plan']);
    if (!locationsToPlanRaw && row.length >= 18) locationsToPlanRaw = row[17];
    var locationsToPlan = CompanyMap_toPositiveInt_(locationsToPlanRaw, 1);

    var rawLocations = COMP_getByAliases_(map, row, ['locations_json', 'locations json']);
    if (!rawLocations && row.length >= 22) rawLocations = row[21];
    var fallback = {
      location: COMP_getByAliases_(map, row, ['location']),
      gps: COMP_getByAliases_(map, row, ['gps-data', 'gps data', 'gps'])
    };

    var parsedPack = CompanyMap_parseLocations_C04_(rawLocations, fallback);
    var locations = CompanyMap_applyLocationsToPlan_C04_(parsedPack.locations, locationsToPlan);
    if (parsedPack.usedFallback) out.diagnostics.fallbackHqOnlyRows++;
    out.diagnostics.parsedLocationRows += locations.length;

    var activeCount = locations.filter(function(x){ return CompanyMap_locationIsActive_C04_(x, String(x.code || '').toUpperCase() === 'HQ'); }).length;
    if (locationsToPlan > activeCount) out.diagnostics.locationsToPlanMismatchRows++;

    var companyGroup = {
      companyId: companyId,
      companyName: companyName,
      status: status,
      country: country,
      region: region,
      rowNumber: rowNumber,
      locationsToPlan: locationsToPlan,
      parsedLocationsCount: locations.length,
      locations: []
    };

    locations.forEach(function(loc) {
      var code = COMP_cleanText_(loc.code).toUpperCase();
      if (!code) return;

      var label = COMP_cleanText_(loc.label || loc.name || loc.location);
      var rawGps = COMP_cleanText_(loc.gps);
      var parsedGps = CompanyMap_parseGps_(rawGps);
      var isHq = (code === 'HQ');
      var active = CompanyMap_locationIsActive_C04_(loc, isHq);
      var entityId = companyId + '|' + code;
      var mapsUrl = parsedGps.valid ? ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(parsedGps.lat + ',' + parsedGps.lng)) : '';

      var entity = {
        entityType: isHq ? 'COMPANY_HQ' : 'COMPANY_SITE',
        entityId: entityId,
        source: 'Companies',
        companyId: companyId,
        companyName: companyName,
        locationCode: code,
        locationLabel: label,
        rawGps: rawGps,
        lat: parsedGps.valid ? parsedGps.lat : null,
        lng: parsedGps.valid ? parsedGps.lng : null,
        gpsValid: parsedGps.valid,
        gpsIssue: parsedGps.issue,
        country: country,
        region: region,
        active: active,
        plannedByR: !!loc.plannedByR,
        companyStatus: status,
        comment: COMP_cleanText_(loc.comment),
        mapsUrl: mapsUrl,
        rowNumber: rowNumber,
        locationsToPlan: locationsToPlan
      };

      companyGroup.locations.push(entity);

      // Important: send every valid GPS marker to the frontend. The frontend activeOnly toggle decides visibility.
      if (entity.gpsValid) {
        out.entities.push(entity);
        out.diagnostics.validGpsEntities++;
      } else {
        out.gpsIssues.push(entity);
        out.diagnostics.invalidGpsEntities++;
      }
    });

    out.companies.push(companyGroup);
  });

  out.entities.sort(function(a, b) {
    var ac = String(a.companyName || '').localeCompare(String(b.companyName || ''), undefined, { sensitivity: 'base' });
    if (ac !== 0) return ac;
    return CompanyMap_locationSortKey_(a.locationCode) - CompanyMap_locationSortKey_(b.locationCode);
  });

  out.companies.sort(function(a, b) {
    return String(a.companyName || '').localeCompare(String(b.companyName || ''), undefined, { sensitivity: 'base' });
  });

  return out;
}

function CompanyMap_toPositiveInt_(v, fallback) {
  var n = Number(v);
  if (isFinite(n) && n > 0) return Math.floor(n);
  return fallback || 1;
}

function CompanyMap_locationSortKey_(code) {
  code = String(code || '').trim().toUpperCase();
  if (code === 'HQ') return 0;
  var m = code.match(/^S(\d+)$/);
  if (m) return Number(m[1]);
  return 999;
}

function CompanyMap_parseLocations_C04_(raw, fallback) {
  var s = String(raw == null ? '' : raw).trim();
  var fallbackRows = [
    { code: 'HQ', label: COMP_cleanText_(fallback && fallback.location), name: COMP_cleanText_(fallback && fallback.location), gps: COMP_cleanText_(fallback && fallback.gps), comment: '', active: true }
  ];
  if (!s) return { locations: fallbackRows, usedFallback: true, parseIssue: 'EMPTY_LOCATIONS_JSON' };

  try {
    var parsed = JSON.parse(s);
    var arr = [];
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.locations)) arr = parsed.locations;
    else arr = [];

    if (!arr.length) return { locations: fallbackRows, usedFallback: true, parseIssue: 'NO_LOCATIONS_ARRAY' };

    var normalized = arr.map(function(loc) {
      loc = loc || {};
      var code = COMP_cleanText_(loc.code || loc.locationCode || loc.id).toUpperCase();
      var label = COMP_cleanText_(loc.label || loc.name || loc.location || loc.title);
      return {
        code: code,
        label: label,
        name: COMP_cleanText_(loc.name || loc.label || loc.location || loc.title),
        gps: COMP_cleanText_(loc.gps || loc.GPS || loc.gpsData || loc.gps_data || loc.latLng || loc.latlong),
        comment: COMP_cleanText_(loc.comment || loc.comments || loc.note),
        active: loc.active,
        source: 'Locations_JSON'
      };
    }).filter(function(loc) {
      return !!loc.code;
    });

    if (!normalized.length) return { locations: fallbackRows, usedFallback: true, parseIssue: 'NO_VALID_LOCATION_CODES' };
    return { locations: normalized, usedFallback: false, parseIssue: '' };
  } catch (e) {
    return { locations: fallbackRows, usedFallback: true, parseIssue: 'JSON_PARSE_ERROR: ' + String(e && e.message ? e.message : e) };
  }
}

function CompanyMap_applyLocationsToPlan_C04_(locations, locationsToPlan) {
  locations = Array.isArray(locations) ? locations.slice() : [];
  var byCode = {};
  locations.forEach(function(loc) {
    var code = COMP_cleanText_(loc && loc.code).toUpperCase();
    if (!code) return;
    byCode[code] = loc;
  });

  // HARD RULE C03: Locations_to_plan activates HQ/S1/S2/S3/S4.
  // If R says 3, then HQ + S1 + S2 must be active even when older JSON has active:false.
  var order = ["HQ", "S1", "S2", "S3", "S4", "S5"];
  var max = Math.max(1, Math.min(order.length, Number(locationsToPlan || 1)));
  for (var i = 0; i < max; i++) {
    var code = order[i];
    if (!byCode[code]) {
      byCode[code] = { code: code, label: code === "HQ" ? "HQ" : "", name: code === "HQ" ? "HQ" : "", gps: "", comment: "", active: true, plannedByR: true, source: "Locations_to_plan_placeholder" };
      locations.push(byCode[code]);
    } else {
      byCode[code].active = true;
      byCode[code].plannedByR = true;
    }
  }
  locations.sort(function(a, b) {
    return CompanyMap_locationSortKey_(a && a.code) - CompanyMap_locationSortKey_(b && b.code);
  });
  return locations;
}

function CompanyMap_locationIsActive_(loc, isHq) {
  return CompanyMap_locationIsActive_C04_(loc, isHq);
}

function CompanyMap_locationIsActive_C04_(loc, isHq) {
  if (isHq) return true;
  if (loc && loc.plannedByR) return true;
  if (loc && typeof loc.active !== 'undefined' && loc.active !== null && String(loc.active).trim() !== '') {
    var s = String(loc.active).trim().toLowerCase();
    if (loc.active === true || s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'active' || s === 'x') return true;
    if (loc.active === false || s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'inactive') return false;
  }
  return !!(COMP_cleanText_(loc && (loc.gps || loc.label || loc.name || loc.location)));
}

function CompanyMap_parseLocations_(raw, fallback) {
  return CompanyMap_parseLocations_C04_(raw, fallback).locations;
}

function CompanyMap_parseGps_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { valid: false, lat: null, lng: null, issue: 'EMPTY_GPS' };
  var m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return { valid: false, lat: null, lng: null, issue: 'INVALID_FORMAT' };
  var lat = Number(m[1]);
  var lng = Number(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return { valid: false, lat: null, lng: null, issue: 'INVALID_NUMBER' };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { valid: false, lat: null, lng: null, issue: 'OUT_OF_RANGE' };
  return { valid: true, lat: lat, lng: lng, issue: '' };
}
