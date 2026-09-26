/**
 * FILE: AMS01_ManagerToolkitOpenRouteDiagnostic.js
 * BUILD: 2026-09-26_AMS01_MANAGER_TOOLKIT_OPEN_ROUTE_DIAGNOSTIC_R1
 * PURPOSE:
 *   Read-only evidence for the slow Manager Overview -> Plan -> Planning Toolkit open path.
 *   Compares the currently used Manager fast-open endpoint with the Lite and Bundle routes.
 *   No business-data writes are performed.
 */

function RUN_AMS01_MANAGER_TOOLKIT_OPEN_ROUTE_DIAGNOSTIC() {
  var BUILD = '2026-09-26_AMS01_MANAGER_TOOLKIT_OPEN_ROUTE_DIAGNOSTIC_R1';
  var auditId = 'AUD_TEST_CompletedEta_1779300963234_101';
  var out = {
    ok: true,
    build: BUILD,
    auditId: auditId,
    writesPerformed: false,
    routes: {},
    sourceChecks: {},
    conclusion: ''
  };

  function size_(v) {
    try { return JSON.stringify(v || {}).length; } catch (e) { return null; }
  }

  function run_(name, fn) {
    var t0 = Date.now();
    try {
      var res = fn();
      var wallMs = Date.now() - t0;
      out.routes[name] = {
        ok: !!(res && res.success !== false),
        wallMs: wallMs,
        reportedServerMs: res && typeof res.__serverMs !== 'undefined' ? Number(res.__serverMs || 0) : null,
        bundleServerMs: res && typeof res.__bundleServerMs !== 'undefined' ? Number(res.__bundleServerMs || 0) : null,
        cacheHit: !!(res && res.__cacheHit),
        bytes: size_(res),
        auditors: res && Array.isArray(res.auditors) ? res.auditors.length : (res && res.auditorsBundle && Array.isArray(res.auditorsBundle.auditors) ? res.auditorsBundle.auditors.length : null),
        company: String((res && (res.company || (res.audit && res.audit.company))) || ''),
        status: String((res && (res.status || (res.audit && res.audit.status))) || '')
      };
      return res;
    } catch (e) {
      out.ok = false;
      out.routes[name] = {
        ok: false,
        wallMs: Date.now() - t0,
        error: String(e && e.message ? e.message : e)
      };
      return null;
    }
  }

  try {
    var uiSource = HtmlService.createHtmlOutputFromFile('ManagerPlanningUI_boot').getContent();
    out.sourceChecks.managerCurrentlyCallsFastDirect = uiSource.indexOf("if (!isAuditorToolkit_())") >= 0 && uiSource.indexOf('__d13_callFastDirect_();') >= 0;
    out.sourceChecks.fastDirectCallsGetToolkitOpenFastV5 = uiSource.indexOf('.getToolkitOpenFastV5(auditId') >= 0;
  } catch (eUi) {
    out.ok = false;
    out.sourceChecks.uiSourceError = String(eUi && eUi.message ? eUi.message : eUi);
  }

  try {
    var bundleSource = String(getToolkitOpenBundleV5_d13);
    out.sourceChecks.bundleManagerUsesLite = bundleSource.indexOf("typeof getToolkitOpenLiteV5 === 'function'") >= 0 && bundleSource.indexOf('getToolkitOpenLiteV5(auditId)') >= 0;
  } catch (eBundleSource) {
    out.ok = false;
    out.sourceChecks.bundleSourceError = String(eBundleSource && eBundleSource.message ? eBundleSource.message : eBundleSource);
  }

  if (typeof getToolkitOpenLiteV5 !== 'function') {
    out.ok = false;
    out.routes.lite = { ok:false, error:'getToolkitOpenLiteV5 unavailable' };
  } else {
    run_('lite', function() { return getToolkitOpenLiteV5(auditId); });
  }

  if (typeof getToolkitOpenFastV5 !== 'function') {
    out.ok = false;
    out.routes.fast = { ok:false, error:'getToolkitOpenFastV5 unavailable' };
  } else {
    run_('fast', function() { return getToolkitOpenFastV5(auditId, '', { withCalendar:false, role:'MANAGER', lockedAuditorEmail:'' }); });
  }

  if (typeof getToolkitOpenBundleV5_d13 !== 'function') {
    out.ok = false;
    out.routes.bundle = { ok:false, error:'getToolkitOpenBundleV5_d13 unavailable' };
  } else {
    run_('bundle', function() { return getToolkitOpenBundleV5_d13(auditId, '', { withCalendar:false, role:'MANAGER', lockedAuditorEmail:'' }); });
  }

  var liteMs = out.routes.lite && out.routes.lite.wallMs;
  var fastMs = out.routes.fast && out.routes.fast.wallMs;
  var bundleMs = out.routes.bundle && out.routes.bundle.wallMs;
  if (typeof liteMs === 'number' && typeof fastMs === 'number' && liteMs < fastMs) {
    out.conclusion = 'LITE_FASTER_THAN_CURRENT_FAST';
  } else if (typeof bundleMs === 'number' && typeof fastMs === 'number' && bundleMs < fastMs) {
    out.conclusion = 'BUNDLE_FASTER_THAN_CURRENT_FAST';
  } else {
    out.conclusion = 'NO_CLEAR_ROUTE_WIN_FROM_SINGLE_RUN';
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
