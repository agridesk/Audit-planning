// FILE: Toolkit_AvailabilityMonth.js
// BUILD: TOOLKIT_AVAIL_MONTH_3S_R9_VERIFY_FRESHNESS_DEFAULT_20260703
// PURPOSE:
//   R26: TDM cache-hit fast path; freshness verification is explicit-only.
//   Extracted from ManagerPlanningBackend_CORE_SPLIT_d16.js (lines 3660-4077)
//   without functional changes. Owns the Toolkit Direct-Month Availability
//   path: tdm helpers, 3-tier cache (AUDIT_CACHE / CacheService / sheet),
//   and getToolkitAvailabilityMonthDirectV5.
//
// Public functions (kept globally, no behavior change):
//   _mp_tdm_clean_, _mp_tdm_normEmail_, _mp_tdm_headerMap_,
//   _mp_tdm_getAvailabilitySheet_, _mp_tdm_fmtDate_, _mp_tdm_normTime_,
//   _mp_tdm_isSoftStatus_, _mp_tdm_isHardStatus_,
//   _mp_tdm_cacheKey_, _mp_tdm_cacheGet_, _mp_tdm_cachePut_, _mp_tdm_cacheInvalidate_,
//   _mp_calInvalidateForAuditLite_, _mp_calInvalidateForAudit_,
//   _mp_tdm_compressRows_,
//   getToolkitAvailabilityMonthDirectV5
//
// Internal callers (CORE_SPLIT lines): 912, 929, 4097, 4797, 5038.
// External callers: OpenCacheWarmer.js (typeof-guarded) + ManagerPlanningV5UI HTML
// via google.script.run (resolves at runtime, file-boundary irrelevant).
//
// Dependencies (resolved globally via GAS single-namespace):
//   _mp_parseISODate_, _mp_formatISODate_, AUDIT_CACHE,
//   MP_CAL_SHEET_GET, MP_CAL_SHEET_PUT, MP_CAL_SHEET_INVALIDATE.

/***********************************************************************
 * TOOLKIT DIRECT MONTH AVAILABILITY — 2026-04-27
 *
 * Purpose:
 * - Avoid slow 90-day Toolkit first-load availability fetch.
 * - Avoid AvailabilityService full row-index build for the first visible month.
 * - Read only rows for the selected auditor using TextFinder on Auditor_Email.
 * - Return same lightweight days shape consumed by ManagerPlanningV5UI.mapSlotStatesToDayAvail_().
 *
 * Safety:
 * - Read-only.
 * - No save/status/writeback changes.
 * - Cache is central AUDIT_CACHE availability namespace when available.
 ***********************************************************************/

function _mp_tdm_clean_(v) {
  return String(v == null ? '' : v).replace(/\u00A0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function _mp_tdm_normEmail_(v) {
  return _mp_tdm_clean_(v).toLowerCase();
}

function _mp_tdm_headerMap_(headers) {
  var exact = {};
  var norm = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var h = _mp_tdm_clean_(headers[i]);
    if (!h) continue;
    exact[h] = i;
    norm[h.toLowerCase().replace(/[^a-z0-9]+/g, '')] = i;
  }
  return {
    indexOf: function(names) {
      names = Array.isArray(names) ? names : [names];
      for (var n = 0; n < names.length; n++) {
        var raw = _mp_tdm_clean_(names[n]);
        if (!raw) continue;
        if (exact.hasOwnProperty(raw)) return exact[raw];
        var k = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (norm.hasOwnProperty(k)) return norm[k];
      }
      return -1;
    }
  };
}

function _mp_tdm_getAvailabilitySheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Auditor Availability') || ss.getSheetByName('Auditor availability');
  if (sh) return sh;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (_mp_tdm_clean_(sheets[i].getName()).toLowerCase() === 'auditor availability') return sheets[i];
  }
  throw new Error("Missing sheet 'Auditor Availability'");
}

function _mp_tdm_fmtDate_(v) {
  if (!v && v !== 0) return '';
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var s = _mp_tdm_clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return '';
}

function _mp_tdm_normTime_(v) {
  if (!v && v !== 0) return '';
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'HH:mm');
  }
  var s = _mp_tdm_clean_(v);
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
  return s;
}

function _mp_tdm_isSoftStatus_(s) {
  s = _mp_tdm_clean_(s).toUpperCase();
  return s === 'SYSTEM_DEFAULT' || s === 'USER_MANUAL' || s === 'CALENDAR' || s === 'CALENDER' || s.indexOf('DEFAULT_') === 0 || s.indexOf('MANUAL_') === 0;
}

function _mp_tdm_isHardStatus_(s) {
  s = _mp_tdm_clean_(s).toUpperCase();
  if (!s) return false;
  if (_mp_tdm_isSoftStatus_(s)) return false;
  return true;
}

function _mp_tdm_availableCell_(v) {
  if (v === false) return 'NO';
  if (v === true) return 'YES';
  var s = _mp_tdm_clean_(v).toUpperCase();
  if (!s) return '';
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === '0' || s === 'UNAVAILABLE' || s === 'NOT AVAILABLE' || s === 'NIET BESCHIKBAAR') return 'NO';
  if (s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'AVAILABLE' || s === 'BESCHIKBAAR') return 'YES';
  return s;
}

function _mp_tdm_cacheKey_(auditorEmail, monthKey) {
  return 'TOOLKIT_DIRECT_MONTH|' + _mp_tdm_normEmail_(auditorEmail) + '|' + _mp_tdm_clean_(monthKey);
}

function _mp_tdm_isCurrentCachePayload_(payload) {
  payload = payload || {};
  var meta = payload.meta || {};
  return payload.success !== false &&
    meta.build === TOOLKIT_AVAIL_P0_R2_BUILD &&
    meta.cacheSchema === TOOLKIT_AVAIL_CACHE_SCHEMA;
}

function _mp_tdm_logPath_(ctx) {
  ctx = ctx || {};
  try {
    Logger.log('[TDM_PATH] ' + JSON.stringify({
      auditorEmail: _mp_tdm_normEmail_(ctx.auditorEmail || ''),
      monthKey: _mp_tdm_clean_(ctx.monthKey || ''),
      tier1Hit: !!ctx.tier1Hit,
      tier2Hit: !!ctx.tier2Hit,
      tier3Hit: !!ctx.tier3Hit,
      signatureChecked: !!ctx.signatureChecked,
      staleRejected: !!ctx.staleRejected,
      rebuildTriggered: !!ctx.rebuildTriggered,
      totalMs: Number(ctx.totalMs || 0)
    }));
  } catch (eLogPath) {}
}

