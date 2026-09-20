// FILE: ManagerPlanningWindow.js
// BUILD: 2026-09-20_AMS_01_6_MODEL_C_RUNTIME_WINDOW_OWNER_R2
// PURPOSE:
// - Model C Audit_Obligations is canonical for planning windows.
// - Audit planning expiry/window fields are compatibility fallback only.
// - Existing cache contract remains intact.
// - Canonical window is projected into the in-memory Audit planning row so
//   legacy wrappers cannot override Model C with stale AS/AT values.

var MODEL_C_RUNTIME_WINDOW_BUILD = '2026-09-20_AMS_01_6_MODEL_C_RUNTIME_WINDOW_OWNER_R2';

function ModelCRuntime_headerIndex_(hdr, names) {
  hdr = hdr || [];
  var wanted = (names || []).map(function(x) {
    return String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  });
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    for (var j = 0; j < wanted.length; j++) if (h && h === wanted[j]) return i;
  }
  return -1;
}

function ModelCRuntime_resolvePlanningWindow_(ss, hdr, row) {
  ss = ss || SpreadsheetApp.getActive();
  hdr = hdr || [];
  row = row || [];

  function norm_(v) { return String(v == null ? '' : v).trim(); }
  function dateText_(v) {
    if (!v) return '';
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    }
    var s = norm_(v);
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? (m[1] + '-' + m[2] + '-' + m[3]) : s;
  }
  function objects_(sheet) {
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return [];
    var values = sheet.getDataRange().getValues();
    var headers = values[0] || [];
    return values.slice(1).map(function(r) {
      var o = {};
      for (var c = 0; c < headers.length; c++) o[String(headers[c] || '')] = r[c];
      return o;
    });
  }

  var auditIdx = ModelCRuntime_headerIndex_(hdr, ['Audit ID']);
  var auditId = auditIdx >= 0 ? norm_(row[auditIdx]) : '';
  if (!auditId) return { success:false, reason:'NO_AUDIT_ID' };

  var obSheet = ss.getSheetByName('Audit_Obligations');
  var linkSheet = ss.getSheetByName('Audit_Visit_Obligations');
  if (!obSheet || !linkSheet) return { success:false, reason:'MODEL_C_SHEETS_MISSING', auditId:auditId };

  var obligations = objects_(obSheet);
  var links = objects_(linkSheet);
  var obById = {};
  obligations.forEach(function(ob) {
    var id = norm_(ob.Obligation_ID);
    if (id) obById[id] = ob;
  });

  var active = [];
  links.forEach(function(link) {
    if (norm_(link.Audit_ID) !== auditId) return;
    if (norm_(link.Link_State).toUpperCase() !== 'ACTIVE') return;
    var ob = obById[norm_(link.Obligation_ID)];
    if (!ob) return;
    var state = norm_(ob.Obligation_State).toUpperCase();
    if (state === 'CANCELLED' || state === 'COMPLETED' || state === 'REJECTED') return;
    active.push(ob);
  });

  if (!active.length) return { success:false, reason:'NO_ACTIVE_MODEL_C_OBLIGATIONS', auditId:auditId };

  var scopeWindows = [];
  var activeScopes = [];
  active.forEach(function(ob) {
    var scope = norm_(ob.ScopeCode);
    if (scope) activeScopes.push(scope);
    var from = dateText_(ob.Planning_Window_From);
    var to = dateText_(ob.Planning_Window_To);
    if (from && to) scopeWindows.push({ scope:scope, start:from, end:to });
  });

  if (!scopeWindows.length) {
    return { success:false, reason:'MODEL_C_WINDOWS_MISSING', auditId:auditId, activeScopes:activeScopes };
  }

  var maxStart = scopeWindows[0].start;
  var minEnd = scopeWindows[0].end;
  var minStart = scopeWindows[0].start;
  var maxEnd = scopeWindows[0].end;
  for (var i = 1; i < scopeWindows.length; i++) {
    if (scopeWindows[i].start > maxStart) maxStart = scopeWindows[i].start;
    if (scopeWindows[i].end < minEnd) minEnd = scopeWindows[i].end;
    if (scopeWindows[i].start < minStart) minStart = scopeWindows[i].start;
    if (scopeWindows[i].end > maxEnd) maxEnd = scopeWindows[i].end;
  }

  var conflict = maxStart > minEnd;
  return {
    success:true,
    auditId:auditId,
    startDate: conflict ? minStart : maxStart,
    endDate: conflict ? maxEnd : minEnd,
    mode: conflict ? 'MODEL_C_UNION_RENDER_HARD_BLOCK' : 'MODEL_C_INTERSECTION',
    source:'Audit_Obligations',
    owner:'Audit_Obligations',
    hardBlock:conflict,
    activeScopes:activeScopes,
    scopeWindows:scopeWindows,
    warnings: conflict ? [{
      code:'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION',
      severity:'ERROR',
      message:'Planning windows have no intersection; planning must be blocked.'
    }] : []
  };
}

