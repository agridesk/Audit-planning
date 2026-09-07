// FILE: PlanningWindow.js
// BUILD: PLANNING_WINDOW_SPLIT_d16_20260503
// PURPOSE:
//   Extracted from ManagerPlanningBackend_CORE_SPLIT_d15.js (lines 1475-1660) without
//   functional changes. Owns the planning-window resolver + d14 per-audit cache.
//
// Public functions (kept globally, no behavior change):
//   _mp_resolvePlanningWindow_(ss, hdr, row)
//   _mp_resolvePlanningWindowCached_(ss, hdr, row, auditId)
//   _mp_pwGen_(), _mp_pwGenBump_()
//   _mp_pwCacheKey_(auditId)
//   _mp_planningWindowCacheGet_(auditId)
//   _mp_planningWindowCachePut_(auditId, payload)
//
// External callers (verified): AuditPlanningRowIndexCache_d14.js, MpCacheWarmer_GATE_Q_2_d14.js.
// Internal (CORE_SPLIT) callers: 5 sites, all global so unaffected by file boundary.
//
// Dependencies (resolved globally via GAS single-namespace):
//   ManagerV5_buildIndex_, v5_extractScopesForAuditPlanningRow_, v5_getScopesConfig_,
//   __mp_getCached_, __mp_getSheetDataCached_

/**
 * Phase 2.2 - Planning window resolution (no UI change)
 *
 * - Uses "Extended Expiration Date" (Audit planning col Z per system doc) as decisive expiry anchor.
 * - Active scopes are detected via "x" in per-scope columns in Audit planning.
 * - For each active scope, reads Standards: "Planning from" + "Planning to" (months relative to expiry).
 * - Resolves final window as INTERSECTION of all scope windows.
 * - If intersection is empty, returns UNION for rendering, with a warning flag (soft; planning remains possible).
 * - If expiry date is missing (first-time audits), uses 12-month horizon from today (soft; planning remains possible).
 */
function _mp_resolvePlanningWindow_(ss, hdr, row) {
  var tz = (ss && ss.getSpreadsheetTimeZone) ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();

  function parseDate_(v) {
    if (!v) return null;
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return v;
    var s = String(v || '').trim();
    if (!s) return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (!isNaN(d.getTime())) return d;
    }
    var d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  }
  function fmt_(d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); }
  function addDays_(dateObj, days) {
    var d = new Date(dateObj.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }
  function addMonths_(dateObj, months) {
    var d = new Date(dateObj.getTime());
    var day = d.getDate();
    d.setMonth(d.getMonth() + Number(months || 0));
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }

  var idx = ManagerV5_buildIndex_(hdr || []);
  var idxExpiry = idx.col('extended expiration date');
  var expiry = idxExpiry >= 0 ? parseDate_(row[idxExpiry]) : null;

  var scopeRes = v5_extractScopesForAuditPlanningRow_(hdr, row);
  var activeScopes = (scopeRes.scopes || []).map(function(s){ return s && (s.name || s.code || s.slot) ? String(s.name || s.code || s.slot).trim() : ''; }).filter(function(x){ return !!x; });
  var warnings = [];
  var windows = [];
  var now = new Date();

  if (!expiry) {
    var end = addMonths_(now, 12);
    warnings.push({ code:'NO_EXPIRY_DATE_FIRST_TIME_HORIZON', severity:'INFO', message:'No Extended Expiration Date; using 12-month horizon from today.' });
    return { startDate:fmt_(now), endDate:fmt_(end), mode:'FIRST_TIME_HORIZON', activeScopes:activeScopes, scopeWindows:[], warnings:warnings };
  }

  var cfg = v5_getScopesConfig_(false) || { list:[] };
  var bySlot = cfg.bySlot || {};
  for (var i = 0; i < (scopeRes.scopes || []).length; i++) {
    var sc = scopeRes.scopes[i] || {};
    var def = bySlot[sc.slot] || {};
    // Config_Scopes K/L (Planning from/to) are MONTH offsets relative to expiry.
    // Do not treat these as days; Extension M is also months.
    var fromM = Number(def.planningFrom || sc.planningFrom || 0);
    var toM = Number(def.planningTo || sc.planningTo || 0);
    if (!isFinite(fromM) || !isFinite(toM)) continue;
    if (fromM === 0 && toM === 0) continue;
    windows.push({ scope:(sc.name || sc.code || sc.slot || ''), start:addMonths_(expiry, fromM), end:addMonths_(expiry, toM) });
  }

  // Compatibility fallback only when Config_Scopes has no planning window data.
  if (!windows.length) {
    try {
      var stdMap = __mp_getCached_('STANDARDS_MAP', function(){
        var pack = __mp_getSheetDataCached_(ss, 'Standards');
        var sd = pack.data || [];
        var map = {};
        if (sd && sd.length >= 2) {
          var shdr = sd[0] || [];
          var cName = shdr.indexOf('Name');
          var cFrom = shdr.indexOf('Planning from');
          var cTo = shdr.indexOf('Planning to');
          for (var r = 1; r < sd.length; r++) {
            var nm = String(sd[r][cName] || '').trim();
            if (nm) map[nm] = { from:(cFrom >= 0 ? sd[r][cFrom] : null), to:(cTo >= 0 ? sd[r][cTo] : null) };
          }
        }
        return map;
      });
      for (var j = 0; j < activeScopes.length; j++) {
        var st = stdMap[activeScopes[j]] || null;
        if (!st) continue;
        if (st.from === '' || st.from == null || st.to === '' || st.to == null) continue;
        windows.push({ scope:activeScopes[j], start:addMonths_(expiry, Number(st.from)), end:addMonths_(expiry, Number(st.to)) });
      }
    } catch(eStd) {}
  }

  if (!windows.length) {
    var end2 = addMonths_(now, 12);
    warnings.push({ code:'NO_SCOPE_WINDOWS_FOUND', severity:'WARN', message:'No planning window data found for active scopes; using 12-month horizon from today.' });
    return { startDate:fmt_(now), endDate:fmt_(end2), mode:'FALLBACK_HORIZON', activeScopes:activeScopes, scopeWindows:[], warnings:warnings };
  }

  var maxStart = windows[0].start;
  var minEnd = windows[0].end;
  var minStart = windows[0].start;
  var maxEnd = windows[0].end;
  for (var w = 1; w < windows.length; w++) {
    if (windows[w].start > maxStart) maxStart = windows[w].start;
    if (windows[w].end < minEnd) minEnd = windows[w].end;
    if (windows[w].start < minStart) minStart = windows[w].start;
    if (windows[w].end > maxEnd) maxEnd = windows[w].end;
  }
  var isEmpty = maxStart > minEnd;
  if (isEmpty) warnings.push({ code:'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION', severity:'WARN', message:'Planning windows conflict; using union for rendering (planning still allowed).' });
  var startFinal = isEmpty ? minStart : maxStart;
  var endFinal = isEmpty ? maxEnd : minEnd;
  return {
    startDate:fmt_(startFinal),
    endDate:fmt_(endFinal),
    mode:isEmpty ? 'UNION_FALLBACK' : 'INTERSECTION',
    activeScopes:activeScopes,
    scopeWindows:windows.map(function(x){ return { scope:x.scope, start:fmt_(x.start), end:fmt_(x.end) }; }),
    warnings:warnings
  };
}

