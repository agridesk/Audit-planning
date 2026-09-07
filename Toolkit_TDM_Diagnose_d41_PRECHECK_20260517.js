/**
 * Toolkit TDM Diagnose d41 PRECHECK
 * Purpose:
 * - Measure whether TDM for leen@agriqa.es / 2026-08 and 2026-09 is true warm HIT.
 * - No mutation intended. Read/measure/log only.
 * - Required before d41 bundling decision.
 *
 * Paste as a full file in Apps Script, save, run:
 * RUN_D41_TDM_PRECHECK_LEEN_BARBERET()
 */

var D41_TDM_PRECHECK_BUILD = '2026-05-17_D41_TDM_PRECHECK_LEEN_BARBERET_R1';

function RUN_D41_TDM_PRECHECK_LEEN_BARBERET() {
  var auditId = 'AUD_BarberetBlanc_HQ_1777555351956_117';
  var auditorEmail = 'leen@agriqa.es';
  var months = ['2026-08', '2026-09'];

  var started = Date.now();
  var out = {
    ok: true,
    build: D41_TDM_PRECHECK_BUILD,
    purpose: 'd41 pre-build TDM cache/path diagnosis; no writes intended',
    input: {
      auditId: auditId,
      auditorEmail: auditorEmail,
      months: months
    },
    checks: [],
    interpretation: null,
    errors: []
  };

  if (typeof getToolkitAvailabilityMonthDirectV5 !== 'function') {
    out.ok = false;
    out.errors.push('Missing required function: getToolkitAvailabilityMonthDirectV5');
    Logger.log(JSON.stringify(out, null, 2));
    throw new Error('D41 precheck failed: getToolkitAvailabilityMonthDirectV5 is not available.');
  }

  months.forEach(function(monthKey) {
    var check = {
      monthKey: monthKey,
      ok: false,
      elapsedMs: null,
      payloadShape: null,
      tdmPathHints: [],
      error: null
    };

    var t0 = Date.now();
    try {
      var payload = getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, { auditId: auditId });
      check.elapsedMs = Date.now() - t0;
      check.ok = true;
      check.payloadShape = D41_TDM_PRECHECK_describePayload_(payload);
      check.tdmPathHints = D41_TDM_PRECHECK_findPathHints_(payload);
    } catch (err) {
      check.elapsedMs = Date.now() - t0;
      check.error = String(err && err.stack ? err.stack : err);
      out.ok = false;
      out.errors.push('Month ' + monthKey + ' failed: ' + check.error);
    }

    out.checks.push(check);
  });

  out.totalElapsedMs = Date.now() - started;
  out.interpretation = D41_TDM_PRECHECK_interpret_(out.checks);

  Logger.log('[D41_TDM_PRECHECK] ' + JSON.stringify(out, null, 2));
  return out;
}

function D41_TDM_PRECHECK_describePayload_(payload) {
  var shape = {
    type: Object.prototype.toString.call(payload),
    keys: [],
    stringLength: null,
    hasDays: false,
    dayCount: null,
    cacheHit: null,
    tier: null,
    source: null,
    serverMs: null,
    timingKeys: []
  };

  try {
    if (payload && typeof payload === 'object') {
      shape.keys = Object.keys(payload).slice(0, 80);
      shape.hasDays = !!(payload.days || payload.calendarDays || payload.availability || payload.cells);
      var days = payload.days || payload.calendarDays || payload.availability || payload.cells;
      if (Array.isArray(days)) shape.dayCount = days.length;
      else if (days && typeof days === 'object') shape.dayCount = Object.keys(days).length;

      shape.cacheHit = D41_TDM_PRECHECK_firstDefined_(payload.cacheHit, payload.cached, payload.isCacheHit);
      shape.tier = D41_TDM_PRECHECK_firstDefined_(payload.tier, payload.cacheTier, payload.cacheLevel, payload.sourceTier);
      shape.source = D41_TDM_PRECHECK_firstDefined_(payload.source, payload.cacheSource, payload.path, payload.mode);
      shape.serverMs = D41_TDM_PRECHECK_firstDefined_(payload.serverMs, payload.elapsedMs, payload.ms, payload.durationMs);

      ['timing', 'timings', 'stages', 'debug', 'meta', 'cache', 'tdm'].forEach(function(k) {
        if (payload[k] && typeof payload[k] === 'object') {
          shape.timingKeys.push(k + ':' + Object.keys(payload[k]).slice(0, 40).join(','));
        }
      });
    }

    shape.stringLength = JSON.stringify(payload || {}).length;
  } catch (err) {
    shape.describeError = String(err);
  }

  return shape;
}

