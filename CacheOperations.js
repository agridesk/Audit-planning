/***********************************************************************
 * FILE: CacheOperations_PRUNED_FULL.gs
 * PURPOSE: minimal production cache operations/admin/health/governance.
 * SOURCE: pruned from existing CacheAdminTools, CacheWarmupRunner,
 * CacheMaintenance and CacheGovernance files.
 * SAFETY: no cache runtime behavior change; no business logic.
 ***********************************************************************/

var CACHEMAINT_TRIGGER_FN = 'CACHEMAINT_RunDailyWarmup';


/***********************************************************************
 * WARMUP / HIT / CLEAR RUNNERS
 ***********************************************************************/

function RUN_CACHE_WARMUP_ALL_SAFE() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    durationMs: 0,
    results: {},
    errors: []
  };

  out.results.notificationConfig = CACHEWARM_runSafe_('RUN_NOTIFICATIONCONFIG_CACHE_WARMUP');
  out.results.configScopes = CACHEWARM_runSafe_('RUN_CONFIGSCOPES_CACHE_WARMUP');
  out.results.companiesIndex = CACHEWARM_runSafe_('RUN_COMPANIESINDEX_CACHE_WARMUP');
  out.results.auditorsIndex = CACHEWARM_runSafe_('RUN_AUDITORSINDEX_CACHE_WARMUP');
  out.results.avLookup = CACHEWARM_runSafe_('RUN_AVLOOKUP_CACHE_WARMUP');

  Object.keys(out.results).forEach(function(k) {
    var r = out.results[k];
    if (!r || r.ok === false) {
      out.ok = false;
      out.errors.push(k + ': ' + (r && r.error ? r.error : 'failed'));
    }
  });

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_HIT_TEST_ALL_SAFE() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    durationMs: 0,
    results: {},
    errors: []
  };

  out.results.notificationConfig = CACHEWARM_runSafe_('RUN_NOTIFICATIONCONFIG_CACHE_HIT_TEST');
  out.results.configScopes = CACHEWARM_runSafe_('RUN_CONFIGSCOPES_CACHE_HIT_TEST');
  out.results.companiesIndex = CACHEWARM_runSafe_('RUN_COMPANIESINDEX_CACHE_HIT_TEST');
  out.results.auditorsIndex = CACHEWARM_runSafe_('RUN_AUDITORSINDEX_CACHE_HIT_TEST');
  out.results.avLookup = CACHEWARM_runSafe_('RUN_AVLOOKUP_CACHE_HIT_TEST');

  Object.keys(out.results).forEach(function(k) {
    var r = out.results[k];
    if (!r || r.ok === false) {
      out.ok = false;
      out.errors.push(k + ': ' + (r && r.error ? r.error : 'failed'));
    }
  });

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_CLEAR_ALL_SAFE() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    durationMs: 0,
    results: {},
    errors: []
  };

  out.results.notificationConfig = CACHEWARM_runSafe_('RUN_NOTIFICATIONCONFIG_CLEARCACHE');
  out.results.configScopes = CACHEWARM_runSafe_('RUN_CONFIGSCOPES_CLEARCACHE');
  out.results.companiesIndex = CACHEWARM_runSafe_('RUN_COMPANIESINDEX_CLEARCACHE');
  out.results.auditorsIndex = CACHEWARM_runSafe_('RUN_AUDITORSINDEX_CLEARCACHE');
  out.results.avLookup = CACHEWARM_runSafe_('RUN_AVLOOKUP_CLEARCACHE');

  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function') {
      out.results.auditCacheDiagnostics = AUDIT_CACHE.diagnostics();
    }
  } catch (eDiag) {}

  Object.keys(out.results).forEach(function(k) {
    var r = out.results[k];
    if (!r || r.ok === false) {
      out.ok = false;
      out.errors.push(k + ': ' + (r && r.error ? r.error : 'failed'));
    }
  });

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_DIAGNOSTICS_ALL_SAFE() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    durationMs: 0,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    results: {},
    errors: []
  };

  out.results.notificationConfig = CACHEWARM_runSafe_('RUN_NOTIFICATIONCONFIG_DIAGNOSTICS');
  out.results.configScopes = CACHEWARM_runSafe_('RUN_CONFIGSCOPES_DIAGNOSTICS');
  out.results.companiesIndex = CACHEWARM_runSafe_('RUN_COMPANIESINDEX_DIAGNOSTICS');
  out.results.auditorsIndex = CACHEWARM_runSafe_('RUN_AUDITORSINDEX_DIAGNOSTICS');
  out.results.avLookup = CACHEWARM_runSafe_('RUN_AVLOOKUP_DIAGNOSTICS');

  Object.keys(out.results).forEach(function(k) {
    var r = out.results[k];
    if (!r || r.ok === false) {
      out.ok = false;
      out.errors.push(k + ': ' + (r && r.error ? r.error : 'failed'));
    }
  });

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function CACHEWARM_runSafe_(fnName) {
  try {
    var fn = this[fnName];
    if (typeof fn !== 'function') {
      return {
        ok: false,
        skipped: true,
        error: 'Missing function: ' + fnName
      };
    }

    return fn();
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.stack ? e.stack : e)
    };
  }
}



