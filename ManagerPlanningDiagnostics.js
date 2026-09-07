/**
 * BUILD: ManagerPlanningCacheWarmersDiag_d3_WITH_FAST_QUAL_CACHE_PROBE_20260504_0938
 *
 * Read-only diagnostics for Planning Toolkit warmers/cache/open speed.
 *
 * Usage:
 * 1) Edit MANAGER_PLANNING_WARMER_DIAG_DEFAULTS_ below if needed.
 * 2) Run RUN_MANAGER_PLANNING_WARMER_DIAG_DEFAULT() in Apps Script.
 */

function MANAGER_PLANNING_WARMER_DIAG_DEFAULTS_() {
  return {
    auditId: 'AUD_BarberetBlanc_HQ_1777555351956_117',
    auditorEmail: 'romboutsrwj@gmail.com',
    monthKey: '2026-09'
  };
}

function RUN_MANAGER_PLANNING_WARMER_DIAG_DEFAULT() {
  return RUN_MANAGER_PLANNING_WARMER_DIAG(MANAGER_PLANNING_WARMER_DIAG_DEFAULTS_());
}

function RUN_MANAGER_PLANNING_WARMER_DIAG(opts) {
  opts = opts || {};

  var started = new Date();
  var out = {
    success: true,
    build: 'ManagerPlanningCacheWarmersDiag_d3_WITH_FAST_QUAL_CACHE_PROBE_20260504_0938',
    startedAt: _mp_diag_iso_(started),
    readonly: true,
    input: {
      auditId: String(opts.auditId || '').trim(),
      auditorEmail: String(opts.auditorEmail || '').trim().toLowerCase(),
      monthKey: String(opts.monthKey || '').trim()
    },
    environment: {},
    functions: {},
    triggers: [],
    cacheProbes: {},
    openProbe: null,
    interpretation: [],
    errors: []
  };

  try { out.environment = _mp_diag_environment_(); } catch (eEnv) { out.errors.push('environment: ' + _mp_diag_err_(eEnv)); }
  try { out.functions = _mp_diag_functions_(); } catch (eFn) { out.errors.push('functions: ' + _mp_diag_err_(eFn)); }
  try { out.triggers = _mp_diag_triggers_(); } catch (eTrig) { out.errors.push('triggers: ' + _mp_diag_err_(eTrig)); }
  try { out.cacheProbes = _mp_diag_cacheProbes_(out.input); } catch (eCache) { out.errors.push('cacheProbes: ' + _mp_diag_err_(eCache)); }

  try {
    if (out.input.auditId) {
      out.openProbe = _mp_diag_openProbe_(out.input.auditId, out.input.monthKey, out.input.auditorEmail);
    } else {
      out.openProbe = { skipped: true, reason: 'No auditId supplied. Use RUN_MANAGER_PLANNING_WARMER_DIAG_DEFAULT().' };
    }
  } catch (eOpen) {
    out.openProbe = { success: false, error: _mp_diag_err_(eOpen) };
    out.errors.push('openProbe: ' + _mp_diag_err_(eOpen));
  }

  out.interpretation = _mp_diag_interpret_(out);
  out.finishedAt = _mp_diag_iso_(new Date());
  out.totalMs = new Date().getTime() - started.getTime();

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_MANAGER_PLANNING_WARMER_DIAG_FOR_AUDIT(auditId, auditorEmail, monthKey) {
  return RUN_MANAGER_PLANNING_WARMER_DIAG({ auditId: auditId, auditorEmail: auditorEmail, monthKey: monthKey });
}

function _mp_diag_environment_() {
  var env = { spreadsheetId: '', spreadsheetName: '', scriptTimeZone: '', effectiveUser: '', activeUser: '' };
  try {
    var ss = SpreadsheetApp.getActive();
    env.spreadsheetId = ss ? ss.getId() : '';
    env.spreadsheetName = ss ? ss.getName() : '';
    env.scriptTimeZone = Session.getScriptTimeZone();
  } catch (e) { env.spreadsheetError = _mp_diag_err_(e); }
  try { env.effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e1) {}
  try { env.activeUser = Session.getActiveUser().getEmail(); } catch (e2) {}
  return env;
}

function _mp_diag_functions_() {
  var names = [
    'V5_ENTRY_resolve',
    'getToolkitOpenFastV5',
    'getToolkitOpenBundleV5_d13',
    'getToolkitOpenLiteV5',
    'getPlanningContextAndFirstMonthV5',
    'getToolkitAvailabilityMonthDirectV5',
    'getToolkitAuditorsV5',
    '_mp_resolvePlanningWindowCached_',
    '_mp_resolvePlanningWindow_',
    '_mp_planningWindowCacheGet_',
    '_mp_planningWindowCachePut_',
    '_mp_pwCacheKey_',
    '_mp_tdm_cacheKey_',
    '_mp_tdm_cacheGet_',
    '_mp_tdm_cachePut_',
    '_mp_tdm_cacheInvalidate_',
    '_mp_calInvalidateForAudit_',
    '_mp_calInvalidateForAuditLite_',
    '_mp_getEligibleAuditorsList_',
    '_mp_getToolkitEligibleAuditorsForRow_',
    '_mp_assertAuditorQualifiedForPlanning_',
    'elig_cacheGet_',
    'elig_cachePut_',
    'elig_cacheInvalidate_',
    'MP_OPEN_SHEET_GET',
    'MP_OPEN_SHEET_PUT',
    'MP_OPEN_SHEET_INVALIDATE',
    'MP_CAL_SHEET_GET',
    'MP_CAL_SHEET_PUT',
    'MP_CAL_SHEET_INVALIDATE',
    'V5_warmAllPendingPlanning_',
    'V5_warmAllPendingPlanning',
    'MP_WARM_OPEN_CACHE_RUN',
    'MP_WARM_CALENDAR_CACHE_RUN',
    'MP_WARM_PLANNING_WINDOW_RUN',
    'OpenCacheWarmer_Run',
    'OpenCacheWarmer_WarmAll',
    'MpCacheWarmer_GATE_Q_Run',
    'CACHEMAINT_RunDailyWarmup',
    'mpWarm_keepHot_',
    'AuditorV5_WarmGridCache',
    '_mp_fastOpenQualifiedCacheKey_',
    '_mp_fastOpenQualifiedCacheGet_',
    '_mp_fastOpenQualifiedCachePut_',
    '_mp_getQualifiedAuditorsFastList_'
  ];
  var out = {};
  names.forEach(function(name) { out[name] = _mp_diag_typeof_(name); });
  return out;
}

function _mp_diag_triggers_() {
  var triggers = [];
  var all = ScriptApp.getProjectTriggers() || [];
  for (var i = 0; i < all.length; i++) {
    var t = all[i];
    var fn = '';
    try { fn = t.getHandlerFunction(); } catch (eFn) {}
    var src = '';
    try { src = String(t.getTriggerSource && t.getTriggerSource()); } catch (eSrc) {}
    var eventType = '';
    try { eventType = String(t.getEventType && t.getEventType()); } catch (eEvt) {}
    var lower = String(fn || '').toLowerCase();
    var looksRelevant = lower.indexOf('warm') >= 0 || lower.indexOf('cache') >= 0 || lower.indexOf('toolkit') >= 0 || lower.indexOf('availability') >= 0 || lower.indexOf('planning') >= 0;
    triggers.push({ handlerFunction: fn, triggerSource: src, eventType: eventType, looksRelevant: looksRelevant });
  }
  return triggers;
}

function _mp_diag_cacheProbes_(input) {
  var auditId = String(input.auditId || '').trim();
  var auditorEmail = String(input.auditorEmail || '').trim().toLowerCase();
  var monthKey = String(input.monthKey || '').trim();
  var out = { planningWindow: {}, availabilityMonth: {}, eligibility: {}, openCache: {}, fastQualified: {}, warnings: [] };

  if (!auditId) {
    out.planningWindow.skipped = true;
    out.planningWindow.reason = 'No auditId supplied.';
    out.openCache.skipped = true;
    out.openCache.reason = 'No auditId supplied.';
  }
  if (!auditorEmail || !monthKey) {
    out.availabilityMonth.skipped = true;
    out.availabilityMonth.reason = 'Need auditorEmail + monthKey.';
  }
  if (auditId) out.openCache = _mp_diag_openCacheProbe_(auditId);
  if (auditorEmail && monthKey) out.availabilityMonth = _mp_diag_tdmCacheProbe_(auditorEmail, monthKey);
  if (auditId) out.eligibility = _mp_diag_eligibilityCacheProbe_(auditId);
  if (auditId) out.fastQualified = _mp_diag_fastQualifiedCacheProbe_(auditId);

  out.planningWindow.note = 'Planning-window cache key requires row/hdr context; use openProbe stages and look for resolvePlanningWindow_*[CACHE].';
  return out;
}

function _mp_diag_openCacheProbe_(auditId) {
  var out = { auditId: auditId, functionAvailable: _mp_diag_typeof_('_mp_open_cacheGet_'), hit: null, error: '' };
  if (out.functionAvailable !== 'function') {
    out.skipped = true;
    out.reason = '_mp_open_cacheGet_ not available.';
    return out;
  }
  try {
    var val = _mp_open_cacheGet_(auditId);
    out.hit = !!val;
    out.valueType = Object.prototype.toString.call(val);
    if (val && typeof val === 'object') {
      out.keys = Object.keys(val).slice(0, 30);
      out.hasDiag = !!val.__diag;
      out.cacheHitFlag = !!val.__cacheHit;
    }
  } catch (e) { out.error = _mp_diag_err_(e); }
  return out;
}

function _mp_diag_tdmCacheProbe_(auditorEmail, monthKey) {
  var out = { auditorEmail: auditorEmail, monthKey: monthKey, keyFunctionAvailable: _mp_diag_typeof_('_mp_tdm_cacheKey_'), getFunctionAvailable: _mp_diag_typeof_('_mp_tdm_cacheGet_'), computedKey: '', hit: null, error: '' };
  try {
    if (out.keyFunctionAvailable === 'function') out.computedKey = _mp_tdm_cacheKey_(auditorEmail, monthKey);
  } catch (eKey) { out.keyError = _mp_diag_err_(eKey); }
  if (out.getFunctionAvailable !== 'function') {
    out.skipped = true;
    out.reason = '_mp_tdm_cacheGet_ not available.';
    return out;
  }
  try {
    var val = _mp_tdm_cacheGet_(auditorEmail, monthKey);
    out.hit = !!val;
    out.valueType = Object.prototype.toString.call(val);
    if (val && typeof val === 'object') {
      out.keys = Object.keys(val).slice(0, 30);
      out.success = val.success;
      out.meta = val.meta || null;
    }
  } catch (e) { out.error = _mp_diag_err_(e); }
  return out;
}

function _mp_diag_eligibilityCacheProbe_(auditId) {
  var out = { auditId: auditId, cacheGetAvailable: _mp_diag_typeof_('elig_cacheGet_'), cachePutAvailable: _mp_diag_typeof_('elig_cachePut_'), cacheInvalidateAvailable: _mp_diag_typeof_('elig_cacheInvalidate_'), hit: null, error: '', note: 'Eligibility cache APIs may require full key/context, not just auditId.' };
  if (out.cacheGetAvailable !== 'function') {
    out.skipped = true;
    out.reason = 'elig_cacheGet_ not available. Open-path likely recomputes eligibility unless another wrapper is used.';
    return out;
  }
  try {
    var val = elig_cacheGet_({ auditId: auditId });
    out.hit = !!val;
    out.valueType = Object.prototype.toString.call(val);
    if (val && typeof val === 'object') {
      out.keys = Object.keys(val).slice(0, 30);
      out.meta = val.meta || null;
    }
  } catch (e) { out.error = _mp_diag_err_(e); }
  return out;
}


function _mp_diag_fastQualifiedCacheProbe_(auditId) {
  var out = {
    auditId: String(auditId || '').trim(),
    keyFunctionAvailable: _mp_diag_typeof_('_mp_fastOpenQualifiedCacheKey_'),
    getFunctionAvailable: _mp_diag_typeof_('_mp_fastOpenQualifiedCacheGet_'),
    computeFunctionAvailable: _mp_diag_typeof_('_mp_getQualifiedAuditorsFastList_'),
    hit: null,
    key: '',
    requiredScopes: [],
    preassigned: '',
    count: null,
    error: ''
  };

  if (!out.auditId) {
    out.skipped = true;
    out.reason = 'No auditId supplied.';
    return out;
  }
  if (out.keyFunctionAvailable !== 'function' || out.getFunctionAvailable !== 'function') {
    out.skipped = true;
    out.reason = 'Fast qualified cache functions not available.';
    return out;
  }

  try {
    var ss = SpreadsheetApp.getActive();
    var rowPack = null;
    if (typeof __mp_getAuditPlanningRow_ === 'function') {
      rowPack = __mp_getAuditPlanningRow_(ss, out.auditId);
    }
    if (!rowPack || !rowPack.row) {
      var pack = (typeof __mp_getSheetDataCached_ === 'function')
        ? __mp_getSheetDataCached_(ss, 'Audit planning')
        : { sh: ss.getSheetByName('Audit planning') };
      if (!pack || !pack.sh) throw new Error("Missing sheet 'Audit planning'");
      var data = pack.data || pack.sh.getDataRange().getValues();
      var hdr = pack.hdr || data[0] || [];
      var colAI = _mp_findCol_(hdr, ['Audit ID']);
      if (colAI < 0) throw new Error("Missing 'Audit ID' column");
      for (var r = 1; r < data.length; r++) {
        if (String(data[r][colAI] || '').trim() === out.auditId) {
          rowPack = { hdr: hdr, row: data[r] };
          break;
        }
      }
    }
    if (!rowPack || !rowPack.row) throw new Error('Audit not found: ' + out.auditId);

    var hdr2 = rowPack.hdr || [];
    var row = rowPack.row || [];
    var colPreAssign = (function(){
      for (var i = 0; i < hdr2.length; i++) {
        var h = String(hdr2[i] || '').toLowerCase();
        if (h.indexOf('pre assigned auditor') >= 0 || h.indexOf('pre-assigned auditor') >= 0 || h.indexOf('preassigned auditor') >= 0) return i;
      }
      return -1;
    })();
    out.preassigned = colPreAssign >= 0 ? String(row[colPreAssign] || '').trim() : '';

    var scopesRes = v5_extractScopesForAuditPlanningRow_(hdr2, row);
    out.requiredScopes = (scopesRes && scopesRes.scopes) ? scopesRes.scopes.map(function(s){
      return (s && (s.name || s.code || s.slot)) ? String(s.name || s.code || s.slot).trim() : '';
    }).filter(function(x){ return !!x; }) : [];

    out.key = _mp_fastOpenQualifiedCacheKey_(out.requiredScopes, out.preassigned);
    var val = _mp_fastOpenQualifiedCacheGet_(out.requiredScopes, out.preassigned);
    out.hit = Array.isArray(val);
    out.count = Array.isArray(val) ? val.length : null;
    out.valueType = Object.prototype.toString.call(val);
  } catch (e) {
    out.error = _mp_diag_err_(e);
  }
  return out;
}

function _mp_diag_openProbe_(auditId, monthKey, auditorEmail) {
  var started = new Date();
  var out = { auditId: auditId, monthKey: monthKey || '', auditorEmail: auditorEmail || '', functionAvailable: _mp_diag_typeof_('getToolkitOpenFastV5'), success: null, wallMs: null, serverMs: null, cacheHit: null, stages: [], rawKeys: [], error: '' };
  if (out.functionAvailable !== 'function') {
    out.success = false;
    out.error = 'getToolkitOpenFastV5 not available.';
    return out;
  }
  try {
    var res = getToolkitOpenFastV5(auditId, monthKey || '', { withCalendar: false, role: 'MANAGER', lockedAuditorEmail: '' });
    out.wallMs = new Date().getTime() - started.getTime();
    out.success = !!(res && res.success);
    out.serverMs = res && res.__serverMs;
    out.cacheHit = !!(res && res.__cacheHit);
    out.rawKeys = res && typeof res === 'object' ? Object.keys(res).slice(0, 50) : [];
    if (res && res.__diag && res.__diag.stages) out.stages = res.__diag.stages;
    out.message = res && res.message ? String(res.message) : '';
  } catch (e) {
    out.wallMs = new Date().getTime() - started.getTime();
    out.success = false;
    out.error = _mp_diag_err_(e);
  }
  return out;
}

function _mp_diag_interpret_(diag) {
  var notes = [];
  var f = diag.functions || {};
  var tr = diag.triggers || [];
  var relTriggers = tr.filter(function(t) { return !!t.looksRelevant; });

  if (!relTriggers.length) notes.push('No relevant warmer/cache/toolkit triggers detected by function name.');
  else notes.push('Relevant trigger-like handlers detected: ' + relTriggers.map(function(t) { return t.handlerFunction; }).join(', '));

  if (f['_mp_resolvePlanningWindowCached_'] === 'function' && f['_mp_planningWindowCacheGet_'] === 'function') notes.push('Planning window cache functions are present.');
  else notes.push('Planning window cache layer is incomplete or not loaded.');

  if (f['_mp_tdm_cacheGet_'] === 'function' && f['getToolkitAvailabilityMonthDirectV5'] === 'function') notes.push('Direct month availability cache functions are present.');
  else notes.push('Direct month availability cache layer is incomplete or not loaded.');

  if (f['elig_cacheGet_'] !== 'function') notes.push('Eligibility cache get function not detected. qualifiedAuditorsFast may still compute live.');

  var op = diag.openProbe || {};
  if (op && op.stages && op.stages.length) {
    var q = _mp_diag_findStage_(op.stages, 'qualifiedAuditorsFast');
    if (q && q.ms > 1000) notes.push('qualifiedAuditorsFast is still expensive in openProbe: ' + q.ms + 'ms. Main remaining open bottleneck.');
    else if (q) notes.push('qualifiedAuditorsFast openProbe stage: ' + q.ms + 'ms.');
    var pw = _mp_diag_stageContains_(op.stages, 'resolvePlanningWindow');
    if (pw && String(pw.name || '').indexOf('[CACHE]') >= 0) notes.push('OpenProbe shows planning-window cache hit: ' + pw.name + '=' + pw.ms + 'ms.');
    var cc = _mp_diag_stageContains_(op.stages, 'companyConstraints');
    if (cc && String(cc.name || '').indexOf('[CACHE]') >= 0) notes.push('OpenProbe shows company constraints cache hit: ' + cc.name + '=' + cc.ms + 'ms.');
  }

  var cp = diag.cacheProbes || {};
  if (cp.availabilityMonth && cp.availabilityMonth.hit === false) notes.push('Availability month cache probe MISS for supplied auditor/month.');
  if (cp.availabilityMonth && cp.availabilityMonth.hit === true) notes.push('Availability month cache probe HIT for supplied auditor/month.');
  if (cp.openCache && cp.openCache.hit === false) notes.push('Open cache probe MISS for supplied auditId.');
  if (cp.openCache && cp.openCache.hit === true) notes.push('Open cache probe HIT for supplied auditId.');
  if (cp.fastQualified && cp.fastQualified.hit === false) notes.push('Fast-qualified cache probe MISS for supplied auditId/scope/preassigned key.');
  if (cp.fastQualified && cp.fastQualified.hit === true) notes.push('Fast-qualified cache probe HIT count=' + cp.fastQualified.count + '.');

  return notes;
}

function _mp_diag_findStage_(stages, name) {
  for (var i = 0; i < (stages || []).length; i++) {
    var s = stages[i] || {};
    if (String(s.name || '') === name) return s;
  }
  return null;
}

function _mp_diag_stageContains_(stages, text) {
  for (var i = 0; i < (stages || []).length; i++) {
    var s = stages[i] || {};
    if (String(s.name || '').indexOf(text) >= 0) return s;
  }
  return null;
}

function _mp_diag_typeof_(globalName) {
  try { return eval('typeof ' + globalName); } catch (e) { return 'error:' + _mp_diag_err_(e); }
}

function _mp_diag_iso_(d) {
  try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"); } catch (e) { return String(d); }
}

function _mp_diag_err_(e) {
  if (!e) return '';
  if (e && e.stack) return String(e.stack);
  if (e && e.message) return String(e.message);
  return String(e);
}