function D41_TDM_PRECHECK_findPathHints_(payload) {
  var hints = [];
  var seen = {};

  function addHint(path, value) {
    var s = String(value);
    if (!s) return;
    if (!/(TDM|HIT|MISS|CACHE|SHEET|TIER|BUILD|DIRECT|WARM|COLD|PATH)/i.test(s)) return;
    var key = path + '=' + s;
    if (seen[key]) return;
    seen[key] = true;
    hints.push({ path: path, value: s.substring(0, 500) });
  }

  function walk(value, path, depth) {
    if (hints.length >= 80 || depth > 4) return;
    if (value == null) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      addHint(path, value);
      return;
    }

    if (typeof value !== 'object') return;

    Object.keys(value).slice(0, 80).forEach(function(k) {
      if (/(cache|tier|source|path|hit|miss|build|tdm|stage|timing|mode|debug|meta)/i.test(k)) {
        addHint(path ? path + '.' + k : k, value[k]);
      }
      walk(value[k], path ? path + '.' + k : k, depth + 1);
    });
  }

  try {
    walk(payload, 'payload', 0);
  } catch (err) {
    hints.push({ path: 'hintError', value: String(err) });
  }

  return hints;
}

function D41_TDM_PRECHECK_interpret_(checks) {
  var okChecks = checks.filter(function(c) { return c.ok; });
  var slow = okChecks.filter(function(c) { return c.elapsedMs > 500; });
  var veryFast = okChecks.filter(function(c) { return c.elapsedMs <= 150; });

  var result = {
    decision: 'UNDECIDED',
    summary: '',
    proceedD41Bundling: false,
    action: ''
  };

  if (okChecks.length !== checks.length) {
    result.decision = 'BLOCKED';
    result.summary = 'One or more direct TDM calls failed.';
    result.action = 'Fix missing/failing direct TDM path before d41.';
    return result;
  }

  if (veryFast.length === checks.length) {
    result.decision = 'TDM_TRUE_WARM_HIT_LIKELY';
    result.summary = 'Both direct calls are <=150ms. TDM backend is likely warm; d41 bundling can target RPC reduction.';
    result.proceedD41Bundling = true;
    result.action = 'Proceed with d41 option 1: firstMonth in getToolkitOpenFastV5 for manager default auditor only.';
    return result;
  }

  if (slow.length > 0) {
    result.decision = 'TDM_NOT_WARM_OR_PATH_MISMATCH_LIKELY';
    result.summary = 'At least one direct TDM call is >500ms. This suggests warmer coverage/key mismatch/sheet read/MISS; do not bundle yet.';
    result.action = 'Inspect [TDM_PATH] logs and fix warmer coverage/key alignment first.';
    return result;
  }

  result.decision = 'MIXED_OR_MEDIUM';
  result.summary = 'Direct TDM calls are neither 48-ish fast nor clearly slow. Use [TDM_PATH] logs to decide.';
  result.action = 'Do not lock d41 until the actual [TDM_PATH] line confirms HIT/MISS/tier.';
  return result;
}

function D41_TDM_PRECHECK_firstDefined_() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
  }
  return null;
}