/***********************************************************************
 * ADMIN RUNNERS
 ***********************************************************************/

function RUN_CACHE_ADMIN_STATUS() {
  var out = {
    ok: true,
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
      put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function')
    },
    servicesAvailable: {
      notificationConfig: typeof RUN_NOTIFICATIONCONFIG_CACHE_HIT_TEST === 'function',
      configScopes: typeof RUN_CONFIGSCOPES_CACHE_HIT_TEST === 'function',
      companiesIndex: typeof RUN_COMPANIESINDEX_CACHE_HIT_TEST === 'function',
      auditorsIndex: typeof RUN_AUDITORSINDEX_CACHE_HIT_TEST === 'function',
      avLookup: typeof RUN_AVLOOKUP_CACHE_HIT_TEST === 'function',
      allSafeWarmup: typeof RUN_CACHE_WARMUP_ALL_SAFE === 'function',
      allSafeHitTest: typeof RUN_CACHE_HIT_TEST_ALL_SAFE === 'function'
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_ADMIN_REFRESH_ALL_SAFE() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    durationMs: 0,
    clear: CACHEADMIN_runSafe_('RUN_CACHE_CLEAR_ALL_SAFE'),
    warmup: CACHEADMIN_runSafe_('RUN_CACHE_WARMUP_ALL_SAFE'),
    hitTest: CACHEADMIN_runSafe_('RUN_CACHE_HIT_TEST_ALL_SAFE'),
    errors: []
  };

  CACHEADMIN_eval_(out);
  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function CACHEADMIN_runSafe_(fnName) {
  try {
    var fn = this[fnName];
    if (typeof fn !== 'function') {
      return {
        ok: false,
        skipped: true,
        error: 'Missing function: ' + fnName
      };
    }
    return fn();
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.stack ? e.stack : e)
    };
  }
}


function CACHEADMIN_eval_(out) {
  out = out || {};
  out.errors = out.errors || [];

  function walk_(prefix, obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.ok === false) {
      out.ok = false;
      out.errors.push(prefix + ': ' + (obj.error || 'failed'));
    }
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (v && typeof v === 'object') walk_(prefix ? (prefix + '.' + k) : k, v);
    });
  }

  Object.keys(out).forEach(function(k) {
    if (k === 'errors') return;
    walk_(k, out[k]);
  });

  return out;
}



/***********************************************************************
 * HEALTH RUNNERS
 ***********************************************************************/

