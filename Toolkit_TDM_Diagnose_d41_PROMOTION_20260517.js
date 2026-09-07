/**
 * Toolkit_TDM_Diagnose_d41_PROMOTION_20260517.gs
 *
 * Purpose:
 * - Diagnose whether a tier3 MP_CalCache_Store sheet hit promotes back into tier2 ScriptCache.
 * - No writes intended except normal existing cache promotion behavior inside getToolkitAvailabilityMonthDirectV5.
 * - No production data mutation.
 *
 * Run:
 *   RUN_D41_TDM_PROMOTION_LEEN_BARBERET()
 *
 * Expected interpretation:
 * - Call 1 tier3=true and slow, Call 2 tier2=true and fast:
 *     promotion works; remaining issue is TTL/timing/eviction.
 * - Call 1 tier3=true and Call 2 tier3=true again:
 *     ScriptCache put/promotion is not effective; inspect size/quota/key/put path.
 */

function RUN_D41_TDM_PROMOTION_LEEN_BARBERET() {
  var build = '2026-05-17_D41_TDM_PROMOTION_LEEN_BARBERET_R1';
  var auditId = 'AUD_BarberetBlanc_HQ_1777555351956_117';
  var auditorEmail = 'leen@agriqa.es';
  var monthKey = '2026-08';
  var started = Date.now();
  var errors = [];
  var calls = [];

  function shapePayload_(payload) {
    var meta = payload && payload.meta ? payload.meta : {};
    var text = '';
    try {
      text = JSON.stringify(payload || null);
    } catch (e) {
      text = '[UNSERIALIZABLE] ' + String(e && e.message ? e.message : e);
    }
    return {
      type: Object.prototype.toString.call(payload),
      keys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 30) : [],
      stringLength: text.length,
      hasDays: !!(payload && payload.days),
      dayCount: payload && payload.days && typeof payload.days === 'object' ? Object.keys(payload.days).length : null,
      meta: {
        serverMs: meta.serverMs || null,
        sourceMode: meta.sourceMode || null,
        cacheHit: meta.cacheHit || null,
        cacheService: meta.cacheService || null,
        cacheSchema: meta.cacheSchema || null,
        build: meta.build || null,
        freshnessMode: meta.freshnessMode || null,
        signatureChecked: meta.signatureChecked || null,
        cacheHitTimingPatched: meta.cacheHitTimingPatched || null,
        preOverlayCacheHit: meta.preOverlayCacheHit || null
      },
      sheetFlags: {
        __sheetCacheHit: payload && Object.prototype.hasOwnProperty.call(payload, '__sheetCacheHit') ? payload.__sheetCacheHit : null,
        __sheetComputedAt: payload && Object.prototype.hasOwnProperty.call(payload, '__sheetComputedAt') ? payload.__sheetComputedAt : null
      }
    };
  }

  function callOnce_(label) {
    var t0 = Date.now();
    var result = {
      label: label,
      ok: false,
      elapsedMs: null,
      payloadShape: null,
      error: null
    };

    try {
      if (typeof getToolkitAvailabilityMonthDirectV5 !== 'function') {
        throw new Error('Missing required function: getToolkitAvailabilityMonthDirectV5');
      }

      var payload = getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, {
        auditId: auditId,
        reason: 'D41_TDM_PROMOTION_' + label,
        diagnostic: true
      });

      result.ok = !!(payload && (payload.success === true || payload.days));
      result.payloadShape = shapePayload_(payload);
    } catch (e) {
      result.error = String(e && e.stack ? e.stack : (e && e.message ? e.message : e));
      errors.push(result.error);
    }

    result.elapsedMs = Date.now() - t0;
    Logger.log('[D41_TDM_PROMOTION_CALL] ' + JSON.stringify(result));
    return result;
  }

  calls.push(callOnce_('CALL_1'));
  Utilities.sleep(100);
  calls.push(callOnce_('CALL_2'));

  var interpretation = {
    decision: 'UNKNOWN',
    summary: 'Inspect [TDM_PATH] logs immediately above/between [D41_TDM_PROMOTION_CALL] entries.',
    expectedIfPromotionWorks: 'CALL_1 may be tier3/slow; CALL_2 should be tier2/fast within same execution after promotion.',
    expectedIfPromotionFails: 'CALL_2 remains tier3/slow despite CALL_1 promotion path.'
  };

  var c1 = calls[0] || {};
  var c2 = calls[1] || {};
  if (c1.ok && c2.ok) {
    if (c1.elapsedMs > 500 && c2.elapsedMs <= 200) {
      interpretation.decision = 'PROMOTION_LIKELY_WORKS_TTL_OR_TIMING_ISSUE';
      interpretation.summary = 'Second call is fast after first call. Focus d41 on TTL/timing/eviction, not cache promotion architecture.';
    } else if (c1.elapsedMs > 500 && c2.elapsedMs > 500) {
      interpretation.decision = 'PROMOTION_NOT_EFFECTIVE_OR_TIER2_NOT_USED';
      interpretation.summary = 'Second call is still slow. Inspect ScriptCache put size/quota/key/read path.';
    } else {
      interpretation.decision = 'BOTH_FAST_OR_INCONCLUSIVE';
      interpretation.summary = 'Both calls are already fast or timing is inconclusive. Use [TDM_PATH] tier logs as source of truth.';
    }
  }

  var report = {
    ok: errors.length === 0,
    build: build,
    purpose: 'd41 TDM tier3-to-tier2 promotion diagnosis; no functional build; no persistence mutation intended',
    input: {
      auditId: auditId,
      auditorEmail: auditorEmail,
      monthKey: monthKey
    },
    calls: calls,
    interpretation: interpretation,
    errors: errors,
    totalElapsedMs: Date.now() - started
  };

  Logger.log('[D41_TDM_PROMOTION] ' + JSON.stringify(report, null, 2));
  return report;
}
