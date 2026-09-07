/**
 * ToolkitOpenBundle_d15_AMS01_QUALIFICATION_ONLY_20260907.js
 *
 * Single-roundtrip bundle for Manager Planning Toolkit open.
 *
 * AMS-01 promotion 2026-09-07:
 * - Regression gate proved qualification-only membership is identical to the
 *   existing full eligibility route for the current DEV fixture.
 * - Manager first paint therefore uses AMS01_GetQualifiedAuditorsFastCandidate
 *   for the bundled auditor membership when available.
 * - Rotation remains explicitly pending and is hydrated by the existing
 *   non-open rotation path; no planning/status/availability truth changes.
 * - Locked AUDITOR route still skips full dropdown hydration.
 */

function getToolkitOpenBundleV5_d13(auditId, monthKey, opts) {
  var __tBundle0 = Date.now();
  var stages = [];

  function __stage_(name, ms) { stages.push({ name: name, ms: ms }); }

  opts = opts || {};
  var __role = String(opts.role || '').trim().toUpperCase();
  var __lockedAuditorEmail = String(opts.lockedAuditorEmail || '').trim();
  var __isLockedAuditorRoute = (__role === 'AUDITOR' && !!__lockedAuditorEmail);

  auditId = String(auditId || '').trim();
  if (!auditId) {
    return { success: false, message: 'Missing auditId', __bundleStage: 'd15' };
  }

  // 1) OPEN — existing canonical fast-open context owner.
  var __tOpen0 = Date.now();
  var openRes;
  try {
    openRes = getToolkitOpenFastV5(auditId, monthKey, opts);
  } catch (eOpen) {
    return {
      success: false,
      message: 'open failed: ' + (eOpen && eOpen.message ? eOpen.message : eOpen),
      __bundleStage: 'd15'
    };
  }
  __stage_('bundle.open', Date.now() - __tOpen0);

  // 2) AUDITORS — first-paint membership only.
  // Rotation is intentionally excluded from this first-paint bundle.
  var __tAud0 = Date.now();
  var audRes = null;
  if (__isLockedAuditorRoute) {
    audRes = {
      success: true,
      skipped: true,
      reason: 'LOCKED_AUDITOR_ROUTE_SKIP_FULL_AUDITOR_BUNDLE',
      auditors: (openRes && openRes.auditors && openRes.auditors.length) ? openRes.auditors : [],
      auditorEligibilityMeta: (openRes && openRes.auditorEligibilityMeta) ? openRes.auditorEligibilityMeta : { selectedOnly: true },
      __serverMs: 0
    };
    __stage_('bundle.auditors[SKIPPED_LOCKED_AUDITOR]', Date.now() - __tAud0);
  } else {
    try {
      if (typeof AMS01_GetQualifiedAuditorsFastCandidate === 'function') {
        audRes = AMS01_GetQualifiedAuditorsFastCandidate(auditId);
        audRes.__serverMs = audRes && audRes.perf ? Number(audRes.perf.serverMs || 0) : (Date.now() - __tAud0);
        audRes.auditorEligibilityMeta = audRes.auditorEligibilityMeta || {};
        audRes.auditorEligibilityMeta.rotationPending = true;
        audRes.auditorEligibilityMeta.ams01PromotedFirstPaint = true;
      } else {
        audRes = getToolkitAuditorsV5(auditId);
      }
    } catch (eAud) {
      audRes = {
        success: false,
        message: 'auditors failed: ' + (eAud && eAud.message ? eAud.message : eAud)
      };
    }
    __stage_('bundle.auditors[QUALIFICATION_ONLY]', Date.now() - __tAud0);
  }

  // 3) ATTACH
  if (openRes && typeof openRes === 'object') {
    openRes.auditorsBundle = audRes;
    openRes.__bundleStage = 'd15';
    openRes.__bundleServerMs = Date.now() - __tBundle0;
    try {
      if (!openRes.__diag) openRes.__diag = {};
      if (!Array.isArray(openRes.__diag.stages)) openRes.__diag.stages = [];
      for (var i = 0; i < stages.length; i++) openRes.__diag.stages.push(stages[i]);
    } catch (_eD) {}
  } else {
    openRes = {
      success: false,
      message: 'open returned non-object',
      auditorsBundle: audRes,
      __bundleStage: 'd15',
      __bundleServerMs: Date.now() - __tBundle0
    };
  }

  try {
    Logger.log(
      '[d15][BUNDLE] auditId=' + auditId +
      ' open=' + (openRes && openRes.__serverMs) + 'ms' +
      ' aud=' + (audRes && audRes.__serverMs) + 'ms' +
      ' total=' + (Date.now() - __tBundle0) + 'ms' +
      ' openCacheHit=' + !!(openRes && openRes.__cacheHit) +
      ' audSuccess=' + !!(audRes && audRes.success) +
      ' qualOnly=' + !!(audRes && audRes.auditorEligibilityMeta && audRes.auditorEligibilityMeta.ams01PromotedFirstPaint)
    );
  } catch (_eL) {}

  return openRes;
}