function RUN_CACHE_HEALTH_REPORT() {
  var started = new Date().getTime();
  var out = {
    ok: true,
    service: 'Cache health report',
    build: '2026-04-24_CACHE_HEALTH_PHASE1',
    timestamp: new Date().toISOString(),
    auditCacheAvailable: CACHEHEALTH_available_(),
    registry: null,
    namespaces: {},
    servicesAvailable: {},
    smoke: {},
    durationMs: 0,
    errors: []
  };

  try {
    out.registry = (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function')
      ? AUDIT_CACHE.diagnostics()
      : { error: 'AUDIT_CACHE diagnostics unavailable' };
  } catch (eDiag) {
    out.ok = false;
    out.errors.push('diagnostics: ' + CACHEHEALTH_err_(eDiag));
  }

  try {
    var ns = (out.registry && out.registry.namespaces) ? out.registry.namespaces : {};
    Object.keys(ns).sort().forEach(function(k) {
      out.namespaces[k] = { registeredKeys: ns[k] };
    });
  } catch (eNs) {
    out.ok = false;
    out.errors.push('namespaces: ' + CACHEHEALTH_err_(eNs));
  }

  out.servicesAvailable = CACHEHEALTH_services_();

  try {
    out.smoke.centralRoundtrip = CACHEHEALTH_roundtrip_();
  } catch (eRt) {
    out.ok = false;
    out.errors.push('roundtrip: ' + CACHEHEALTH_err_(eRt));
  }

  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_HEALTH_HIT_TEST_ALL_SAFE() {
  var started = new Date().getTime();
  var out = {
    ok: true,
    service: 'Cache health hit test all safe',
    build: '2026-04-24_CACHE_HEALTH_PHASE1',
    timestamp: new Date().toISOString(),
    checks: {},
    durationMs: 0,
    errors: []
  };

  out.checks.notificationConfig = CACHEHEALTH_runTimed_('RUN_NOTIFICATIONCONFIG_CACHE_HIT_TEST');
  out.checks.configScopes = CACHEHEALTH_runTimed_('RUN_CONFIGSCOPES_CACHE_HIT_TEST');
  out.checks.companiesIndex = CACHEHEALTH_runTimed_('RUN_COMPANIESINDEX_CACHE_HIT_TEST');
  out.checks.auditorsIndex = CACHEHEALTH_runTimed_('RUN_AUDITORSINDEX_CACHE_HIT_TEST');
  out.checks.avLookup = CACHEHEALTH_runTimed_('RUN_AVLOOKUP_CACHE_HIT_TEST');
  out.checks.globalSafe = CACHEHEALTH_runTimed_('RUN_CACHE_HIT_TEST_ALL_SAFE');

  CACHEHEALTH_eval_(out);
  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_HEALTH_CLEAR_DIAG_ONLY() {
  var out = {
    ok: true,
    service: 'Cache health clear diag only',
    timestamp: new Date().toISOString(),
    cleared: 0,
    auditCacheAvailable: CACHEHEALTH_available_()
  };
  try {
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      out.cleared = AUDIT_CACHE.removeNamespace('diag');
    }
  } catch (e) {
    out.ok = false;
    out.error = CACHEHEALTH_err_(e);
  }
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function CACHEHEALTH_available_() {
  return {
    object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
    get: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.get === 'function'),
    put: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function'),
    remove: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.remove === 'function'),
    removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function'),
    diagnostics: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function')
  };
}


function CACHEHEALTH_services_() {
  return {
    notificationConfig: typeof RUN_NOTIFICATIONCONFIG_CACHE_HIT_TEST === 'function',
    configScopes: typeof RUN_CONFIGSCOPES_CACHE_HIT_TEST === 'function',
    companiesIndex: typeof RUN_COMPANIESINDEX_CACHE_HIT_TEST === 'function',
    auditorsIndex: typeof RUN_AUDITORSINDEX_CACHE_HIT_TEST === 'function',
    avLookup: typeof RUN_AVLOOKUP_CACHE_HIT_TEST === 'function',
    cacheWarmupAllSafe: typeof RUN_CACHE_WARMUP_ALL_SAFE === 'function',
    cacheHitTestAllSafe: typeof RUN_CACHE_HIT_TEST_ALL_SAFE === 'function',
    cacheClearAllSafe: typeof RUN_CACHE_CLEAR_ALL_SAFE === 'function',
    cacheMaintenanceStatus: typeof RUN_CACHEMAINT_STATUS === 'function'
  };
}


function CACHEHEALTH_roundtrip_() {
  var started = new Date().getTime();
  var key = 'health_roundtrip_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var payload = { marker: 'ok', ts: new Date().toISOString() };
  var putOk = false;
  var hit = null;

  if (!(typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.put === 'function' && typeof AUDIT_CACHE.get === 'function')) {
    return { ok: false, durationMs: new Date().getTime() - started, summary: { reason: 'AUDIT_CACHE unavailable' } };
  }

  putOk = AUDIT_CACHE.put('diag', key, payload, 60);
  hit = AUDIT_CACHE.get('diag', key);

  return {
    ok: !!(putOk && hit && hit.marker === 'ok'),
    durationMs: new Date().getTime() - started,
    summary: {
      putOk: putOk,
      hit: !!hit,
      marker: hit && hit.marker ? hit.marker : '',
      cacheService: 'AUDIT_CACHE'
    }
  };
}


function CACHEHEALTH_runTimed_(fnName) {
  var started = new Date().getTime();
  try {
    var fn = this[fnName];
    if (typeof fn !== 'function') {
      return { ok: false, skipped: true, durationMs: new Date().getTime() - started, error: 'Missing function: ' + fnName };
    }
    var res = fn();
    return {
      ok: !(res && res.ok === false) && !(res && res.success === false),
      durationMs: new Date().getTime() - started,
      summary: CACHEHEALTH_summarize_(res)
    };
  } catch (e) {
    return { ok: false, durationMs: new Date().getTime() - started, error: CACHEHEALTH_err_(e) };
  }
}


function CACHEHEALTH_summarize_(res) {
  if (!res || typeof res !== 'object') return { value: res };
  var out = {};
  ['ok','success','durationMs','configRows','ruleRows','catalogRows','byDisplayCount','aliasKeys','uidNameCount','uidCoreCount','locationSummaryCount','auditorCount','qualificationRows','auditors','companies','locations'].forEach(function(k){
    if (res.hasOwnProperty(k)) out[k] = res[k];
  });
  if (res.results && typeof res.results === 'object') out.resultKeys = Object.keys(res.results);
  if (res.errors && res.errors.length) out.errors = res.errors;
  return out;
}


function CACHEHEALTH_eval_(out) {
  out = out || {};
  out.errors = out.errors || [];
  function walk_(prefix, obj) {
    if (!obj || typeof obj !== 'object') return;
    if (obj.ok === false || obj.success === false) {
      out.ok = false;
      out.errors.push(prefix + ': ' + (obj.error || obj.message || 'failed'));
    }
    Object.keys(obj).forEach(function(k) {
      var v = obj[k];
      if (v && typeof v === 'object') walk_(prefix ? (prefix + '.' + k) : k, v);
    });
  }
  Object.keys(out).forEach(function(k) {
    if (k === 'errors') return;
    walk_(k, out[k]);
  });
  return out;
}


function CACHEHEALTH_err_(e) {
  return String(e && e.stack ? e.stack : (e && e.message ? e.message : e));
}



/***********************************************************************
 * MAINTENANCE RUNNERS
 ***********************************************************************/

function CACHEMAINT_RunDailyWarmup() {
  try {
    if (typeof RUN_CACHE_WARMUP_ALL_SAFE === 'function') {
      return RUN_CACHE_WARMUP_ALL_SAFE();
    }

    return {
      ok: false,
      error: 'RUN_CACHE_WARMUP_ALL_SAFE not found'
    };
  } catch (e) {
    Logger.log('CACHEMAINT_RunDailyWarmup error: ' + (e && e.stack ? e.stack : e));
    return {
      ok: false,
      error: String(e && e.message ? e.message : e)
    };
  }
}


function RUN_CACHEMAINT_INSTALL_DAILY_TRIGGER() {
  CACHEMAINT_RemoveDailyTrigger_();

  ScriptApp
    .newTrigger(CACHEMAINT_TRIGGER_FN)
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();

  return {
    ok: true,
    trigger: CACHEMAINT_TRIGGER_FN,
    schedule: 'daily around 05:00 script timezone'
  };
}


function RUN_CACHEMAINT_REMOVE_DAILY_TRIGGER() {
  return CACHEMAINT_RemoveDailyTrigger_();
}


function RUN_CACHEMAINT_STATUS() {
  var triggers = ScriptApp.getProjectTriggers();
  var found = [];

  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction && t.getHandlerFunction() === CACHEMAINT_TRIGGER_FN) {
      found.push({
        handler: t.getHandlerFunction(),
        source: String(t.getTriggerSource && t.getTriggerSource()),
        eventType: String(t.getEventType && t.getEventType())
      });
    }
  }

  return {
    ok: true,
    triggerFunction: CACHEMAINT_TRIGGER_FN,
    installedCount: found.length,
    triggers: found
  };
}