function _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, source, payload, pathCtx) {
  pathCtx = pathCtx || {};
  try {
    var meta = payload && payload.meta ? payload.meta : {};
    Logger.log(JSON.stringify({
      build: TOOLKIT_AVAIL_P0_R2_BUILD,
      event: 'TDM_STALE_CACHE_REJECTED',
      auditorEmail: _mp_tdm_normEmail_(auditorEmail),
      monthKey: _mp_tdm_clean_(monthKey),
      source: source || '',
      cachedBuild: meta.build || '',
      cachedSchema: meta.cacheSchema || '',
      action: 'invalidate_and_rebuild_from_sheet'
    }));
  } catch (eLog) {}

  _mp_tdm_logPath_({
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    tier1Hit: !!pathCtx.tier1Hit,
    tier2Hit: !!pathCtx.tier2Hit,
    tier3Hit: !!pathCtx.tier3Hit,
    signatureChecked: !!pathCtx.signatureChecked,
    staleRejected: true,
    rebuildTriggered: true,
    totalMs: Date.now() - Number(pathCtx.startedAt || Date.now())
  });

  try { TDM_invalidateAvailabilityMonthCache(auditorEmail, monthKey, { lite: false }); } catch (eInv) {}
  return null;
}

function _mp_tdm_stampCurrentCachePayload_(payload) {
  payload = payload || {};
  payload.meta = payload.meta || {};
  payload.meta.build = TOOLKIT_AVAIL_P0_R2_BUILD;
  payload.meta.cacheSchema = TOOLKIT_AVAIL_CACHE_SCHEMA;
  payload.meta.cacheBuiltAt = new Date().toISOString();
  return payload;
}


function _mp_tdm_payloadSignature_(payload) {
  payload = payload || {};
  var days = payload.days || {};
  var parts = [];
  Object.keys(days).sort().forEach(function(iso) {
    var day = days[iso] || {};
    var arr = Array.isArray(day.intervals) ? day.intervals : [];
    var ivParts = [];
    for (var i = 0; i < arr.length; i++) {
      var iv = arr[i] || {};
      var src = String(iv.source || '').toUpperCase();
      if (src === 'PLANNING_JSON_OVERLAY') continue;
      ivParts.push([
        _mp_tdm_normTime_(iv.startTime || iv.start || ''),
        _mp_tdm_normTime_(iv.endTime || iv.end || ''),
        (iv.hard === false || String(iv.kind || '').toLowerCase() === 'soft') ? 'S' : 'H',
        _mp_tdm_clean_(iv.status1 || ''),
        _mp_tdm_clean_(iv.status2 || ''),
        _mp_tdm_clean_(iv.reason || '')
      ].join('~'));
    }
    ivParts.sort();
    if (ivParts.length) parts.push(iso + '=' + ivParts.join(','));
  });
  return parts.join('|');
}

function _mp_tdm_sheetSignature_(auditorEmail, monthKey) {
  var t0 = Date.now();
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKey = _mp_tdm_clean_(monthKey);
  if (!auditorEmail || !/^\d{4}-\d{2}$/.test(monthKey)) return { ok:false, signature:'', error:'BAD_ARGS' };

  var sh = _mp_tdm_getAvailabilitySheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok:true, signature:'', rowsForAuditor:0, rowsMatched:0, ms:Date.now()-t0 };

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var hm = _mp_tdm_headerMap_(headers);
  var cDate = hm.indexOf(['Date']);
  var cAud = hm.indexOf(['Auditor_Email', 'Auditor Email', 'Email', 'E-mail', 'Auditor_Name', 'Auditor Name']);
  var cAvail = hm.indexOf(['Available']);
  var cS1 = hm.indexOf(['First_Audit_Start_Time', 'First Audit Start Time']);
  var cE1 = hm.indexOf(['First_Audit_End_Time', 'First Audit End Time']);
  var cID1 = hm.indexOf(['Audit_ID_1', 'Audit ID 1']);
  var cS2 = hm.indexOf(['Second_Audit_Start_Time', 'Second Audit Start Time']);
  var cE2 = hm.indexOf(['Second_Audit_End_Time', 'Second Audit End Time']);
  var cID2 = hm.indexOf(['Audit_ID_2', 'Audit ID 2']);
  var cSt1 = hm.indexOf(['Status_1', 'Status 1', 'Status']);
  var cSt2 = hm.indexOf(['Status_2', 'Status 2']);
  if (cDate < 0 || cAud < 0 || cAvail < 0) return { ok:false, signature:'', error:'MISSING_COLUMNS' };

  var startISO = monthKey + '-01';
  var startD = _mp_parseISODate_(startISO);
  var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));
  var rowNumbers = [];

  try {
    var rg = sh.getRange(2, cAud + 1, lastRow - 1, 1);
    var finder = rg.createTextFinder(auditorEmail).matchEntireCell(true).matchCase(false);
    var hits = finder.findAll() || [];
    for (var h = 0; h < hits.length; h++) {
      var rn = hits[h] && hits[h].getRow ? hits[h].getRow() : 0;
      if (rn >= 2) rowNumbers.push(rn);
    }
  } catch (eFind) {
    return { ok:false, signature:'', error:'TEXTFINDER_FAILED: ' + String(eFind && eFind.message ? eFind.message : eFind) };
  }

  rowNumbers.sort(function(a,b){ return a-b; });
  var blocks = _mp_tdm_compressRows_(rowNumbers);
  var parts = [];
  var rowsMatched = 0;

  function part_(iso, start, end, hard, st1, st2, reason) {
    parts.push(iso + '=' + [
      _mp_tdm_normTime_(start),
      _mp_tdm_normTime_(end),
      hard ? 'H' : 'S',
      _mp_tdm_clean_(st1 || ''),
      _mp_tdm_clean_(st2 || ''),
      _mp_tdm_clean_(reason || '')
    ].join('~'));
  }

  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var vals = sh.getRange(blk.start, 1, blk.count, lastCol).getValues();
    for (var r = 0; r < vals.length; r++) {
      var row = vals[r] || [];
      if (_mp_tdm_normEmail_(row[cAud]) !== auditorEmail) continue;
      var iso = _mp_tdm_fmtDate_(row[cDate]);
      if (!iso || iso < startISO || iso > endISO) continue;
      rowsMatched++;
      var available = cAvail >= 0 ? _mp_tdm_availableCell_(row[cAvail]) : '';
      var id1 = cID1 >= 0 ? _mp_tdm_clean_(row[cID1]) : '';
      var id2 = cID2 >= 0 ? _mp_tdm_clean_(row[cID2]) : '';
      var st1 = cSt1 >= 0 ? _mp_tdm_clean_(row[cSt1]) : '';
      var st2 = cSt2 >= 0 ? _mp_tdm_clean_(row[cSt2]) : '';
      if (id1) part_(iso, cS1 >= 0 ? row[cS1] : '', cE1 >= 0 ? row[cE1] : '', true, st1, st2, 'Occupied from Auditor availability');
      if (id2) part_(iso, cS2 >= 0 ? row[cS2] : '', cE2 >= 0 ? row[cE2] : '', true, st1, st2, 'Occupied from Auditor availability');
      if (!id1 && !id2 && available === 'NO') {
        var isSoft = _mp_tdm_isSoftStatus_(st1) || _mp_tdm_isSoftStatus_(st2);
        var isHard = _mp_tdm_isHardStatus_(st1) || _mp_tdm_isHardStatus_(st2);
        var soft = !!isSoft && !isHard;
        part_(iso, cS1 >= 0 ? (row[cS1] || '08:00') : '08:00', cE1 >= 0 ? (row[cE1] || '18:00') : '18:00', !soft, st1, st2, soft ? (st1 || st2 || 'Soft unavailable') : 'Available=NO');
      }
    }
  }
  parts.sort();
  return { ok:true, signature:parts.join('|'), rowsForAuditor:rowNumbers.length, rowsMatched:rowsMatched, blocksRead:blocks.length, ms:Date.now()-t0 };
}