// d14: per-audit planning-window cache.
// Window depends on (extended expiry, scope config, planning_from/to) which
// are stable per audit until the row or scopes config changes. Generation-
// keyed so invalidation is O(1) (bump gen via _mp_pwGenBump_).
var MP_PW_NS         = 'MP_PW_V1';
var MP_PW_TTL_SEC    = 1500;
var MP_PW_GEN_KEY    = 'MP_PW_GEN_V1';

function _mp_pwGen_() {
  try {
    var v = CacheService.getScriptCache().get(MP_PW_GEN_KEY);
    if (v) return String(v);
    CacheService.getScriptCache().put(MP_PW_GEN_KEY, '1', 21600);
    return '1';
  } catch (e) { return '0'; }
}
function _mp_pwGenBump_() {
  try {
    var cur = parseInt(CacheService.getScriptCache().get(MP_PW_GEN_KEY) || '1', 10);
    var nxt = String(isFinite(cur) ? cur + 1 : 1);
    CacheService.getScriptCache().put(MP_PW_GEN_KEY, nxt, 21600);
    return nxt;
  } catch (e) { return null; }
}
function _mp_pwCacheKey_(auditId) {
  return MP_PW_NS + '::G' + _mp_pwGen_() + '::' + String(auditId || '').trim();
}
function _mp_planningWindowCacheGet_(auditId) {
  try {
    var raw = CacheService.getScriptCache().get(_mp_pwCacheKey_(auditId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
function _mp_planningWindowCachePut_(auditId, payload) {
  try {
    if (!auditId || !payload) return false;
    var json = JSON.stringify(payload);
    if (json.length <= 95000) {
      CacheService.getScriptCache().put(_mp_pwCacheKey_(auditId), json, MP_PW_TTL_SEC);
      return true;
    }
  } catch (e) {}
  return false;
}
/**
 * d14 cached wrapper. When auditId is provided, short-circuits to cache hit
 * (~10-30ms vs 600ms cold compute). Lazy-fills on miss.
 */
function _mp_resolvePlanningWindowCached_(ss, hdr, row, auditId) {
  if (auditId) {
    var hit = _mp_planningWindowCacheGet_(auditId);
    if (hit) { hit.__cacheHit = true; return hit; }
  }
  var fresh = _mp_resolvePlanningWindow_(ss, hdr, row);
  if (auditId && fresh && !fresh.__cacheHit) _mp_planningWindowCachePut_(auditId, fresh);
  return fresh;
}