function RUN_CACHEMAINT_CLEAR_AND_WARMUP_NOW() {
  var started = new Date().getTime();

  var clear = null;
  var warmup = null;

  try {
    clear = (typeof RUN_CACHE_CLEAR_ALL_SAFE === 'function')
      ? RUN_CACHE_CLEAR_ALL_SAFE()
      : { ok: false, error: 'RUN_CACHE_CLEAR_ALL_SAFE not found' };
  } catch (e1) {
    clear = { ok: false, error: String(e1 && e1.message ? e1.message : e1) };
  }

  try {
    warmup = (typeof RUN_CACHE_WARMUP_ALL_SAFE === 'function')
      ? RUN_CACHE_WARMUP_ALL_SAFE()
      : { ok: false, error: 'RUN_CACHE_WARMUP_ALL_SAFE not found' };
  } catch (e2) {
    warmup = { ok: false, error: String(e2 && e2.message ? e2.message : e2) };
  }

  var out = {
    ok: !!(clear && clear.ok && warmup && warmup.ok),
    durationMs: new Date().getTime() - started,
    clear: clear,
    warmup: warmup
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function CACHEMAINT_RemoveDailyTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    var t = triggers[i];
    if (t.getHandlerFunction && t.getHandlerFunction() === CACHEMAINT_TRIGGER_FN) {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  }

  return {
    ok: true,
    removed: removed,
    trigger: CACHEMAINT_TRIGGER_FN
  };
}



/***********************************************************************
 * GOVERNANCE CLEANUP RUNNERS
 ***********************************************************************/

function RUN_CACHE_GOVERNANCE_CLEAN_ORPHANS() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    service: 'Cache governance orphan cleanup',
    build: '2026-04-24_CACHE_GOVERNANCE_PHASE2_CLEANUP',
    timestamp: new Date().toISOString(),
    before: null,
    cleaned: [],
    after: null,
    errors: []
  };

  try {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.diagnostics !== 'function') {
      throw new Error('AUDIT_CACHE diagnostics not available');
    }

    if (typeof AUDIT_CACHE.removeNamespace !== 'function') {
      throw new Error('AUDIT_CACHE.removeNamespace not available');
    }

    var before = AUDIT_CACHE.diagnostics();
    out.before = before;

    var namespaces = Object.keys(before.namespaces || {}).sort();

    for (var i = 0; i < namespaces.length; i++) {
      var ns = namespaces[i];
      var count = Number(before.namespaces[ns] || 0);

      if (count !== 0) continue;

      var removed = AUDIT_CACHE.removeNamespace(ns);

      out.cleaned.push({
        namespace: ns,
        registeredKeysBefore: count,
        removedKeys: removed
      });
    }

    out.after = AUDIT_CACHE.diagnostics();

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.stack ? e.stack : e));
  }

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