function ModelCRuntime_projectCanonicalWindowIntoRow_(hdr, row, canonical) {
  if (!canonical || canonical.success !== true || !row) return;
  var fromIdx = ModelCRuntime_headerIndex_(hdr, ['Planning window from','Plan van','Planning from']);
  var toIdx = ModelCRuntime_headerIndex_(hdr, ['Planning window to','Plant tot','Planning to']);
  if (fromIdx >= 0) row[fromIdx] = canonical.startDate || '';
  if (toIdx >= 0) row[toIdx] = canonical.endDate || '';
}

/**
 * Runtime planning-window resolver.
 * Model C is canonical. Legacy Audit planning fields are fallback only for
 * unmigrated/missing Model C records during the compatibility period.
 */
function _mp_resolvePlanningWindow_(ss, hdr, row) {
  var canonical = ModelCRuntime_resolvePlanningWindow_(ss, hdr, row);
  if (canonical && canonical.success === true) {
    ModelCRuntime_projectCanonicalWindowIntoRow_(hdr, row, canonical);
    return canonical;
  }
  return ModelCRuntime_resolveLegacyPlanningWindow_(ss, hdr, row, canonical);
}

function ModelCRuntime_resolveLegacyPlanningWindow_(ss, hdr, row, canonicalFailure) {
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
  var activeScopes = (scopeRes.scopes || []).map(function(s){
    return s && (s.name || s.code || s.slot) ? String(s.name || s.code || s.slot).trim() : '';
  }).filter(function(x){ return !!x; });
  var warnings = [{
    code:'LEGACY_PLANNING_WINDOW_FALLBACK',
    severity:'WARN',
    message:'Model C planning window unavailable; compatibility fallback used.',
    reason: canonicalFailure && canonicalFailure.reason ? canonicalFailure.reason : 'UNKNOWN'
  }];
  var windows = [];
  var now = new Date();

  if (!expiry) {
    var end = addMonths_(now, 12);
    warnings.push({ code:'NO_EXPIRY_DATE_FIRST_TIME_HORIZON', severity:'INFO', message:'No Extended Expiration Date; using 12-month horizon from today.' });
    return { startDate:fmt_(now), endDate:fmt_(end), mode:'LEGACY_FIRST_TIME_HORIZON', source:'Audit planning compatibility', activeScopes:activeScopes, scopeWindows:[], warnings:warnings };
  }

  var cfg = v5_getScopesConfig_(false) || { list:[] };
  var bySlot = cfg.bySlot || {};
  for (var i = 0; i < (scopeRes.scopes || []).length; i++) {
    var sc = scopeRes.scopes[i] || {};
    var def = bySlot[sc.slot] || {};
    var fromM = Number(def.planningFrom || sc.planningFrom || 0);
    var toM = Number(def.planningTo || sc.planningTo || 0);
    if (!isFinite(fromM) || !isFinite(toM)) continue;
    if (fromM === 0 && toM === 0) continue;
    windows.push({ scope:(sc.name || sc.code || sc.slot || ''), start:addMonths_(expiry, fromM), end:addMonths_(expiry, toM) });
  }

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
    warnings.push({ code:'NO_SCOPE_WINDOWS_FOUND', severity:'WARN', message:'No planning window data found; using 12-month horizon.' });
    return { startDate:fmt_(now), endDate:fmt_(end2), mode:'LEGACY_FALLBACK_HORIZON', source:'Audit planning compatibility', activeScopes:activeScopes, scopeWindows:[], warnings:warnings };
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
  if (isEmpty) warnings.push({ code:'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION', severity:'ERROR', message:'Planning windows conflict; compatibility union is display-only.' });
  return {
    startDate:fmt_(isEmpty ? minStart : maxStart),
    endDate:fmt_(isEmpty ? maxEnd : minEnd),
    mode:isEmpty ? 'LEGACY_UNION_RENDER_HARD_BLOCK' : 'LEGACY_INTERSECTION',
    source:'Audit planning compatibility',
    hardBlock:isEmpty,
    activeScopes:activeScopes,
    scopeWindows:windows.map(function(x){ return { scope:x.scope, start:fmt_(x.start), end:fmt_(x.end) }; }),
    warnings:warnings
  };
}

var MP_PW_NS = 'MP_PW_V2_MODEL_C';
var MP_PW_TTL_SEC = 1500;
var MP_PW_GEN_KEY = 'MP_PW_GEN_V2_MODEL_C';

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
    return raw ? JSON.parse(raw) : null;
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
function _mp_resolvePlanningWindowCached_(ss, hdr, row, auditId) {
  if (auditId) {
    var hit = _mp_planningWindowCacheGet_(auditId);
    if (hit) { hit.__cacheHit = true; return hit; }
  }
  var fresh = _mp_resolvePlanningWindow_(ss, hdr, row);
  if (auditId && fresh && !fresh.__cacheHit) _mp_planningWindowCachePut_(auditId, fresh);
  return fresh;
}
