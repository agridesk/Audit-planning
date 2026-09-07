// BUILD: AuditPlanningCompanyLocations_20260512_LOCATIONS_JSON_KEY_FIX
// Extracted from ManagerPlanningV5Backend.js. No behavior changes.

function _mp_normLocationCode_(code) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  if (c === 'HQ') return 'HQ';
  var m1 = c.match(/^S([1-4])$/);
  if (m1) return 'S' + m1[1];
  var m2 = c.match(/^SEC[-_ ]?(\d+)$/);
  if (m2) {
    var n = Number(m2[1]);
    if (isFinite(n) && n >= 1 && n <= 4) return 'S' + n;
  }
  return '';
}

function _mp_parseLocationsJson_(raw, fallbackName, fallbackGps) {
  var arr = [];
  try {
    var parsed = JSON.parse(String(raw || '').trim() || '[]');
    if (Array.isArray(parsed)) arr = parsed;
  } catch(e) {
    arr = [];
  }

  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i] || {};
    var code = _mp_normLocationCode_(item.code || item.key || item.locationCode || item.slot || item.id);
    if (!code || seen[code]) continue;
    var active = !(String(item.active).toLowerCase() === 'false' || item.active === false || String(item.active).trim() === '0');
    if (!active) continue;
    seen[code] = true;
    out.push({
      code: code,
      name: String(item.name || item.label || item.locationName || item.title || code || '').trim(),
      gps: String(item.gps || item.gpsData || item.gps_data || item.coordinates || '').trim(),
      comment: String(item.comment || item.comments || item.note || '').trim(),
      active: true
    });
  }

  if (!seen.HQ) {
    out.unshift({
      code: 'HQ',
      name: String(fallbackName || 'HQ').trim() || 'HQ',
      gps: String(fallbackGps || '').trim(),
      comment: '',
      active: true
    });
  }

  function ord_(code) {
    if (code === 'HQ') return 0;
    var n = Number(String(code || '').replace(/^S/, ''));
    return isFinite(n) ? n : 99;
  }

  out.sort(function(a,b){ return ord_(a.code) - ord_(b.code); });
  return out.slice(0, 5);
}

function _mp_parseSlotTemplatesLocations_(raw, fallbackName, fallbackGps) {
  var obj = null;
  try {
    obj = JSON.parse(String(raw || '').trim() || '{}');
  } catch(e) {
    obj = null;
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.locations)) {
    return [];
  }
  return _mp_parseLocationsJson_(JSON.stringify(obj.locations || []), fallbackName, fallbackGps);
}

function _mp_chooseBestCompanyRow_(data, colUid, colName, colLoc, colLocationsJson, colSlotTemplates, uid, nameKey, locKey) {
  var byUid = null;
  var exactNameLoc = null;
  var exactNameAny = null;
  var bestWithJson = null;
  var bestAny = null;

  function hasRichLocations_(row) {
    if (!row) return false;
    var rawJson = colLocationsJson >= 0 ? _mp_safeStr_(row[colLocationsJson]) : '';
    var rawTpl = colSlotTemplates >= 0 ? _mp_safeStr_(row[colSlotTemplates]) : '';
    return !!(rawJson || rawTpl);
  }

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    if (!row) continue;

    if (!byUid && uid && colUid >= 0 && _mp_safeStr_(row[colUid]) === uid) {
      byUid = row;
      break;
    }

    if (!nameKey || colName < 0) continue;
    var rowName = _mp_safeStr_(row[colName]);
    if (rowName !== nameKey) continue;

    if (!bestAny) bestAny = row;
    if (!bestWithJson && hasRichLocations_(row)) bestWithJson = row;

    var rowLoc = colLoc >= 0 ? _mp_safeStr_(row[colLoc]) : '';
    if (locKey && rowLoc && rowLoc === locKey) {
      if (!exactNameLoc) exactNameLoc = row;
      if (hasRichLocations_(row)) {
        exactNameLoc = row;
        break;
      }
    }

    if (!exactNameAny) exactNameAny = row;
  }

  return byUid || exactNameLoc || bestWithJson || exactNameAny || bestAny || null;
}

// - Companies is source of truth
// - Audit planning stores Company_UID (column AM)
// - Companies stores Company_UID (column T)
// - Empty constraint fields mean: NO restriction
// ===========================

