/**
 * FILE: AMS01_PerformanceBaseline.js
 * BUILD: AMS01_PERFORMANCE_BASELINE_20260907
 * PURPOSE:
 *   Read-only consolidated baseline runner for AMS-01 — Performance & Hot Paths.
 *
 * GOVERNANCE:
 *   - No writes, no status transitions.
 *   - Reuses existing canonical runtime endpoints.
 *   - Measures server execution only. Browser/GAS proxy/paint metrics remain owned by
 *     existing UI instrumentation (including ManagerPlanningUI_perf.html).
 */

function AMS01_RunPerformanceBaseline() {
  return AMS01_RunPerformanceBaselineWithOptions({});
}

function AMS01_RunPerformanceBaselineWithOptions(opts) {
  opts = opts || {};
  var started = Date.now();
  var out = {
    build: 'AMS01_PERFORMANCE_BASELINE_20260907',
    generatedAt: new Date().toISOString(),
    runtimeEnv: AMS01_env_(),
    selection: {},
    probes: [],
    summary: {},
    notes: [
      'Server-side timings only.',
      'Calendar Shell Interactive and Planning Decision-Ready are measured client-side in DEV.',
      'No probe performs a write or status transition.'
    ]
  };

  var selection = AMS01_selectFixture_(opts);
  out.selection = selection;

  AMS01_probe_(out, 'Manager Portal — open grid', 'getManagerV5Open', function() {
    if (typeof getManagerV5Open !== 'function') return AMS01_missing_('getManagerV5Open');
    return getManagerV5Open();
  });

  AMS01_probe_(out, 'Manager Portal — dashboard summary', 'getManagerV5DashboardData', function() {
    if (typeof getManagerV5DashboardData !== 'function') return AMS01_missing_('getManagerV5DashboardData');
    return getManagerV5DashboardData();
  });

  if (selection.auditId) {
    AMS01_probe_(out, 'Planning Toolkit — fast open', 'getToolkitOpenFastV5', function() {
      if (typeof getToolkitOpenFastV5 !== 'function') return AMS01_missing_('getToolkitOpenFastV5');
      return getToolkitOpenFastV5(selection.auditId, selection.monthKey || '', {
        role: 'MANAGER',
        withCalendar: false,
        forceFresh: !!opts.forceFresh
      });
    });

    AMS01_probe_(out, 'Planning Toolkit — open bundle', 'getToolkitOpenBundleV5_d13', function() {
      if (typeof getToolkitOpenBundleV5_d13 !== 'function') return AMS01_missing_('getToolkitOpenBundleV5_d13');
      return getToolkitOpenBundleV5_d13(selection.auditId, selection.monthKey || '', {
        role: 'MANAGER',
        withCalendar: false,
        forceFresh: !!opts.forceFresh
      });
    });

    AMS01_probe_(out, 'Planning Toolkit — auditor eligibility', 'getToolkitAuditorsV5', function() {
      if (typeof getToolkitAuditorsV5 !== 'function') return AMS01_missing_('getToolkitAuditorsV5');
      return getToolkitAuditorsV5(selection.auditId);
    });
  }

  if (selection.auditorEmail && selection.monthKey) {
    AMS01_probe_(out, 'Planning Toolkit — visible month availability', 'getToolkitAvailabilityMonthDirectV5', function() {
      if (typeof getToolkitAvailabilityMonthDirectV5 !== 'function') return AMS01_missing_('getToolkitAvailabilityMonthDirectV5');
      return getToolkitAvailabilityMonthDirectV5(selection.auditorEmail, selection.monthKey, {
        forceFresh: !!opts.forceFresh
      });
    });
  }

  if (selection.auditorEmail) {
    AMS01_probe_(out, 'Auditor Portal — active grid', 'AuditorV5B_GetAuditorGrid_U20409', function() {
      if (typeof AuditorV5B_GetAuditorGrid_U20409 !== 'function') return AMS01_missing_('AuditorV5B_GetAuditorGrid_U20409');
      return AuditorV5B_GetAuditorGrid_U20409({
        view: 'active',
        auditorEmail: selection.auditorEmail,
        noCache: !!opts.forceFresh
      });
    });
  }

  out.summary = AMS01_summarize_(out.probes);
  out.totalRunnerMs = Date.now() - started;

  try { Logger.log('[AMS01_BASELINE] ' + JSON.stringify(out)); } catch (eLog) {}
  return out;
}