function _mp_tdm_cacheFreshAgainstSheet_(auditorEmail, monthKey, payload, source) {
  var sheetSig = _mp_tdm_sheetSignature_(auditorEmail, monthKey);
  if (!sheetSig.ok) return { ok:false, reason:'SHEET_SIGNATURE_FAILED', sheetSignature:sheetSig };
  var payloadSig = payload && payload.meta ? String(payload.meta.availabilitySignature || '') : '';
  if (!payloadSig) return { ok:false, reason:'CACHE_SIGNATURE_MISSING', sheetSignature:sheetSig };
  if (payloadSig !== sheetSig.signature) {
    return { ok:false, reason:'CACHE_SIGNATURE_MISMATCH', sheetSignature:sheetSig, cachedSignatureLength:payloadSig.length, currentSignatureLength:sheetSig.signature.length, source:source || '' };
  }
  return { ok:true, reason:'CACHE_SIGNATURE_MATCH', sheetSignature:sheetSig };
}

function _mp_tdm_cacheGet_(auditorEmail, monthKey, opts) {
  var __tdmPathStart = Date.now();
  opts = opts || {};
  var verifyFreshness = opts.verifyFreshness === true;
  var pathCtx = {
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    startedAt: __tdmPathStart,
    tier1Hit: false,
    tier2Hit: false,
    tier3Hit: false,
    signatureChecked: false,
    staleRejected: false,
    rebuildTriggered: false
  };

  function acceptHit_(payload, cacheService, sourceMode) {
    payload.meta = payload.meta || {};
    payload.meta.cacheHit = true;
    payload.meta.cacheService = cacheService;
    payload.meta.sourceMode = verifyFreshness ? sourceMode : (cacheService + '_TRUSTED_BY_INVALIDATION');
    payload.meta.routeOwner = 'Toolkit_AvailabilityMonth';
    payload.meta.freshnessVerified = !!verifyFreshness;
    payload.meta.freshnessMode = verifyFreshness ? 'SIGNATURE_VERIFIED' : 'TRUSTED_BY_INVALIDATION';
    payload.meta.signatureChecked = !!verifyFreshness;
    _mp_tdm_logPath_({
      auditorEmail: auditorEmail,
      monthKey: monthKey,
      tier1Hit: pathCtx.tier1Hit,
      tier2Hit: pathCtx.tier2Hit,
      tier3Hit: pathCtx.tier3Hit,
      signatureChecked: pathCtx.signatureChecked,
      staleRejected: false,
      rebuildTriggered: false,
      totalMs: Date.now() - __tdmPathStart
    });
    return payload;
  }

  if (opts.forceFresh || opts.forceRefresh || opts.bypassCache) {
    _mp_tdm_logPath_({
      auditorEmail: auditorEmail,
      monthKey: monthKey,
      tier1Hit: false,
      tier2Hit: false,
      tier3Hit: false,
      signatureChecked: false,
      staleRejected: false,
      rebuildTriggered: true,
      totalMs: Date.now() - __tdmPathStart
    });
    return null;
  }

  // Tier 1: AUDIT_CACHE (fast in-cluster facade)
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function') {
      var hit = AUDIT_CACHE.get('availability', _mp_tdm_cacheKey_(auditorEmail, monthKey), {skipOverflow:true});
      if (hit && hit.success !== false) {
        pathCtx.tier1Hit = true;
        if (!_mp_tdm_isCurrentCachePayload_(hit)) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'AUDIT_CACHE', hit, pathCtx);
        if (verifyFreshness) {
          pathCtx.signatureChecked = true;
          var fresh1 = _mp_tdm_cacheFreshAgainstSheet_(auditorEmail, monthKey, hit, 'AUDIT_CACHE');
          if (!fresh1.ok) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'AUDIT_CACHE:' + fresh1.reason, hit, pathCtx);
          hit.meta = hit.meta || {};
          hit.meta.signatureMs = fresh1.sheetSignature && typeof fresh1.sheetSignature.ms === 'number' ? fresh1.sheetSignature.ms : null;
        }
        return acceptHit_(hit, 'AUDIT_CACHE', 'AUDIT_CACHE_SIGNATURE_VALIDATED');
      }
    }
  } catch (e1) {}
  // Tier 2: CacheService script cache
  try {
    var raw = CacheService.getScriptCache().get(_mp_tdm_cacheKey_(auditorEmail, monthKey));
    if (raw) {
      var obj = JSON.parse(raw);
      if (obj && obj.success !== false) {
        pathCtx.tier2Hit = true;
        if (!_mp_tdm_isCurrentCachePayload_(obj)) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'CacheServiceFallback', obj, pathCtx);
        if (verifyFreshness) {
          pathCtx.signatureChecked = true;
          var fresh2 = _mp_tdm_cacheFreshAgainstSheet_(auditorEmail, monthKey, obj, 'CacheServiceFallback');
          if (!fresh2.ok) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'CacheServiceFallback:' + fresh2.reason, obj, pathCtx);
          obj.meta = obj.meta || {};
          obj.meta.signatureMs = fresh2.sheetSignature && typeof fresh2.sheetSignature.ms === 'number' ? fresh2.sheetSignature.ms : null;
        }
        return acceptHit_(obj, 'CacheServiceFallback', 'SCRIPT_CACHE_SIGNATURE_VALIDATED');
      }
    }
  } catch (e2) {}
  // Tier 3: sheet cache (GATE D - persistent across container restarts)
  try {
    if (typeof MP_CAL_SHEET_GET === 'function') {
      var sheetHit = MP_CAL_SHEET_GET(auditorEmail, monthKey);
      if (sheetHit && sheetHit.success !== false) {
        pathCtx.tier3Hit = true;
        if (!_mp_tdm_isCurrentCachePayload_(sheetHit)) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'MP_CalCache_Store', sheetHit, pathCtx);
        if (verifyFreshness) {
          pathCtx.signatureChecked = true;
          var fresh3 = _mp_tdm_cacheFreshAgainstSheet_(auditorEmail, monthKey, sheetHit, 'MP_CalCache_Store');
          if (!fresh3.ok) return _mp_tdm_rejectStaleCache_(auditorEmail, monthKey, 'MP_CalCache_Store:' + fresh3.reason, sheetHit, pathCtx);
          sheetHit.meta = sheetHit.meta || {};
          sheetHit.meta.signatureMs = fresh3.sheetSignature && typeof fresh3.sheetSignature.ms === 'number' ? fresh3.sheetSignature.ms : null;
        }
        sheetHit.meta = sheetHit.meta || {};
        // Promote to script cache so subsequent calls in same window hit
        // the fast tier.
        try { CacheService.getScriptCache().put(_mp_tdm_cacheKey_(auditorEmail, monthKey), JSON.stringify(sheetHit), 21600); } catch(_pe){}
        return acceptHit_(sheetHit, 'MP_CalCache_Store', 'SHEET_CACHE_SIGNATURE_VALIDATED');
      }
    }
  } catch (e3) {}

  _mp_tdm_logPath_({
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    tier1Hit: pathCtx.tier1Hit,
    tier2Hit: pathCtx.tier2Hit,
    tier3Hit: pathCtx.tier3Hit,
    signatureChecked: pathCtx.signatureChecked,
    staleRejected: false,
    rebuildTriggered: true,
    totalMs: Date.now() - __tdmPathStart
  });
  return null;
}