function RUN_CACHE_GOVERNANCE_POST_CLEAN_REPORT() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    service: 'Cache governance post-clean report',
    build: '2026-04-24_CACHE_GOVERNANCE_PHASE2_CLEANUP',
    timestamp: new Date().toISOString(),
    diagnostics: null,
    orphanNamespaces: [],
    errors: []
  };

  try {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.diagnostics !== 'function') {
      throw new Error('AUDIT_CACHE diagnostics not available');
    }

    var diag = AUDIT_CACHE.diagnostics();
    out.diagnostics = diag;

    var namespaces = Object.keys(diag.namespaces || {}).sort();

    out.orphanNamespaces = namespaces.filter(function(ns) {
      return Number(diag.namespaces[ns] || 0) === 0;
    });

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.stack ? e.stack : e));
  }

  out.durationMs = new Date().getTime() - started;

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}



/***********************************************************************
 * GOVERNANCE INTEGRITY CHECK
 ***********************************************************************/

function RUN_CACHE_GOVERNANCE_INTEGRITY_CHECK() {
  var started = new Date().getTime();

  var out = {
    ok: true,
    service: 'Cache governance integrity check',
    build: '2026-04-24_CACHE_GOVERNANCE_PRUNED',
    timestamp: new Date().toISOString(),
    checks: {},
    errors: []
  };

  try {
    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.diagnostics !== 'function') {
      throw new Error('AUDIT_CACHE diagnostics not available');
    }

    var diag = AUDIT_CACHE.diagnostics();
    var namespaces = Object.keys(diag.namespaces || {});

    out.checks.registryAvailable = {
      ok: true,
      namespaceCount: namespaces.length,
      totalKeys: diag.totalRegisteredKeys || 0
    };

    var orphanNamespaces = namespaces.filter(function(ns) {
      return Number(diag.namespaces[ns] || 0) === 0;
    });

    out.checks.orphanNamespaces = {
      ok: true,
      count: orphanNamespaces.length,
      namespaces: orphanNamespaces
    };

    out.checks.ttlSanity = {
      ok:
        AUDIT_CACHE.TTL.SHORT < AUDIT_CACHE.TTL.MEDIUM &&
        AUDIT_CACHE.TTL.MEDIUM < AUDIT_CACHE.TTL.LONG,
      ttl: AUDIT_CACHE.TTL
    };

    var roundtripKey = 'governance_integrity_' + new Date().getTime();

    AUDIT_CACHE.put('diag', roundtripKey, { marker: 'ok' }, 60);
    var hit = AUDIT_CACHE.get('diag', roundtripKey);

    out.checks.centralRoundtrip = {
      ok: !!(hit && hit.marker === 'ok'),
      hit: !!(hit && hit.marker === 'ok'),
      cacheService: 'AUDIT_CACHE'
    };

    AUDIT_CACHE.remove('diag', roundtripKey);

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.stack ? e.stack : e));
  }

  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/***********************************************************************
 * EXT / PLANNING WINDOW CACHE INVALIDATION
 * BUILD: 2026-05-14_EXT_TOOLKIT_CACHE_INVALIDATION_R3
 * PURPOSE:
 * - Safe cache invalidation after EXT apply/undo changes Audit planning AS/AT.
 * - Keep cache as acceleration only; Audit planning remains truth.
 * - No business logic, no status logic, no planning write logic.
 *
 * USAGE:
 * Call EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE(auditId, auditorEmail)
 * immediately after the successful AS/AT write in the existing EXT apply/undo flow.
 ***********************************************************************/

function EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE(auditId, auditorEmail) {
  var started = new Date().getTime();
  var out = {
    ok: true,
    build: '2026-05-14_EXT_TOOLKIT_CACHE_INVALIDATION_R3',
    auditId: String(auditId || '').trim(),
    auditorEmail: String(auditorEmail || '').trim().toLowerCase(),
    removed: {},
    warnings: [],
    errors: [],
    durationMs: 0
  };

  try {
    if (!out.auditId) {
      throw new Error('Missing auditId. EXT cache invalidation must be audit-scoped.');
    }

    if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE) {
      throw new Error('AUDIT_CACHE unavailable. Cannot safely invalidate Toolkit cache.');
    }

    if (typeof AUDIT_CACHE.removeToolkitCompanyContext === 'function') {
      out.removed.toolkitCompanyContext = AUDIT_CACHE.removeToolkitCompanyContext(out.auditId);
    } else {
      out.warnings.push('AUDIT_CACHE.removeToolkitCompanyContext unavailable');
    }

    /*
     * EXT apply/undo changes planning-window semantics.
     * Toolkit may hydrate the window/calendar from several acceleration namespaces.
     * Clear only volatile planning/toolkit/availability caches.
     * Do NOT clear reference/config/company/auditor indexes.
     * Do NOT call AUDIT_CACHE.removeAll().
     */
    if (typeof AUDIT_CACHE.removeAvailabilityAll === 'function') {
      out.removed.availability = AUDIT_CACHE.removeAvailabilityAll();
    } else {
      out.removed.availability = EXT_REMOVE_CACHE_NAMESPACE_SAFE_('availability');
    }

    out.removed.managerTools = EXT_REMOVE_CACHE_NAMESPACE_SAFE_('manager_tools');
    out.removed.manager = EXT_REMOVE_CACHE_NAMESPACE_SAFE_('manager');
    out.removed.planning = EXT_REMOVE_CACHE_NAMESPACE_SAFE_('planning');

    if (out.auditorEmail && typeof AUDIT_CACHE.removeAuditorGrid === 'function') {
      out.removed.auditorGrid = AUDIT_CACHE.removeAuditorGrid(out.auditorEmail);
    }

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.stack ? e.stack : e));
  }

  out.durationMs = new Date().getTime() - started;
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function EXT_REMOVE_CACHE_NAMESPACE_SAFE_(namespaceName) {
  if (typeof AUDIT_CACHE === 'undefined' || !AUDIT_CACHE || typeof AUDIT_CACHE.removeNamespace !== 'function') {
    return { ok: false, skipped: true, reason: 'AUDIT_CACHE.removeNamespace unavailable' };
  }

  var ns = String(namespaceName || '').trim();
  if (!ns) return { ok: false, skipped: true, reason: 'missing namespace' };

  try {
    return {
      ok: true,
      namespace: ns,
      removedKeys: AUDIT_CACHE.removeNamespace(ns)
    };
  } catch (e) {
    return {
      ok: false,
      namespace: ns,
      error: String(e && e.stack ? e.stack : e)
    };
  }
}

function RUN_EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE_TEST() {
  var out = {
    ok: true,
    build: '2026-05-14_EXT_TOOLKIT_CACHE_INVALIDATION_R3',
    functionAvailable: typeof EXT_INVALIDATE_TOOLKIT_AFTER_WINDOW_CHANGE === 'function',
    helperAvailable: typeof EXT_REMOVE_CACHE_NAMESPACE_SAFE_ === 'function',
    auditCacheAvailable: {
      object: (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE),
      removeToolkitCompanyContext: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeToolkitCompanyContext === 'function'),
      removeAvailabilityAll: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAvailabilityAll === 'function'),
      removeNamespace: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function'),
      removeAuditorGrid: (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function')
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// Auditor/scope cache refresh runner moved to:
// Cache_Admin_AuditorScopeInvalidation.gs
// Function: RUN_AUDITOR_SCOPE_CACHE_REFRESH()