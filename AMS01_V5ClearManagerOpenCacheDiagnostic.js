function AMS01_RunV5ClearManagerOpenCacheDiagnostic() {
  var BUILD = 'AMS01_V5_CLEAR_MANAGER_OPEN_CACHE_DIAG_20260908_R1';
  var auditId = 'AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var calls = [];
  var originals = {};

  function wrap_(name) {
    try {
      var fn = this[name];
      if (typeof fn !== 'function') return;
      originals[name] = fn;
      this[name] = function() {
        var t0 = Date.now();
        var ok = true;
        var err = '';
        var result;
        try {
          result = fn.apply(this, arguments);
          return result;
        } catch (e) {
          ok = false;
          err = String(e && e.message ? e.message : e);
          throw e;
        } finally {
          calls.push({ name: name, wallMs: Date.now() - t0, ok: ok, error: err });
        }
      };
    } catch (eWrap) {}
  }

  ['__mp_invalidateAuditPlanningPack_', '__mp_invalidatePersistCaches_', '_mp_open_cacheInvalidate_', '_mp_aud_cacheInvalidate_'].forEach(wrap_);

  var t0 = Date.now();
  var ok = true;
  var error = '';
  try {
    if (typeof V5_clearManagerOpenCache_ !== 'function') throw new Error('V5_clearManagerOpenCache_ unavailable');
    V5_clearManagerOpenCache_(auditId);
  } catch (e) {
    ok = false;
    error = String(e && e.message ? e.message : e);
  } finally {
    Object.keys(originals).forEach(function(name) {
      try { this[name] = originals[name]; } catch (eRestore) {}
    });
  }

  var out = {
    build: BUILD,
    auditId: auditId,
    ok: ok,
    error: error,
    wallMs: Date.now() - t0,
    nestedCalls: calls
  };
  Logger.log('[AMS01_V5_CLEAR_MANAGER_OPEN_CACHE_DIAG] ' + JSON.stringify(out));
  return out;
}