function _mp_normHeader_(h) {
  return String(h || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

function _mp_findCol_(headers, candidates) {
  // candidates: array of strings (exact or partial intent)
  var normHeaders = headers.map(_mp_normHeader_);
  var normCands = (candidates || []).map(_mp_normHeader_);

  // 1) exact normalized match
  for (var i = 0; i < normHeaders.length; i++) {
    for (var j = 0; j < normCands.length; j++) {
      if (normHeaders[i] && normHeaders[i] === normCands[j]) return i;
    }
  }
  // 2) contains match (robust against messy headers)
  for (var i2 = 0; i2 < normHeaders.length; i2++) {
    for (var j2 = 0; j2 < normCands.length; j2++) {
      var nh = normHeaders[i2];
      var nc = normCands[j2];
      if (nh && nc && (nh.indexOf(nc) >= 0 || nc.indexOf(nh) >= 0)) return i2;
    }
  }
  return -1;
}

function _mp_safeStr_(v) { return String(v == null ? "" : v).trim(); }

function _mp_getCompanyConstraints_(ss, auditCompany, auditLocation, companyUid) {
  var pack = __mp_getSheetDataPersistCached_(ss, "Companies", 300);
  var data = pack.data;
  if (!data || data.length < 2) return { matched:false, companyUid: _mp_safeStr_(companyUid), timeZone:"", blockedWeekdays:"", timeWindow:"", comments:"", locations:[] };
  var hdr = pack.hdr;

  var cols = __mp_getCached_('COMP_COLS', function(){
    return {
      colUid:  _mp_findCol_(hdr, ["Company_UID", "Company UID", "UID"]),
      colName: _mp_findCol_(hdr, ["Company", "Company name", "Name"]),
      colLoc:  _mp_findCol_(hdr, ["Location", "Site", "Locatie"]),
      colTz:   _mp_findCol_(hdr, ["Time zone", "Timezone", "Time_zone"]),
      colDays: _mp_findCol_(hdr, ["Audit planning limitations days", "Planning limitations days", "Blocked weekdays"]),
      colHours:_mp_findCol_(hdr, ["Audit planning limitations hours", "Planning limitations hours", "Time window"]),
      colGps:  _mp_findCol_(hdr, ["GPS-data", "GPS data", "GPS"]),
      colRegion: _mp_findCol_(hdr, ["Region", "REGION"]),
      colComments: _mp_findCol_(hdr, ["Comments", "Comment"]),
      colLocCount: _mp_findCol_(hdr, ["Locations_to_plan", "Locations to plan", "Locations count", "Locations"]),
      colLocationsJson: _mp_findCol_(hdr, ["Locations_JSON", "Locations JSON"]),
      colSlotTemplates: _mp_findCol_(hdr, ["Slot_Templates", "Slot Templates"])
    };
  });
  var colUid  = cols.colUid;
  var colName = cols.colName;
  var colLoc  = cols.colLoc;
  var colTz   = cols.colTz;
  var colDays = cols.colDays;
  var colHours= cols.colHours;
  var colGps = cols.colGps;
  var colRegion = cols.colRegion;
  var colComments = cols.colComments;
  var colLocCount = cols.colLocCount;
  var colLocationsJson = cols.colLocationsJson;
  var colSlotTemplates = cols.colSlotTemplates;

  var uid = _mp_safeStr_(companyUid);
  var nameKey = _mp_safeStr_(auditCompany);
  var locKey  = _mp_safeStr_(auditLocation);

  var bestRow = _mp_chooseBestCompanyRow_(data, colUid, colName, colLoc, colLocationsJson, colSlotTemplates, uid, nameKey, locKey);

  if (!bestRow) return { matched:false, companyUid: uid, timeZone:"", blockedWeekdays:"", timeWindow:"", comments:"", locations:[] };

  var hqNameLegacy = colLoc >= 0 ? _mp_safeStr_(bestRow[colLoc]) : '';
  var hqGpsLegacy = colGps >= 0 ? _mp_safeStr_(bestRow[colGps]) : '';
  var rawLocationsJson = colLocationsJson >= 0 ? _mp_safeStr_(bestRow[colLocationsJson]) : '';
  var rawSlotTemplates = colSlotTemplates >= 0 ? _mp_safeStr_(bestRow[colSlotTemplates]) : '';
  var locations = _mp_parseLocationsJson_(rawLocationsJson, hqNameLegacy || auditLocation || 'HQ', hqGpsLegacy);
  if (!locations || !locations.length || (locations.length === 1 && !rawLocationsJson && rawSlotTemplates)) {
    locations = _mp_parseSlotTemplatesLocations_(rawSlotTemplates, hqNameLegacy || auditLocation || 'HQ', hqGpsLegacy);
  }
  if (!locations || !locations.length) {
    locations = _mp_parseLocationsJson_('', hqNameLegacy || auditLocation || 'HQ', hqGpsLegacy);
  }
  var hqLoc = null;
  for (var li = 0; li < locations.length; li++) {
    if (String((locations[li] || {}).code || '') === 'HQ') { hqLoc = locations[li]; break; }
  }
  var hqName = hqLoc && _mp_safeStr_(hqLoc.name) ? _mp_safeStr_(hqLoc.name) : hqNameLegacy;
  var hqGps = hqLoc && _mp_safeStr_(hqLoc.gps) ? _mp_safeStr_(hqLoc.gps) : hqGpsLegacy;
  var explicitLocCount = (function(){
    if (colLocCount < 0) return null;
    var v = bestRow[colLocCount];
    var n = Number(v);
    if (!isFinite(n) || n < 1) return null;
    return Math.round(n);
  })();
  var derivedLocCount = locations && locations.length ? locations.length : 1;
  var finalLocCount = explicitLocCount || derivedLocCount || 1;

  return {
    matched: true,
    companyUid: uid || (colUid>=0 ? _mp_safeStr_(bestRow[colUid]) : ""),
    timeZone:   colTz   >= 0 ? _mp_safeStr_(bestRow[colTz])   : "",
    blockedWeekdays: colDays >= 0 ? _mp_safeStr_(bestRow[colDays]) : "",
    comments: colComments >= 0 ? _mp_safeStr_(bestRow[colComments]) : "",
    hqName: hqName || 'HQ',
    hqGps: hqGps,
    region: colRegion >= 0 ? _mp_safeStr_(bestRow[colRegion]) : "",
    locationsCount: finalLocCount,
    locations: locations,
    locationsJson: rawLocationsJson,
    slotTemplates: {
      locations: (locations || []).map(function(loc){
        return { code: loc.code, label: loc.name, gps: loc.gps, comment: loc.comment };
      }),
      slots: []
    },
    timeWindow: (function(){ var _raw = (colHours>=0 ? _mp_safeStr_(bestRow[colHours]) : ""); var _p = V5_parseCompanyTimeWindow_(_raw); return _p ? _p.normalized : ""; })()
  };
}

function _mp_getAuditorBlockedWeekdays_(ss, auditorEmail) {
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  if (!auditorEmail) return "";

  // PERF-PHASE1: route through persist cache (was raw getDataRange every call)
  var pack = __mp_getSheetDataPersistCached_(ss, "Auditors", 300);
  var data = pack.data || [];
  if (!data || data.length < 2) return "";

  var hdr = pack.hdr || data[0] || [];

  var colEmail  = _mp_findCol_(hdr, ["E-mail", "Email", "E mail"]);
  var colActive = _mp_findCol_(hdr, ["Active"]);
  var colBlock  = _mp_findCol_(hdr, ["Blocked weekdays", "Default blocked weekdays", "Blocked weekdays (default)"]);

  if (colEmail < 0 || colBlock < 0) return "";

  for (var r = 1; r < data.length; r++) {
    var rowEmail = String(data[r][colEmail] || '').trim().toLowerCase();
    if (rowEmail !== auditorEmail) continue;

    if (colActive >= 0) {
      var act = String(data[r][colActive] || '').trim().toUpperCase();
      if (act !== "YES") return "";
    }
    return String(data[r][colBlock] || "").trim();
  }
  return "";
}


function V5_bootstrapCompanyUIDs() {
  __mp_resetExecCache_();
  __mp_invalidatePersistCaches_();
  // One-time helper:
  // - fills missing Companies.Company_UID
  // - backfills Audit planning.Company_UID when possible by exact company name (+location optional)
  var ss = SpreadsheetApp.getActive();
  var shC = ss.getSheetByName("Companies");
  var shA = ss.getSheetByName("Audit planning");
  if (!shC || !shA) throw new Error("Missing Companies and/or Audit planning sheet");

  // Companies
  var dC = shC.getDataRange().getValues();
  var hC = dC[0];
  var cUid = _mp_findCol_(hC, ["Company_UID", "Company UID", "UID"]);
  var cName= _mp_findCol_(hC, ["Company", "Company name", "Name"]);
  var cLoc = _mp_findCol_(hC, ["Location", "Site", "Locatie"]);
  if (cUid < 0) throw new Error("Companies: missing Company_UID column");
  if (cName < 0) throw new Error("Companies: missing Company column");

  // Build index by (Company|Location)
  var map = {};
  for (var r=1; r<dC.length; r++) {
    var uid = _mp_safeStr_(dC[r][cUid]);
    if (!uid) {
      uid = Utilities.getUuid();
      shC.getRange(r+1, cUid+1).setValue(uid);
    }
    var key = _mp_safeStr_(dC[r][cName]) + "|" + (cLoc>=0 ? _mp_safeStr_(dC[r][cLoc]) : "");
    map[key] = uid;
  }

  // Audit planning
  var dA = shA.getDataRange().getValues();
  var hA = dA[0];
  var aUid = _mp_findCol_(hA, ["Company_UID", "Company UID", "UID"]);
  var aName= _mp_findCol_(hA, ["Company"]);
  var aLoc = _mp_findCol_(hA, ["Location"]);
  if (aUid < 0) throw new Error("Audit planning: missing Company_UID column");
  if (aName < 0) throw new Error("Audit planning: missing Company column");

  for (var ra=1; ra<dA.length; ra++) {
    var cur = _mp_safeStr_(dA[ra][aUid]);
    if (cur) continue;
    var keyA = _mp_safeStr_(dA[ra][aName]) + "|" + (aLoc>=0 ? _mp_safeStr_(dA[ra][aLoc]) : "");
    var uid2 = map[keyA];
    if (uid2) shA.getRange(ra+1, aUid+1).setValue(uid2);
  }
}


/**
 * Update Companies!Locations_to_plan (column R) for a given company UID.
 * Performance: one Companies read, one single-cell write.
 */
function v5_setCompanyLocationsToPlan(companyUid, locationsToPlan){
  try{
    var uid = _mp_safeStr_(companyUid);
    var n = Number(locationsToPlan);
    if (!uid) return {success:false, message:"Missing companyUid"};
    if (!isFinite(n) || n < 1) n = 1;
    if (n > 5) n = 5;
    n = Math.round(n);

    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName("Companies");
    if (!sh) return {success:false, message:"Companies sheet not found"};

    var data = sh.getDataRange().getValues();
    if (!data || data.length < 2) return {success:false, message:"Companies empty"};

    var hdr = data[0];
    var colUid = _mp_findCol_(hdr, ["Company_UID","Company UID","UID"]);
    var colLocCount = _mp_findCol_(hdr, ["Locations_to_plan","Locations to plan","Locations count","Locations"]);
    if (colUid < 0) return {success:false, message:"Company UID column not found"};
    if (colLocCount < 0) return {success:false, message:"Locations_to_plan column not found"};

    var rowIndex = -1;
    for (var r=1; r<data.length; r++){
      if (_mp_safeStr_(data[r][colUid]) === uid){ rowIndex = r; break; }
    }
    if (rowIndex < 0) return {success:false, message:"Company UID not found: "+uid};

    sh.getRange(rowIndex+1, colLocCount+1).setValue(n);
    // PERF-PHASE1: invalidate Companies persist cache after write (was missing)
    __mp_invalidatePersistCaches_(['Companies']);
    return {success:true, locationsCount:n};
  }catch(e){
    return {success:false, message:String(e && e.message ? e.message : e), stack:String(e && e.stack ? e.stack : "")};
  }
}



/***********************************************************************
 * SELECTED TOOLKIT COMPANY CONTEXT CACHE — 2026-04-27
 * Purpose:
 * - Only cache the company/location context for the audit selected when Plan is clicked.
 * - Central cache owner remains CacheService.gs / AUDIT_CACHE.
 * - No full Companies warmup.
 * - Read-only; no planning/status/availability writes.
 ***********************************************************************/
function _mp_toolkitCompanyContextCachePayload_(auditId, auditCompany, auditLocation, companyUid, constraints, source) {
  return {
    ok: true,
    auditId: _mp_safeStr_(auditId),
    company: _mp_safeStr_(auditCompany),
    location: _mp_safeStr_(auditLocation),
    companyUid: _mp_safeStr_(companyUid || (constraints && constraints.companyUid) || ''),
    generatedAt: new Date().toISOString(),
    source: source || 'build',
    companyConstraints: constraints || null
  };
}

function _mp_getCachedToolkitCompanyContext_(auditId, auditCompany, companyUid) {
  auditId = _mp_safeStr_(auditId);
  if (!auditId) return null;
  try {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.getToolkitCompanyContext !== 'function') return null;
    var cached = AUDIT_CACHE.getToolkitCompanyContext(auditId);
    if (!cached || !cached.companyConstraints) return null;

    var wantUid = _mp_safeStr_(companyUid);
    var gotUid = _mp_safeStr_(cached.companyUid || (cached.companyConstraints && cached.companyConstraints.companyUid));
    if (wantUid && gotUid && wantUid !== gotUid) return null;

    var wantCompany = _mp_safeStr_(auditCompany).toLowerCase();
    var gotCompany = _mp_safeStr_(cached.company).toLowerCase();
    if (wantCompany && gotCompany && wantCompany !== gotCompany) return null;

    cached.companyConstraints.__cacheHit = true;
    cached.companyConstraints.__cacheSource = 'AUDIT_CACHE.toolkit_company';
    return cached.companyConstraints;
  } catch(e) {
    return null;
  }
}

function _mp_putCachedToolkitCompanyContext_(auditId, auditCompany, auditLocation, companyUid, constraints, source) {
  auditId = _mp_safeStr_(auditId);
  if (!auditId || !constraints) return false;
  try {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.putToolkitCompanyContext !== 'function') return false;
    return AUDIT_CACHE.putToolkitCompanyContext(
      auditId,
      _mp_toolkitCompanyContextCachePayload_(auditId, auditCompany, auditLocation, companyUid, constraints, source || 'put'),
      (AUDIT_CACHE.TTL && AUDIT_CACHE.TTL.TOOLKIT_COMPANY) ? AUDIT_CACHE.TTL.TOOLKIT_COMPANY : 900
    );
  } catch(e) {
    return false;
  }
}