function _mp_tdm_cachePut_(auditorEmail, monthKey, payload) {
  payload = _mp_tdm_stampCurrentCachePayload_(payload);
  try { payload.meta.availabilitySignature = _mp_tdm_payloadSignature_(payload); } catch (eSigPut) {}
  // Tier 1: AUDIT_CACHE facade (preferred fast path)
  var tier1Ok = false;
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function') {
      tier1Ok = !!AUDIT_CACHE.put('availability', _mp_tdm_cacheKey_(auditorEmail, monthKey), payload, 1800);
    }
  } catch (e1) {}
  // Tier 2: script cache (raw key, ALWAYS populated so 2nd-open hit avoids sheet scan).
  // GATE H (20260502): was previously gated on !tier1Ok which left raw-key tier empty
  // for cal payloads -> every read after AUDIT_CACHE eviction fell through to tier 3
  // sheet scan (~600-900ms server). Always write here with same 21600s TTL so the
  // cal HIT path mirrors openFast/T16 cache behavior (<100ms server on warm).
  try { CacheService.getScriptCache().put(_mp_tdm_cacheKey_(auditorEmail, monthKey), JSON.stringify(payload), 21600); tier1Ok = true; } catch (e2) {}
  // Tier 3: sheet cache (GATE D - best-effort, never fails the call)
  try {
    if (typeof MP_CAL_SHEET_PUT === 'function') {
      MP_CAL_SHEET_PUT(auditorEmail, monthKey, payload);
    }
  } catch (e3) {
    Logger.log('[V5][GATE D] cal cache put (sheet) failed: ' + e3);
  }
  return tier1Ok;
}

function TDM_invalidateAvailabilityMonthCache(auditorEmail, monthKey, opts) {
  opts = opts || {};
  var email = _mp_tdm_normEmail_(auditorEmail);
  var mk = _mp_tdm_clean_(monthKey);
  if (!email || email.indexOf('@') < 0) throw new Error('TDM_invalidateAvailabilityMonthCache: missing/invalid auditorEmail');
  if (!/^\d{4}-\d{2}$/.test(mk)) throw new Error('TDM_invalidateAvailabilityMonthCache: invalid monthKey: ' + monthKey);

  var key = _mp_tdm_cacheKey_(email, mk);
  var out = {
    success: true,
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    auditorEmail: email,
    monthKey: mk,
    key: key,
    tiers: {
      auditCache: false,
      scriptCache: false,
      sheetCache: false
    },
    lite: opts.lite === true,
    invalidatedAt: new Date().toISOString()
  };

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function') {
      AUDIT_CACHE.remove('availability', key);
      out.tiers.auditCache = true;
    }
  } catch (e1) {
    out.success = false;
    out.auditCacheError = String(e1 && e1.message ? e1.message : e1);
  }

  try {
    CacheService.getScriptCache().remove(key);
    out.tiers.scriptCache = true;
  } catch (e2) {
    out.success = false;
    out.scriptCacheError = String(e2 && e2.message ? e2.message : e2);
  }

  if (opts.lite !== true) {
    try {
      if (typeof MP_CAL_SHEET_INVALIDATE === 'function') {
        MP_CAL_SHEET_INVALIDATE(email, mk);
        out.tiers.sheetCache = true;
      } else {
        out.tiers.sheetCache = 'unavailable';
      }
    } catch (e3) {
      out.success = false;
      out.sheetCacheError = String(e3 && e3.message ? e3.message : e3);
      Logger.log('[TDM][R6] sheet cache invalidate failed: ' + out.sheetCacheError);
    }
  }

  return out;
}

function TDM_invalidateAvailabilityMonthCachesForAuditor(auditorEmail, opts) {
  opts = opts || {};
  var email = _mp_tdm_normEmail_(auditorEmail);
  if (!email || email.indexOf('@') < 0) throw new Error('TDM_invalidateAvailabilityMonthCachesForAuditor: missing/invalid auditorEmail');

  var now = new Date();
  var months = {};
  for (var delta = -24; delta <= 24; delta++) {
    var d = new Date(now.getFullYear(), now.getMonth() + delta, 1);
    var mk = Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM');
    months[mk] = true;
  }
  var monthKeys = Object.keys(months).sort();
  var results = [];
  for (var i = 0; i < monthKeys.length; i++) {
    results.push(TDM_invalidateAvailabilityMonthCache(email, monthKeys[i], opts));
  }
  return { success: true, build: TOOLKIT_AVAIL_P0_R2_BUILD, auditorEmail: email, invalidated: monthKeys.length, monthKeys: monthKeys, results: results };
}

function _mp_tdm_cacheInvalidate_(auditorEmail, monthKey, opts) {
  return TDM_invalidateAvailabilityMonthCache(auditorEmail, monthKey, opts || {});
}

function _mp_calInvalidateForAuditLite_(auditId, auditorEmail, blocks) {
  // GATE L (20260502): cache-only variant of _mp_calInvalidateForAudit_
  // for use in the post-save tail. Skips per-month sheet writes.
  try {
    var email = String(auditorEmail || '').trim();
    if (!email || email.indexOf('@') < 0) return { invalidated: 0, reason: 'no-email' };
    var keys = {};
    if (blocks && blocks.length) {
      for (var i = 0; i < blocks.length; i++) {
        var d = String((blocks[i] && blocks[i].date) || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) keys[d.slice(0, 7)] = true;
      }
    }
    var monthKeys = Object.keys(keys);
    for (var k = 0; k < monthKeys.length; k++) {
      _mp_tdm_cacheInvalidate_(email, monthKeys[k], { lite: true });
    }
    return { invalidated: monthKeys.length, monthKeys: monthKeys, lite: true };
  } catch (e) {
    return { invalidated: 0, error: String(e) };
  }
}

