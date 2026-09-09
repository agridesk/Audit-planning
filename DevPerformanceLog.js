/***********************************************************************
 * DevPerformanceLog.js
 * BUILD: 2026-09-09_ROADMAP_2_4_DEV_PERF_LOG_R1
 *
 * PURPOSE
 *   Extremely lightweight DEV-only timing instrumentation for Roadmap 2.4
 *   hot paths. No sheet writes. No persistent log store. One Logger.log at
 *   completion only.
 *
 * GOVERNANCE
 *   - Speed is a primary architecture requirement.
 *   - PROD logging is disabled by default.
 *   - Instrumentation must never become a hot-path bottleneck.
 *   - Measure whole server operation plus meaningful internal stages.
 ***********************************************************************/

var DEV_PERF_LOG_BUILD = '2026-09-09_ROADMAP_2_4_DEV_PERF_LOG_R1';

function DPL_isDev_() {
  try {
    if (typeof SYS_getEnv_ === 'function') return SYS_getEnv_() === 'DEV';
  } catch (e) {}
  return false;
}

function DPL_start_(operation, meta) {
  if (!DPL_isDev_()) return null;
  return {
    operation: String(operation || '').trim(),
    t0: Date.now(),
    last: Date.now(),
    stages: [],
    meta: meta || {}
  };
}

function DPL_mark_(ctx, stage, extra) {
  if (!ctx) return;
  var now = Date.now();
  ctx.stages.push({
    stage: String(stage || '').trim(),
    deltaMs: now - ctx.last,
    cumulativeMs: now - ctx.t0,
    extra: extra || null
  });
  ctx.last = now;
}

function DPL_end_(ctx, extra) {
  if (!ctx) return null;
  var totalMs = Date.now() - ctx.t0;
  var payload = {
    type: 'DEV_PERF',
    build: DEV_PERF_LOG_BUILD,
    operation: ctx.operation,
    totalMs: totalMs,
    stages: ctx.stages,
    meta: ctx.meta || {},
    extra: extra || null
  };
  try { Logger.log(JSON.stringify(payload)); } catch (e) {}
  return payload;
}