function _mp_getCompanyConstraintsForToolkitAudit_(ss, auditId, auditCompany, auditLocation, companyUid) {
  var cached = _mp_getCachedToolkitCompanyContext_(auditId, auditCompany, companyUid);
  if (cached) return cached;

  var built = _mp_companyConstraintsCached_(ss, auditCompany, auditLocation, companyUid);
  _mp_putCachedToolkitCompanyContext_(auditId, auditCompany, auditLocation, companyUid, built, 'getPlanningContextV5');
  return built;
}

function _mp_prefetchToolkitCompanyContextForAudit_(auditId) {
  auditId = _mp_safeStr_(auditId);
  if (!auditId) return { success:false, message:'Missing auditId' };

  var started = new Date().getTime();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ap = ss.getSheetByName('Audit planning');
  if (!ap) return { success:false, message:"Missing sheet 'Audit planning'" };

  var values = ap.getDataRange().getValues();
  if (!values || values.length < 2) return { success:false, message:'Audit planning is empty' };
  var hdr = values[0] || [];
  var colAuditId = _mp_findCol_(hdr, ['Audit ID']);
  var colCompany = _mp_findCol_(hdr, ['Company']);
  var colLocation = _mp_findCol_(hdr, ['Location']);
  var colCompanyUid = _mp_findCol_(hdr, ['Company_UID', 'Company UID', 'UID']);
  if (colAuditId < 0) return { success:false, message:"Missing 'Audit ID' column" };

  var row = null;
  for (var r = 1; r < values.length; r++) {
    if (_mp_safeStr_(values[r][colAuditId]) === auditId) {
      row = values[r];
      break;
    }
  }
  if (!row) return { success:false, message:'Audit not found: ' + auditId };

  var company = colCompany >= 0 ? _mp_safeStr_(row[colCompany]) : '';
  var location = colLocation >= 0 ? _mp_safeStr_(row[colLocation]) : '';
  var companyUid = colCompanyUid >= 0 ? _mp_safeStr_(row[colCompanyUid]) : '';

  var cachedBefore = _mp_getCachedToolkitCompanyContext_(auditId, company, companyUid);
  if (cachedBefore) {
    return {
      success:true,
      auditId:auditId,
      company:company,
      companyUid:companyUid || cachedBefore.companyUid || '',
      cacheHit:true,
      durationMs:new Date().getTime() - started
    };
  }

  var constraints = _mp_companyConstraintsCached_(ss, company, location, companyUid);
  var stored = _mp_putCachedToolkitCompanyContext_(auditId, company, location, companyUid, constraints, 'planClickPrefetch');
  return {
    success:true,
    auditId:auditId,
    company:company,
    companyUid:companyUid || (constraints && constraints.companyUid) || '',
    matched: !!(constraints && constraints.matched),
    locationsCount: constraints && constraints.locationsCount,
    cacheStored: stored,
    cacheHit:false,
    durationMs:new Date().getTime() - started
  };
}

function PREFETCH_TOOLKIT_COMPANY_CONTEXT(auditId) {
  return _mp_prefetchToolkitCompanyContextForAudit_(auditId);
}

function RUN_PREFETCH_TOOLKIT_COMPANY_CONTEXT(auditId) {
  return _mp_prefetchToolkitCompanyContextForAudit_(auditId);
}