function _mp_calInvalidateForAudit_(auditId, auditorEmail, blocks) {
  // Best-effort. Derives month keys from `blocks` (saveManagerPlanning
  // payload schedule) and invalidates the calendar cache for the assigned
  // auditor x those months. Falls back gracefully if blocks are missing.
  try {
    var email = String(auditorEmail || '').trim();
    if (!email || email.indexOf('@') < 0) return { invalidated: 0, reason: 'no-email' };

    var keys = {};
    if (blocks && blocks.length) {
      for (var i = 0; i < blocks.length; i++) {
        var d = String((blocks[i] && blocks[i].date) || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) keys[d.slice(0, 7)] = true;
      }
    }
    var monthKeys = Object.keys(keys);
    var n = 0;
    for (var k = 0; k < monthKeys.length; k++) {
      _mp_tdm_cacheInvalidate_(email, monthKeys[k]);
      n++;
    }
    return { invalidated: n, monthKeys: monthKeys, email: email, auditId: auditId };
  } catch (e) {
    Logger.log('[V5][GATE D] _mp_calInvalidateForAudit_ failed: ' + e);
    return { invalidated: 0, error: String(e) };
  }
}

function _mp_tdm_compressRows_(rowNumbers) {
  var out = [];
  rowNumbers = (rowNumbers || []).slice().sort(function(a,b){ return a-b; });
  if (!rowNumbers.length) return out;
  var start = rowNumbers[0], prev = rowNumbers[0];
  for (var i = 1; i < rowNumbers.length; i++) {
    var n = rowNumbers[i];
    if (n === prev + 1) { prev = n; continue; }
    out.push({ start:start, count:prev-start+1 });
    start = prev = n;
  }
  out.push({ start:start, count:prev-start+1 });
  return out;
}


/***********************************************************************
 * P0 R2 — Planning JSON overlay + runtime diagnostics
 *
 * Why this exists:
 * - Toolkit month cache only reflects Auditor Availability rows.
 * - Existing planned audits can be present in Audit planning.Planning JSON
 *   while absent/stale in Auditor Availability.
 * - Planning JSON is the planning SSoT. Toolkit must project it as HARD
 *   occupancy at interval level on every response, including cache hits.
 *
 * Deliberate design:
 * - Cache stores Auditor Availability projection only.
 * - Overlay is applied after cache retrieval/build, never persisted into the
 *   month cache, preventing stale Planning JSON overlay from being cached.
 ***********************************************************************/
var TOOLKIT_AVAIL_P0_R2_BUILD = '2026-05-15_TOOLKIT_AVAIL_CACHE_SIGNATURE_R8';
var TOOLKIT_AVAIL_CACHE_SCHEMA = 'TDM_CACHE_SCHEMA_R8_20260515';

function _mp_tdm_cloneJson_(obj) {
  try { return JSON.parse(JSON.stringify(obj || {})); } catch (e) { return obj || {}; }
}

function _mp_tdm_stripPlanningOverlay_(payload) {
  payload = payload || {};
  var days = payload.days || {};
  Object.keys(days).forEach(function(iso) {
    var d = days[iso] || {};
    var arr = Array.isArray(d.intervals) ? d.intervals : [];
    var kept = [];
    for (var i = 0; i < arr.length; i++) {
      var iv = arr[i] || {};
      var src = String(iv.source || iv.origin || '').toUpperCase();
      if (src === 'PLANNING_JSON_OVERLAY') continue;
      kept.push(iv);
    }
    d.intervals = kept;
    if (d.meta && d.meta.planningJsonOverlay) delete d.meta.planningJsonOverlay;
    if (!kept.length && (!d.meta || Object.keys(d.meta).length === 0)) delete days[iso];
  });
  return payload;
}

function _mp_tdm_auditPlanningSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning') || ss.getSheetByName('Audit Planning');
  if (!sh) throw new Error("Missing sheet 'Audit planning'");
  return sh;
}

function _mp_tdm_headerIndexLoose_(headers, names) {
  var exact = {}, norm = {};
  for (var i = 0; i < (headers || []).length; i++) {
    var h = _mp_tdm_clean_(headers[i]);
    exact[h] = i;
    norm[h.toLowerCase().replace(/[^a-z0-9]+/g, '')] = i;
  }
  names = Array.isArray(names) ? names : [names];
  for (var n = 0; n < names.length; n++) {
    var raw = _mp_tdm_clean_(names[n]);
    if (exact.hasOwnProperty(raw)) return exact[raw];
    var k = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (norm.hasOwnProperty(k)) return norm[k];
  }
  return -1;
}

function _mp_tdm_activePlanningStatus_(status) {
  status = _mp_tdm_clean_(status);
  return status === 'Pending Approval' || status === 'Approved' || status === 'Accepted';
}

