/**
 * FILE: AMS01_PerformanceBaseline.js
 * BUILD: AMS01_PERFORMANCE_BASELINE_20260907_R3
 * PURPOSE:
 *   Consolidated AMS-01 diagnostics for server-side hot paths.
 *
 * GOVERNANCE:
 *   - Business data is read-only.
 *   - AMS01_RunAndStorePerformanceBaseline writes diagnostics only to
 *     AMS01_Performance_Baseline so results can be inspected without copy/paste.
 *   - No status transitions, planning writes or availability writes.
 *   - Browser/GAS proxy/paint metrics remain owned by UI instrumentation.
 */

var AMS01_BASELINE_BUILD = 'AMS01_PERFORMANCE_BASELINE_20260907_R3';
var AMS01_BASELINE_SHEET = 'AMS01_Performance_Baseline';

function AMS01_RunPerformanceBaseline() {
  return AMS01_RunPerformanceBaselineWithOptions({ forceFresh:true });
}

function AMS01_RunAndStorePerformanceBaseline() {
  var result = AMS01_RunPerformanceBaselineWithOptions({ forceFresh:true });
  var stored = AMS01_store_(result);
  result.storage = stored;
  return result;
}

function AMS01_RunPerformanceBaselineWithOptions(opts) {
  opts = opts || {};
  var started = Date.now();
  var selection = AMS01_fixture_(opts);
  var out = {
    build: AMS01_BASELINE_BUILD,
    generatedAt: new Date().toISOString(),
    runtimeEnv: AMS01_env_(),
    forceFresh: opts.forceFresh !== false,
    sequentialComposite: true,
    selection: selection,
    probes: [],
    summary: {},
    notes: [
      'Server-side diagnostic composite; probes share one Apps Script execution.',
      'User-facing bundle is measured before its component probes to reduce warm-up bias.',
      'Business data is not mutated.',
      'Calendar Shell Interactive and Planning Decision-Ready are measured client-side in DEV.'
    ]
  };

  var forceFresh = opts.forceFresh !== false;

  if (selection.auditId) {
    AMS01_probe_(out, 'Planning Toolkit — user-facing open bundle', 'getToolkitOpenBundleV5_d13', function() {
      if (typeof getToolkitOpenBundleV5_d13 !== 'function') return AMS01_missing_('getToolkitOpenBundleV5_d13');
      return getToolkitOpenBundleV5_d13(selection.auditId, selection.monthKey, {
        role:'MANAGER',
        withCalendar:false,
        forceFresh:forceFresh
      });
    });
  }

  if (selection.auditorEmail && selection.monthKey) {
    AMS01_probe_(out, 'Planning Toolkit — visible month availability', 'getToolkitAvailabilityMonthDirectV5', function() {
      if (typeof getToolkitAvailabilityMonthDirectV5 !== 'function') return AMS01_missing_('getToolkitAvailabilityMonthDirectV5');
      return getToolkitAvailabilityMonthDirectV5(selection.auditorEmail, selection.monthKey, { forceFresh:forceFresh });
    });
  }

  if (selection.auditorEmail) {
    AMS01_probe_(out, 'Auditor Portal — active grid', 'AuditorV5B_GetAuditorGrid_U20409', function() {
      if (typeof AuditorV5B_GetAuditorGrid_U20409 !== 'function') return AMS01_missing_('AuditorV5B_GetAuditorGrid_U20409');
      return AuditorV5B_GetAuditorGrid_U20409({
        view:'active',
        auditorEmail:selection.auditorEmail,
        noCache:forceFresh
      });
    });
  }

  AMS01_probe_(out, 'Manager Portal — open grid', 'getManagerV5Open', function() {
    if (typeof getManagerV5Open !== 'function') return AMS01_missing_('getManagerV5Open');
    return getManagerV5Open();
  });

  AMS01_probe_(out, 'Manager Portal — dashboard summary', 'getManagerV5DashboardData', function() {
    if (typeof getManagerV5DashboardData !== 'function') return AMS01_missing_('getManagerV5DashboardData');
    return getManagerV5DashboardData();
  });

  if (selection.auditId) {
    AMS01_probe_(out, 'Status action support — ACCEPT briefing load', 'StatusNotificationBridge_LoadEcasAuditBriefing_', function() {
      if (typeof StatusNotificationBridge_LoadEcasAuditBriefing_ !== 'function') return AMS01_missing_('StatusNotificationBridge_LoadEcasAuditBriefing_');
      return { success:true, briefing:StatusNotificationBridge_LoadEcasAuditBriefing_(selection.auditId) };
    });
  }

  AMS01_probe_(out, 'Notification Queue — duplicate scan', 'NB_recentQueueDuplicate_', function() {
    if (typeof NB_recentQueueDuplicate_ !== 'function') return AMS01_missing_('NB_recentQueueDuplicate_');
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
    var sh = ss && ss.getSheetByName('Notification Queue');
    if (!sh) return { success:false, message:'Missing Notification Queue' };
    return { success:true, result:NB_recentQueueDuplicate_(sh, 'AMS01_NON_MATCH_' + Utilities.getUuid(), 'AMS01', '', '') };
  });

  if (selection.auditId) {
    AMS01_probe_(out, 'Planning Toolkit — fast open component', 'getToolkitOpenFastV5', function() {
      if (typeof getToolkitOpenFastV5 !== 'function') return AMS01_missing_('getToolkitOpenFastV5');
      return getToolkitOpenFastV5(selection.auditId, selection.monthKey, {
        role:'MANAGER',
        withCalendar:false,
        forceFresh:forceFresh
      });
    });

    AMS01_probe_(out, 'Planning Toolkit — eligibility component', 'getToolkitAuditorsV5', function() {
      if (typeof getToolkitAuditorsV5 !== 'function') return AMS01_missing_('getToolkitAuditorsV5');
      return getToolkitAuditorsV5(selection.auditId);
    });
  }

  out.summary = AMS01_summarize_(out.probes);
  out.totalRunnerMs = Date.now() - started;
  try { Logger.log('[AMS01_BASELINE] ' + JSON.stringify(out)); } catch (eLog) {}
  return out;
}