function AMS01_probe_(out, label, fnName, fn) {
  var t0 = Date.now();
  var probe = {
    label: label,
    functionName: fnName,
    ok: false,
    wallMs: 0,
    serverReportedMs: null,
    cacheHit: null,
    rowsReturned: null,
    payloadBytesEstimate: null,
    perf: null,
    error: ''
  };

  try {
    var res = fn();
    probe.wallMs = Date.now() - t0;
    if (res && res.__missing) {
      probe.error = res.message || 'MISSING_FUNCTION';
    } else {
      probe.ok = !(res && res.success === false);
      probe.serverReportedMs = AMS01_pickNumber_(res, ['__serverMs', 'serverMs', 'totalMs']);
      probe.cacheHit = AMS01_pickBool_(res, ['__cacheHit', 'cacheHit']);
      probe.rowsReturned = AMS01_rowsReturned_(res);
      probe.payloadBytesEstimate = AMS01_payloadBytes_(res);
      probe.perf = AMS01_compactPerf_(res);
      if (!probe.ok) probe.error = String((res && (res.message || res.error)) || 'FAILED');
    }
  } catch (e) {
    probe.wallMs = Date.now() - t0;
    probe.error = String(e && e.message ? e.message : e);
  }

  out.probes.push(probe);
}

function AMS01_selectFixture_(opts) {
  var selected = {
    auditId: String(opts.auditId || '').trim(),
    auditorEmail: String(opts.auditorEmail || '').trim().toLowerCase(),
    monthKey: String(opts.monthKey || '').trim()
  };

  if (!/^\d{4}-\d{2}$/.test(selected.monthKey)) selected.monthKey = '';

  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss && ss.getSheetByName('Audit planning');
    if (!sh) return selected;
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return selected;

    var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var idxAudit = AMS01_header_(hdr, ['Audit ID', 'Audit_ID', 'AuditID']);
    var idxStatus = AMS01_header_(hdr, ['Status']);
    var idxAssigned = AMS01_header_(hdr, ['Assigned to', 'Assigned To', 'Auditor']);
    var idxJson = AMS01_header_(hdr, ['Planning JSON', 'Planning_JSON']);
    var idxExpire = AMS01_header_(hdr, ['Date - Will Expire', 'Expiration date', 'Expiry date']);

    var width = lastCol;
    var values = sh.getRange(2, 1, Math.min(lastRow - 1, 250), width).getValues();

    for (var r = 0; r < values.length; r++) {
      var row = values[r] || [];
      var status = idxStatus >= 0 ? String(row[idxStatus] || '').trim().toUpperCase() : '';
      if (status && ['COMPLETED', 'REJECTED'].indexOf(status.replace(/\s+/g, '_')) >= 0) continue;

      if (!selected.auditId && idxAudit >= 0) selected.auditId = String(row[idxAudit] || '').trim();

      if (!selected.auditorEmail) {
        var em = '';
        if (idxAssigned >= 0) {
          var assigned = String(row[idxAssigned] || '').trim().toLowerCase();
          if (assigned.indexOf('@') > 0) em = assigned;
        }
        if (!em && idxJson >= 0 && row[idxJson]) {
          try {
            var pj = JSON.parse(String(row[idxJson]));
            em = String((pj && pj.auditorEmail) || '').trim().toLowerCase();
          } catch (eJson) {}
        }
        if (em) selected.auditorEmail = em;
      }

      if (!selected.monthKey && idxExpire >= 0) {
        var v = row[idxExpire];
        var d = null;
        if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) d = v;
        else {
          var s = String(v || '').trim();
          var m = s.match(/^(\d{4})[-\/](\d{1,2})/);
          if (m) selected.monthKey = m[1] + '-' + ('0' + m[2]).slice(-2);
        }
        if (d) selected.monthKey = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      }

      if (selected.auditId && selected.auditorEmail && selected.monthKey) break;
    }
  } catch (e) {}

  if (!selected.monthKey) {
    var now = new Date();
    selected.monthKey = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
  }
  return selected;
}

