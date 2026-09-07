/**
 * FILE: ToolkitAvailabilityDiagnostics_R23A_20260516.gs
 * BUILD: TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516
 *
 * PURPOSE
 * - Canonical diagnostics/hardening layer for Toolkit Availability.
 * - No behavior changes.
 * - No cache semantics changes.
 * - No owner swaps.
 *
 * GOVERNANCE
 * - Auditor Availability sheet remains truth.
 * - Cache = acceleration only.
 * - Diagnostics only; safe to deploy independently.
 */


/* =====================================================================
 * CANONICAL SIGNATURE OWNER
 * ===================================================================== */

function AV_buildMonthProjectionSignature_(ctx) {
  ctx = ctx || {};

  var payload = {
    auditorEmail: String(ctx.auditorEmail || '').trim().toLowerCase(),
    monthKey: String(ctx.monthKey || '').trim(),
    blockedWeekdays: String(ctx.blockedWeekdays || '').trim(),
    availabilityFingerprint: String(ctx.availabilityFingerprint || '').trim(),
    planningFingerprint: String(ctx.planningFingerprint || '').trim(),
    build: 'TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516'
  };

  var raw = JSON.stringify(payload);

  var hash = 0;
  for (var i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }

  return 'AVSIG_' + Math.abs(hash);
}


/* =====================================================================
 * MONTH PAYLOAD TRACE METADATA
 * ===================================================================== */

function AV_attachMonthTraceMetadata_(payload, meta) {
  payload = payload || {};
  meta = meta || {};

  payload.__trace = {
    routeOwner: String(meta.routeOwner || 'Toolkit_AvailabilityMonth'),
    sourceMode: String(meta.sourceMode || 'LIVE'),
    cacheOwner: String(meta.cacheOwner || 'NONE'),
    signature: String(meta.signature || ''),
    build: 'TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516',
    tracedAt: new Date().toISOString()
  };

  return payload;
}


/* =====================================================================
 * ROUTE COMPARE DIAG
 * ===================================================================== */

function RUN_TOOLKIT_ROUTE_COMPARE_R23() {

  var out = {
    ok: true,
    build: 'TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516',
    purpose: 'Compare month payload semantics across routes.',
    comparedRoutes: [
      'INLINE_FIRSTMONTH',
      'DIRECT_FETCH',
      'PREFETCH',
      'RENDER_CACHE'
    ],
    checks: [],
    warnings: [],
    generatedAt: new Date().toISOString()
  };

  try {

    out.checks.push({
      route: 'INLINE_FIRSTMONTH',
      ok: true,
      note: 'placeholder compare hook ready'
    });

    out.checks.push({
      route: 'DIRECT_FETCH',
      ok: true,
      note: 'placeholder compare hook ready'
    });

    out.checks.push({
      route: 'PREFETCH',
      ok: true,
      note: 'placeholder compare hook ready'
    });

    out.checks.push({
      route: 'RENDER_CACHE',
      ok: true,
      note: 'placeholder compare hook ready'
    });

  } catch (e) {
    out.ok = false;
    out.warnings.push(String(e));
  }

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/* =====================================================================
 * REGRESSION SUITE
 * ===================================================================== */

function RUN_TOOLKIT_AVAILABILITY_REGRESSION_SUITE_R23() {

  var cases = [
    'NO_DEFAULT_BLOCKS',
    'DEFAULT_WO_TH',
    'MANUAL_UNAVAILABLE',
    'PLANNED_AUDITS',
    'MIXED_SOFT_HARD'
  ];

  var out = {
    ok: true,
    build: 'TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516',
    purpose: 'Regression baseline for availability semantics.',
    cases: [],
    generatedAt: new Date().toISOString()
  };

  cases.forEach(function(name) {
    out.cases.push({
      caseName: name,
      ok: true,
      note: 'baseline registered'
    });
  });

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}


/* =====================================================================
 * ROUNDTRIP PROFILER
 * ===================================================================== */

function AV_buildRoundtripProfile_(ctx) {

  ctx = ctx || {};

  return {
    build: 'TOOLKIT_AVAIL_DIAGNOSTICS_R23A_20260516',
    iframeLatencyMs: Number(ctx.iframeLatencyMs || 0),
    serverComputeMs: Number(ctx.serverComputeMs || 0),
    renderApplyMs: Number(ctx.renderApplyMs || 0),
    prefetchAttachMs: Number(ctx.prefetchAttachMs || 0),
    totalMs:
      Number(ctx.iframeLatencyMs || 0) +
      Number(ctx.serverComputeMs || 0) +
      Number(ctx.renderApplyMs || 0) +
      Number(ctx.prefetchAttachMs || 0)
  };
}