function AMS01_fixture_(opts) {
  return {
    auditId: String(opts.auditId || 'AUD_CultiusItxartSCP_HQ_1777531729225_18').trim(),
    auditorEmail: String(opts.auditorEmail || 'david@agriqa.es').trim().toLowerCase(),
    monthKey: /^\d{4}-\d{2}$/.test(String(opts.monthKey || '2026-09')) ? String(opts.monthKey || '2026-09') : '2026-09'
  };
}

function AMS01_probe_(out, label, fnName, fn) {
  var t0 = Date.now();
  var probe = {
    label:label,
    functionName:fnName,
    ok:false,
    wallMs:0,
    serverReportedMs:null,
    cacheHit:null,
    rowsReturned:null,
    payloadBytesEstimate:null,
    perf:null,
    error:''
  };
  try {
    var res = fn();
    probe.wallMs = Date.now() - t0;
    if (res && res.__missing) {
      probe.error = res.message || 'MISSING_FUNCTION';
    } else {
      probe.ok = !(res && res.success === false);
      probe.serverReportedMs = AMS01_pickNumber_(res, ['__bundleServerMs','__serverMs','serverMs','totalMs']);
      probe.cacheHit = AMS01_pickBool_(res, ['__cacheHit','cacheHit']);
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
  if (res.auditorsBundle && Array.isArray(res.auditorsBundle.auditors)) return res.auditorsBundle.auditors.length;
  if (res.perf && isFinite(Number(res.perf.rowsReturned))) return Number(res.perf.rowsReturned);
  return null;
}

function AMS01_payloadBytes_(res) {
  try {
    if (res && res.__d48OpenRouteInstrumentation && isFinite(Number(res.__d48OpenRouteInstrumentation.responseBytesEstimate))) {
      return Number(res.__d48OpenRouteInstrumentation.responseBytesEstimate);
    }
    return Utilities.newBlob(JSON.stringify(res || {})).getBytes().length;
  } catch (e) { return null; }
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
  var ok = (probes || []).filter(function(p){ return p.ok; });
  var sorted = ok.slice().sort(function(a,b){ return Number(b.wallMs || 0) - Number(a.wallMs || 0); });
  return {
    successfulProbes:ok.length,
    failedProbes:(probes || []).length - ok.length,
    slowest:sorted.slice(0,5).map(function(p){
      return {
        label:p.label,
        wallMs:p.wallMs,
        serverReportedMs:p.serverReportedMs,
        cacheHit:p.cacheHit,
        rowsReturned:p.rowsReturned,
        payloadBytesEstimate:p.payloadBytesEstimate
      };
    })
  };
}

function AMS01_store_(result) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.getActive();
    if (!ss) return { success:false, message:'No active spreadsheet' };
    var sh = ss.getSheetByName(AMS01_BASELINE_SHEET);
    if (!sh) sh = ss.insertSheet(AMS01_BASELINE_SHEET);
    if (sh.getLastRow() < 1) {
      sh.getRange(1,1,1,8).setValues([['Timestamp','Build','Runtime','Audit_ID','Auditor','Month','Total_Runner_Ms','Result_JSON']]);
    }
    var row = [
      new Date(),
      String(result.build || ''),
      String(result.runtimeEnv || ''),
      String((result.selection && result.selection.auditId) || ''),
      String((result.selection && result.selection.auditorEmail) || ''),
      String((result.selection && result.selection.monthKey) || ''),
      Number(result.totalRunnerMs || 0),
      JSON.stringify(result || {})
    ];
    sh.getRange(sh.getLastRow()+1,1,1,row.length).setValues([row]);
    return { success:true, sheet:AMS01_BASELINE_SHEET, row:sh.getLastRow() };
  } catch (e) {
    return { success:false, message:String(e && e.message ? e.message : e) };
  }
}

function AMS01_missing_(name) {
  return { __missing:true, success:false, message:'Missing function: ' + name };
}

function AMS01_env_() {
  try {
    if (typeof EnvironmentGuard_getRuntimeEnv === 'function') return String(EnvironmentGuard_getRuntimeEnv() || '').toUpperCase();
    if (typeof SYS_getActiveEnv === 'function') return String(SYS_getActiveEnv() || '').toUpperCase();
  } catch (e) {}
  return 'UNKNOWN';
}