function AMS01_header_(hdr, names) {
  var norm = function(v) { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); };
  var map = {};
  for (var i = 0; i < hdr.length; i++) map[norm(hdr[i])] = i;
  for (var j = 0; j < names.length; j++) {
    var k = norm(names[j]);
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
  }
  return -1;
}

function AMS01_pickNumber_(obj, keys) {
  obj = obj || {};
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] != null && isFinite(Number(obj[keys[i]]))) return Number(obj[keys[i]]);
  }
  if (obj.perf && typeof obj.perf === 'object') {
    for (var j = 0; j < keys.length; j++) {
      if (obj.perf[keys[j]] != null && isFinite(Number(obj.perf[keys[j]]))) return Number(obj.perf[keys[j]]);
    }
  }
  return null;
}

function AMS01_pickBool_(obj, keys) {
  obj = obj || {};
  for (var i = 0; i < keys.length; i++) if (typeof obj[keys[i]] === 'boolean') return obj[keys[i]];
  if (obj.perf && typeof obj.perf === 'object') {
    for (var j = 0; j < keys.length; j++) if (typeof obj.perf[keys[j]] === 'boolean') return obj.perf[keys[j]];
  }
  return null;
}

function AMS01_rowsReturned_(res) {
  if (!res) return null;
  if (Array.isArray(res.rows)) return res.rows.length;
  if (Array.isArray(res.auditors)) return res.auditors.length;
  if (res.perf && isFinite(Number(res.perf.rowsReturned))) return Number(res.perf.rowsReturned);
  return null;
}

function AMS01_payloadBytes_(res) {
  try {
    if (res && res.__d48OpenRouteInstrumentation && isFinite(Number(res.__d48OpenRouteInstrumentation.responseBytesEstimate))) {
      return Number(res.__d48OpenRouteInstrumentation.responseBytesEstimate);
    }
    return Utilities.newBlob(JSON.stringify(res || {})).getBytes().length;
  } catch (e) {
    return null;
  }
}

function AMS01_compactPerf_(res) {
  var p = res && res.perf && typeof res.perf === 'object' ? res.perf : null;
  if (!p) return null;
  var keep = ['serverMs','totalMs','readMs','mapsMs','loopMs','candidateRows','rowsReturned','fromCache','cacheSource','fastFirstPaint','enrichmentDeferred','mode'];
  var out = {};
  for (var i = 0; i < keep.length; i++) if (p[keep[i]] != null) out[keep[i]] = p[keep[i]];
  return out;
}

function AMS01_summarize_(probes) {
  var ok = (probes || []).filter(function(p) { return p.ok; });
  var sorted = ok.slice().sort(function(a, b) { return Number(b.wallMs || 0) - Number(a.wallMs || 0); });
  return {
    successfulProbes: ok.length,
    failedProbes: (probes || []).length - ok.length,
    slowest: sorted.slice(0, 5).map(function(p) {
      return {
        label: p.label,
        wallMs: p.wallMs,
        serverReportedMs: p.serverReportedMs,
        cacheHit: p.cacheHit,
        rowsReturned: p.rowsReturned,
        payloadBytesEstimate: p.payloadBytesEstimate
      };
    })
  };
}

function AMS01_missing_(name) {
  return { __missing: true, success: false, message: 'Missing function: ' + name };
}

function AMS01_env_() {
  try {
    if (typeof EnvironmentGuard_getRuntimeEnv === 'function') return String(EnvironmentGuard_getRuntimeEnv() || '').toUpperCase();
    if (typeof SYS_getActiveEnv === 'function') return String(SYS_getActiveEnv() || '').toUpperCase();
  } catch (e) {}
  return 'UNKNOWN';
}