function _mp_tdm_addPlanningJsonOverlay_(payload, auditorEmail, monthKey, opts) {
  var t0 = Date.now();
  opts = opts || {};
  payload = _mp_tdm_stripPlanningOverlay_(_mp_tdm_cloneJson_(payload));
  payload.days = payload.days || {};
  payload.meta = payload.meta || {};

  var diag = {
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    applied: false,
    rowsScanned: 0,
    rowsMatched: 0,
    auditsMatched: 0,
    intervalsAdded: 0,
    skipped: [],
    ms: 0
  };

  try {
    auditorEmail = _mp_tdm_normEmail_(auditorEmail);
    monthKey = _mp_tdm_clean_(monthKey);
    var startISO = monthKey + '-01';
    var startD = _mp_parseISODate_(startISO);
    var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));

    var sh = _mp_tdm_auditPlanningSheet_();
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      diag.applied = true;
      diag.ms = Date.now() - t0;
      payload.meta.planningJsonOverlay = diag;
      return payload;
    }

    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var cStatus = _mp_tdm_headerIndexLoose_(headers, ['Status']);
    var cAssigned = _mp_tdm_headerIndexLoose_(headers, ['Assigned to', 'Assigned To', 'Auditor_Email', 'Auditor Email']);
    var cPlanning = _mp_tdm_headerIndexLoose_(headers, ['Planning JSON', 'Planning_JSON']);
    var cAuditId = _mp_tdm_headerIndexLoose_(headers, ['Audit ID', 'Audit_ID']);
    var cCompany = _mp_tdm_headerIndexLoose_(headers, ['Company', 'Company name', 'Client', 'Organisation', 'Organization']);
    if (cStatus < 0 || cAssigned < 0 || cPlanning < 0) {
      diag.skipped.push('MISSING_REQUIRED_COLUMNS');
      diag.ms = Date.now() - t0;
      payload.meta.planningJsonOverlay = diag;
      return payload;
    }

    var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    diag.rowsScanned = values.length;

    function ensureDay_(iso) {
      if (!payload.days[iso]) payload.days[iso] = { intervals: [], meta: {} };
      if (!Array.isArray(payload.days[iso].intervals)) payload.days[iso].intervals = [];
      payload.days[iso].meta = payload.days[iso].meta || {};
      return payload.days[iso];
    }

    function addInterval_(iso, start, end, auditId, rowNumber, status, companyName) {
      start = _mp_tdm_normTime_(start);
      end = _mp_tdm_normTime_(end);
      if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
        diag.skipped.push('BAD_TIME_ROW_' + rowNumber + '_' + iso);
        return;
      }
      var day = ensureDay_(iso);
      var key = [start, end, auditId, 'PLANNING_JSON_OVERLAY'].join('|');
      for (var k = 0; k < day.intervals.length; k++) {
        var ex = day.intervals[k] || {};
        var exKey = [_mp_tdm_normTime_(ex.startTime || ex.start), _mp_tdm_normTime_(ex.endTime || ex.end), String(ex.auditId || ''), String(ex.source || '')].join('|');
        if (exKey === key) return;
      }
      day.intervals.push({
        startTime: start,
        endTime: end,
        hard: true,
        kind: 'hard',
        source: 'PLANNING_JSON_OVERLAY',
        reason: 'Occupied from Planning JSON (' + status + ')' + (companyName ? ' — ' + companyName : '') + (auditId ? ' — audit_id=' + auditId : ''),
        company: companyName || '',
        auditId: auditId,
        rowNumber: rowNumber
      });
      day.meta.planningJsonOverlay = day.meta.planningJsonOverlay || { auditIds: [] };
      if (auditId && day.meta.planningJsonOverlay.auditIds.indexOf(auditId) < 0) day.meta.planningJsonOverlay.auditIds.push(auditId);
      diag.intervalsAdded++;
    }

    for (var r = 0; r < values.length; r++) {
      var row = values[r] || [];
      var assigned = _mp_tdm_normEmail_(row[cAssigned]);
      if (assigned !== auditorEmail) continue;
      var status = _mp_tdm_clean_(row[cStatus]);
      if (!_mp_tdm_activePlanningStatus_(status)) continue;
      var pj = _mp_tdm_clean_(row[cPlanning]);
      if (!pj) continue;
      diag.rowsMatched++;
      var auditId = cAuditId >= 0 ? _mp_tdm_clean_(row[cAuditId]) : '';
      var companyName = cCompany >= 0 ? _mp_tdm_clean_(row[cCompany]) : '';
      var data = null;
      try { data = JSON.parse(pj); } catch (eJson) { diag.skipped.push('BAD_JSON_ROW_' + (r + 2)); continue; }
      var slots = [];
      if (data && Array.isArray(data.blocks)) slots = data.blocks;
      else if (data && Array.isArray(data.slots)) slots = data.slots;
      else if (Array.isArray(data)) slots = data;
      if (!auditId && data && data.auditId) auditId = _mp_tdm_clean_(data.auditId);
      if (!slots.length) continue;
      var addedForAudit = 0;
      for (var i = 0; i < slots.length; i++) {
        var sl = slots[i] || {};
        var iso = _mp_tdm_clean_(sl.date || sl.dateISO);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
        if (iso < startISO || iso > endISO) continue;
        var before = diag.intervalsAdded;
        addInterval_(iso, sl.start || sl.startTime, sl.end || sl.endTime, auditId, r + 2, status, companyName);
        if (diag.intervalsAdded > before) addedForAudit++;
      }
      if (addedForAudit) diag.auditsMatched++;
    }
    diag.applied = true;
  } catch (e) {
    diag.error = String(e && e.message ? e.message : e);
    if (opts.failOnOverlayError === true) throw e;
  }

  diag.ms = Date.now() - t0;
  payload.meta.planningJsonOverlay = diag;
  payload.meta.build = TOOLKIT_AVAIL_P0_R2_BUILD;
  return payload;
}

function getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, opts) {
  var t0 = Date.now();
  opts = opts || {};

  // 3S R9 — stability-first calendar cache.
  // Calendar cache hits are verified against the live Auditor Availability
  // signature by default. This prevents stale occupied days after cancel,
  // complete, delete or other status mutations where a route forgot to
  // invalidate MP_CalCache_Store / CacheService / AUDIT_CACHE.
  // Explicit opt-out remains possible for controlled warmers: {verifyFreshness:false}.
  if (opts.verifyFreshness !== false) {
    opts.verifyFreshness = true;
  }
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKey = _mp_tdm_clean_(monthKey);
  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { success:false, message:'Invalid monthKey: ' + monthKey };

  var cached = _mp_tdm_cacheGet_(auditorEmail, monthKey, opts);

  try {
    var __d38_reason = (opts && opts.reason) ? String(opts.reason) : '';
    var __d38_key = _mp_tdm_cacheKey_(auditorEmail, monthKey);
    Logger.log('[CAL_KEY] ' + JSON.stringify({
      reason: __d38_reason,
      auditorEmail: auditorEmail,
      monthKey: monthKey,
      key: __d38_key
    }));

    Logger.log('[CAL_TIER] ' + JSON.stringify({
      reason: __d38_reason,
      auditorEmail: auditorEmail,
      monthKey: monthKey,
      tier: (cached && cached.meta && cached.meta.cacheService) ? cached.meta.cacheService : 'LIVE_BUILD',
      cacheHit: !!(cached && cached.meta && cached.meta.cacheHit),
      sourceMode: (cached && cached.meta && cached.meta.sourceMode) ? cached.meta.sourceMode : ''
    }));
  } catch(eD38CalDiag) {
    Logger.log('[CAL_DIAG_ERROR] ' + String(eD38CalDiag && eD38CalDiag.message ? eD38CalDiag.message : eD38CalDiag));
  }

  if (cached) {
    cached.meta = cached.meta || {};
    cached.meta.serverMs = Date.now() - t0;
    cached.meta.cacheHitTimingPatched = true;
    cached.meta.preOverlayCacheHit = true;
    cached.meta.build = TOOLKIT_AVAIL_P0_R2_BUILD;
    var cachedOverlayed = _mp_tdm_addPlanningJsonOverlay_(cached, auditorEmail, monthKey, opts);
    cachedOverlayed.meta = cachedOverlayed.meta || {};
    cachedOverlayed.meta.serverMs = Date.now() - t0;
    cachedOverlayed.meta.cacheHit = true;
    cachedOverlayed.meta.cacheService = cached.meta.cacheService || cachedOverlayed.meta.cacheService || 'unknown';
    cachedOverlayed.meta.build = TOOLKIT_AVAIL_P0_R2_BUILD;
    return cachedOverlayed;
  }

  var sh = _mp_tdm_getAvailabilitySheet_();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { success:true, auditorEmail:auditorEmail, monthKey:monthKey, days:{}, meta:{ serverMs:Date.now()-t0, directMonth:true, rowsMatched:0 } };
  }

  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var hm = _mp_tdm_headerMap_(headers);
  var cDate = hm.indexOf(['Date']);
  var cAud = hm.indexOf(['Auditor_Email', 'Auditor Email', 'Email', 'E-mail', 'Auditor_Name', 'Auditor Name']);
  var cAvail = hm.indexOf(['Available']);
  var cS1 = hm.indexOf(['First_Audit_Start_Time', 'First Audit Start Time']);
  var cE1 = hm.indexOf(['First_Audit_End_Time', 'First Audit End Time']);
  var cID1 = hm.indexOf(['Audit_ID_1', 'Audit ID 1']);
  var cS2 = hm.indexOf(['Second_Audit_Start_Time', 'Second Audit Start Time']);
  var cE2 = hm.indexOf(['Second_Audit_End_Time', 'Second Audit End Time']);
  var cID2 = hm.indexOf(['Audit_ID_2', 'Audit ID 2']);
  var cSt1 = hm.indexOf(['Status_1', 'Status 1', 'Status']);
  var cSt2 = hm.indexOf(['Status_2', 'Status 2']);
  if (cDate < 0 || cAud < 0 || cAvail < 0) {
    return { success:false, message:'Auditor Availability missing Date/Auditor_Email/Available columns' };
  }

  var startISO = monthKey + '-01';
  var startD = _mp_parseISODate_(startISO);
  var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));
  var rowNumbers = [];

  // R3 PERF: do NOT read full Date + Auditor columns on the cold path.
  // The R2 diagnostic proved the cold month path spent ~40s in the row-discovery phase.
  // Default strategy: TextFinder on the selected auditor column, then batched reads only
  // for those hit rows and month-filter in memory. Cache remains acceleration only.
  var tFind0 = Date.now();
  var rowDiscoveryMethod = 'TextFinderAuditorColumn';
  try {
    var rg = sh.getRange(2, cAud + 1, lastRow - 1, 1);
    var finder = rg.createTextFinder(auditorEmail).matchEntireCell(true).matchCase(false);
    var hits = finder.findAll() || [];
    for (var h = 0; h < hits.length; h++) {
      var rn = hits[h] && hits[h].getRow ? hits[h].getRow() : 0;
      if (rn >= 2) rowNumbers.push(rn);
    }
  } catch (eFindPrimary) {
    rowDiscoveryMethod = 'FullColumnFallback';
    try {
      var dateColVals = sh.getRange(2, cDate + 1, lastRow - 1, 1).getValues();
      var audColVals  = sh.getRange(2, cAud  + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < dateColVals.length; i++) {
        var isoCheck = _mp_tdm_fmtDate_(dateColVals[i][0]);
        if (!isoCheck || isoCheck < startISO || isoCheck > endISO) continue;
        if (_mp_tdm_normEmail_(audColVals[i][0]) !== auditorEmail) continue;
        rowNumbers.push(i + 2);
      }
    } catch (eFilter) {
      rowDiscoveryMethod = 'FAILED';
    }
  }
  var findMs = Date.now() - tFind0;

  var tRead0 = Date.now();
  // PERF-PATCH-A2: compressed-block read still applies, but now over a much
  // smaller rowNumbers set (rows-in-month, typically <=31) instead of the
  // entire auditor calendar. Per-row processing is verbatim from the prior
  // implementation to guarantee identical output shape.
  var blocks = _mp_tdm_compressRows_(rowNumbers);
  var days = {};
  var rowsInMonth = 0;

  function ensureDay_(iso) {
    if (!days[iso]) days[iso] = { intervals:[], meta:{} };
    return days[iso];
  }

  function addInterval_(day, start, end, hard, meta) {
    start = _mp_tdm_normTime_(start);
    end = _mp_tdm_normTime_(end);
    if (!start || !end) return;
    meta = meta || {};
    day.intervals.push({
      startTime:start,
      endTime:end,
      hard: hard !== false,
      kind: hard === false ? 'soft' : 'hard',
      source: meta.source || '',
      reason: meta.reason || '',
      status1: meta.status1 || '',
      status2: meta.status2 || ''
    });
  }

  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    var vals = sh.getRange(blk.start, 1, blk.count, lastCol).getValues();
    for (var r = 0; r < vals.length; r++) {
      var row = vals[r] || [];
      // Prefilter already guarantees auditor + month match, but keep the
      // defensive checks so a stale block (e.g. row deleted between filter
      // and read in a concurrent edit) cannot corrupt the day map.
      if (_mp_tdm_normEmail_(row[cAud]) !== auditorEmail) continue;
      var iso = _mp_tdm_fmtDate_(row[cDate]);
      if (!iso || iso < startISO || iso > endISO) continue;
      rowsInMonth++;

      var available = cAvail >= 0 ? _mp_tdm_availableCell_(row[cAvail]) : '';
      var id1 = cID1 >= 0 ? _mp_tdm_clean_(row[cID1]) : '';
      var id2 = cID2 >= 0 ? _mp_tdm_clean_(row[cID2]) : '';
      var st1 = cSt1 >= 0 ? _mp_tdm_clean_(row[cSt1]) : '';
      var st2 = cSt2 >= 0 ? _mp_tdm_clean_(row[cSt2]) : '';
      var day = ensureDay_(iso);
      if (!day.meta.availableCell && available) day.meta.availableCell = available;

      if (id1) addInterval_(day, cS1 >= 0 ? row[cS1] : '', cE1 >= 0 ? row[cE1] : '', true, { source:'AUDITOR_AVAILABILITY', reason:'Occupied from Auditor availability', status1:st1, status2:st2 });
      if (id2) addInterval_(day, cS2 >= 0 ? row[cS2] : '', cE2 >= 0 ? row[cE2] : '', true, { source:'AUDITOR_AVAILABILITY', reason:'Occupied from Auditor availability', status1:st1, status2:st2 });

      if (!id1 && !id2 && available === 'NO') {
        var isSoft = _mp_tdm_isSoftStatus_(st1) || _mp_tdm_isSoftStatus_(st2);
        var isHard = _mp_tdm_isHardStatus_(st1) || _mp_tdm_isHardStatus_(st2);
        day.meta.softFullDay = !!isSoft && !isHard;
        addInterval_(day, cS1 >= 0 ? (row[cS1] || '08:00') : '08:00', cE1 >= 0 ? (row[cE1] || '18:00') : '18:00', !day.meta.softFullDay, { source:'AUDITOR_AVAILABILITY', reason: day.meta.softFullDay ? (st1 || st2 || 'Soft unavailable') : 'Available=NO', status1:st1, status2:st2 });
      }
    }
  }
  var readMs = Date.now() - tRead0;

  Object.keys(days).forEach(function(iso) {
    if (!days[iso] || !days[iso].intervals || !days[iso].intervals.length) delete days[iso];
  });

  var out = {
    success:true,
    auditorEmail: auditorEmail,
    auditorKey: auditorEmail,
    monthKey: monthKey,
    rangeStart: startISO,
    rangeEnd: endISO,
    days: days,
    meta: {
      directMonth:true,
      textFinder:(rowDiscoveryMethod === 'TextFinderAuditorColumn'),
      rowDiscoveryMethod: rowDiscoveryMethod,
      cacheHit:false,
      rowsForAuditor: rowNumbers.length,
      rowsMatched: rowsInMonth,
      blocksRead: blocks.length,
      serverMs: Date.now() - t0,
      sourceMode:'LIVE', routeOwner:'Toolkit_AvailabilityMonth', timing: { findMs:findMs, rowReadMs:readMs }
    }
  };

  _mp_tdm_cachePut_(auditorEmail, monthKey, out);
  var overlayed = _mp_tdm_addPlanningJsonOverlay_(out, auditorEmail, monthKey, opts);
  overlayed.meta = overlayed.meta || {};
  overlayed.meta.serverMs = Date.now() - t0;
  overlayed.meta.cacheHit = false;
  overlayed.meta.build = TOOLKIT_AVAIL_P0_R2_BUILD;
  return overlayed;
}

