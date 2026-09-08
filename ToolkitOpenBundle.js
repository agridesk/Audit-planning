/**
 * ToolkitOpenBundle_d17_AMS01_REUSE_LITE_AUDITORS_20260908.js
 *
 * Single-roundtrip bundle for Manager Planning Toolkit open.
 *
 * AMS-01 promotions:
 * - Manager first paint uses getToolkitOpenLiteV5 after the deep-dive proved
 *   all critical planning/context fields equal to getToolkitOpenFastV5.
 * - Locked AUDITOR route keeps getToolkitOpenFastV5 because that route may
 *   include its inline first-month calendar contract.
 * - Manager Lite open already returns HARD-qualified auditors. Reuse that
 *   exact list instead of performing the same qualification a second time.
 * - Rotation remains explicitly pending and hydrated later.
 */

function getToolkitOpenBundleV5_d13(auditId, monthKey, opts) {
  var __tBundle0 = Date.now();
  var stages = [];
  function __stage_(name, ms) { stages.push({ name:name, ms:ms }); }

  opts = opts || {};
  var __role = String(opts.role || '').trim().toUpperCase();
  var __lockedAuditorEmail = String(opts.lockedAuditorEmail || '').trim();
  var __isLockedAuditorRoute = (__role === 'AUDITOR' && !!__lockedAuditorEmail);

  auditId = String(auditId || '').trim();
  if (!auditId) return { success:false, message:'Missing auditId', __bundleStage:'d17' };

  var __tOpen0 = Date.now();
  var openRes;
  try {
    if (__isLockedAuditorRoute) {
      openRes = getToolkitOpenFastV5(auditId, monthKey, opts);
    } else if (typeof getToolkitOpenLiteV5 === 'function') {
      openRes = getToolkitOpenLiteV5(auditId);
      openRes = openRes || {};
      openRes.__ams01LiteContext = true;
    } else {
      openRes = getToolkitOpenFastV5(auditId, monthKey, opts);
    }
  } catch (eOpen) {
    return {
      success:false,
      message:'open failed: ' + (eOpen && eOpen.message ? eOpen.message : eOpen),
      __bundleStage:'d17'
    };
  }
  __stage_(__isLockedAuditorRoute ? 'bundle.open[FAST_LOCKED_AUDITOR]' : 'bundle.open[LITE_MANAGER]', Date.now() - __tOpen0);

  var __tAud0 = Date.now();
  var audRes = null;
  if (__isLockedAuditorRoute) {
    audRes = {
      success:true,
      skipped:true,
      reason:'LOCKED_AUDITOR_ROUTE_SKIP_FULL_AUDITOR_BUNDLE',
      auditors:(openRes && openRes.auditors && openRes.auditors.length) ? openRes.auditors : [],
      auditorEligibilityMeta:(openRes && openRes.auditorEligibilityMeta) ? openRes.auditorEligibilityMeta : { selectedOnly:true },
      __serverMs:0
    };
    __stage_('bundle.auditors[SKIPPED_LOCKED_AUDITOR]', Date.now() - __tAud0);
  } else if (openRes && Array.isArray(openRes.auditors)) {
    audRes = {
      success:true,
      auditors:openRes.auditors,
      auditorEligibilityMeta:openRes.auditorEligibilityMeta || { qualifiedFast:true, rotationPending:true },
      __serverMs:Date.now() - __tAud0,
      reusedFromLiteOpen:true
    };
    audRes.auditorEligibilityMeta.rotationPending = true;
    audRes.auditorEligibilityMeta.ams01PromotedFirstPaint = true;
    audRes.auditorEligibilityMeta.reusedFromLiteOpen = true;
    __stage_('bundle.auditors[REUSED_LITE_OPEN]', Date.now() - __tAud0);
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
      audRes = { success:false, message:'auditors failed: ' + (eAud && eAud.message ? eAud.message : eAud) };
    }
    __stage_('bundle.auditors[QUALIFICATION_ONLY_FALLBACK]', Date.now() - __tAud0);
  }

  if (openRes && typeof openRes === 'object') {
    openRes.auditorsBundle = audRes;
    openRes.__bundleStage = 'd17';
    openRes.__bundleServerMs = Date.now() - __tBundle0;
    try {
      if (!openRes.__diag) openRes.__diag = {};
      if (!Array.isArray(openRes.__diag.stages)) openRes.__diag.stages = [];
      for (var i=0; i<stages.length; i++) openRes.__diag.stages.push(stages[i]);
    } catch (_eD) {}
  } else {
    openRes = {
      success:false,
      message:'open returned non-object',
      auditorsBundle:audRes,
      __bundleStage:'d17',
      __bundleServerMs:Date.now() - __tBundle0
    };
  }

  try {
    Logger.log(
      '[d17][BUNDLE] auditId=' + auditId +
      ' open=' + (openRes && openRes.__serverMs) + 'ms' +
      ' aud=' + (audRes && audRes.__serverMs) + 'ms' +
      ' total=' + (Date.now() - __tBundle0) + 'ms' +
      ' liteManager=' + !!(openRes && openRes.__ams01LiteContext) +
      ' audSuccess=' + !!(audRes && audRes.success) +
      ' reusedLiteAuditors=' + !!(audRes && audRes.reusedFromLiteOpen) +
      ' qualOnly=' + !!(audRes && audRes.auditorEligibilityMeta && audRes.auditorEligibilityMeta.ams01PromotedFirstPaint)
    );
  } catch (_eL) {}

  return openRes;
}