function RUN_TOOLKIT_AVAILABILITY_P0_R2_DIAG() {
  var email = 'leen@agriqa.es';
  var monthKey = '2026-07';
  var res = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, failOnOverlayError: true });
  Logger.log(JSON.stringify({
    ok: !!(res && res.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    email: email,
    monthKey: monthKey,
    meta: res && res.meta,
    day_2026_07_14: res && res.days && res.days['2026-07-14'],
    day_2026_07_15: res && res.days && res.days['2026-07-15'],
    day_2026_07_16: res && res.days && res.days['2026-07-16']
  }, null, 2));
  return res;
}



function RUN_TOOLKIT_AVAILABILITY_SOFT_HARD_R4_JUNE_DIAG() {
  // P0 identity regression diagnostic.
  // Do NOT use Session.getActiveUser() here: manager/test execution user is not the selected auditor.
  // Email is the auditor SSoT and must be explicit for this testcase.
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-06';
  var res = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  Logger.log(JSON.stringify({
    ok: !!(res && res.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    email: email,
    monthKey: monthKey,
    meta: res && res.meta,
    day_2026_06_16: res && res.days && res.days['2026-06-16'],
    day_2026_06_17_default_wednesday: res && res.days && res.days['2026-06-17'],
    day_2026_06_23: res && res.days && res.days['2026-06-23']
  }, null, 2));
  return res;
}



function RUN_TOOLKIT_AVAILABILITY_CACHE_VERSIONED_R7_JULY_DIAG() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-07';
  var inv = TDM_invalidateAvailabilityMonthCache(email, monthKey, { lite: false });
  var res = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  var out = {
    ok: !!(res && res.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    invalidation: inv,
    email: email,
    monthKey: monthKey,
    meta: res && res.meta,
    day_2026_07_15_default_wednesday: res && res.days && res.days['2026-07-15'],
    day_2026_07_16_default_thursday: res && res.days && res.days['2026-07-16']
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_TOOLKIT_AVAILABILITY_CACHE_VERSIONED_R7_CLEAR_JULY_CACHE() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-07';
  var out = TDM_invalidateAvailabilityMonthCache(email, monthKey, { lite: false });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_TOOLKIT_AVAILABILITY_CACHE_VERSIONED_R7_AUGUST_DIAG() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-08';
  var inv = TDM_invalidateAvailabilityMonthCache(email, monthKey, { lite: false });
  var res = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  Logger.log(JSON.stringify({
    ok: !!(res && res.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    invalidation: inv,
    email: email,
    monthKey: monthKey,
    meta: res && res.meta,
    day_2026_08_05_default_wednesday: res && res.days && res.days['2026-08-05'],
    day_2026_08_06_default_thursday: res && res.days && res.days['2026-08-06'],
    day_2026_08_12_default_wednesday: res && res.days && res.days['2026-08-12'],
    day_2026_08_13_default_thursday: res && res.days && res.days['2026-08-13']
  }, null, 2));
  return res;
}

function RUN_TOOLKIT_AVAILABILITY_CACHE_VERSIONED_R7_STALE_CACHE_GUARD_DIAG() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-08';
  var first = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  var second = getToolkitAvailabilityMonthDirectV5(email, monthKey, { failOnOverlayError: false });
  Logger.log(JSON.stringify({
    ok: !!(first && first.success && second && second.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    monthKey: monthKey,
    firstMeta: first && first.meta,
    secondMeta: second && second.meta,
    secondCacheHit: !!(second && second.meta && second.meta.cacheHit),
    august_05_after_cached_read: second && second.days && second.days['2026-08-05'],
    august_06_after_cached_read: second && second.days && second.days['2026-08-06']
  }, null, 2));
  return { first:first, second:second };
}

function RUN_TOOLKIT_AVAILABILITY_SOFT_HARD_R5_JULY_DIAG() {
  // P0 regression diagnostic for My Availability ↔ Toolkit consistency.
  // Explicit auditor identity only. No Session/user fallback.
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-07';
  _mp_tdm_cacheInvalidate_(email, monthKey);
  var res = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  Logger.log(JSON.stringify({
    ok: !!(res && res.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    email: email,
    monthKey: monthKey,
    meta: res && res.meta,
    day_2026_07_15_default_wednesday: res && res.days && res.days['2026-07-15'],
    day_2026_07_16_default_thursday: res && res.days && res.days['2026-07-16']
  }, null, 2));
  return res;
}

function RUN_TOOLKIT_AVAILABILITY_SOFT_HARD_R5_CLEAR_JULY_CACHE() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-07';
  _mp_tdm_cacheInvalidate_(email, monthKey);
  Logger.log(JSON.stringify({ ok:true, build:TOOLKIT_AVAIL_P0_R2_BUILD, cleared:true, email:email, monthKey:monthKey }, null, 2));
  return { ok:true, cleared:true, email:email, monthKey:monthKey };
}



function RUN_TOOLKIT_AVAILABILITY_CACHE_SIGNATURE_R8_AUGUST_DIAG() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-08';
  var cachedAttempt = getToolkitAvailabilityMonthDirectV5(email, monthKey, { failOnOverlayError: false });
  var fresh = getToolkitAvailabilityMonthDirectV5(email, monthKey, { forceFresh: true, bypassCache: true, failOnOverlayError: false });
  var sheetSig = _mp_tdm_sheetSignature_(email, monthKey);
  Logger.log(JSON.stringify({
    ok: !!(fresh && fresh.success),
    build: TOOLKIT_AVAIL_P0_R2_BUILD,
    email: email,
    monthKey: monthKey,
    sheetSignature: sheetSig,
    cachedAttemptMeta: cachedAttempt && cachedAttempt.meta,
    freshMeta: fresh && fresh.meta,
    day_2026_08_05_wednesday: fresh && fresh.days && fresh.days['2026-08-05'],
    day_2026_08_06_thursday: fresh && fresh.days && fresh.days['2026-08-06'],
    day_2026_08_12_wednesday: fresh && fresh.days && fresh.days['2026-08-12'],
    day_2026_08_13_thursday: fresh && fresh.days && fresh.days['2026-08-13'],
    cached_day_2026_08_05_wednesday: cachedAttempt && cachedAttempt.days && cachedAttempt.days['2026-08-05'],
    cached_day_2026_08_06_thursday: cachedAttempt && cachedAttempt.days && cachedAttempt.days['2026-08-06']
  }, null, 2));
  return { cachedAttempt: cachedAttempt, fresh: fresh, sheetSignature: sheetSig };
}

function RUN_TOOLKIT_AVAILABILITY_CACHE_SIGNATURE_R8_CLEAR_AUGUST_CACHE() {
  var email = 'romboutsrwj@gmail.com';
  var monthKey = '2026-08';
  var res = TDM_invalidateAvailabilityMonthCache(email, monthKey, { lite:false });
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

function RUN_TOOLKIT_AVAILABILITY_SOFT_HARD_R3_JUNE_DIAG() {
  // Backward-compatible alias, now corrected to the explicit auditor testcase.
  return RUN_TOOLKIT_AVAILABILITY_SOFT_HARD_R4_JUNE_DIAG();
}
