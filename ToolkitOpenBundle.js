/**
 * ToolkitOpenBundle_d14_3S_LOCKED_AUDITOR_SKIP_BUNDLE_20260515.js
 *
 * B1/d14 — Single-roundtrip bundle for Manager Planning Toolkit open.
 *
 * Problem (measured 13:05 prod log):
 *   - getToolkitOpenFastV5         server=1059ms wall=5130ms
 *   - getToolkitAuditorsV5  (T16)  server=2352ms wall=5601ms
 *   - getToolkitAvailabilityMonth  server= 762ms wall=3359ms
 *   Each google.script.run call carries ~2.5-4s of GAS HTTP / iframe-proxy
 *   floor that is NOT reducible server-side. The 3 sequential calls add up
 *   to ~13s perceived load on a Plan-button click.
 *
 * B1 strategy:
 *   Eliminate ONE roundtrip by bundling the open response with the
 *   eligible-auditors response in a single server call. Both already exist
 *   and have their own caches (open: PATCH C / GATE C; auditors: PATCH E
 *   5min response cache + GATE B eligibility cache). We just glue them.
 *
 * d14 3S locked-auditor route:
 *   - Auditor login with lockedAuditorEmail does NOT need full auditor dropdown hydration.
 *   - The open payload already contains selectedAuditorOnly + inline firstMonth calendar.
 *   - Therefore bundle.auditors is skipped for role=AUDITOR + lockedAuditorEmail.
 *
 * Calendar bundle is intentionally OUT of scope:
 *   - Manager toolkit gates calendar fetch on the "Load calendar" click,
 *     so bundling it would burn server time the manager may never use.
 *   - Auditor toolkit already has inline firstMonth via withCalendar:true
 *     in getToolkitOpenFastV5 — already a 1-roundtrip path.
 *
 * Endpoint:
 *   getToolkitOpenBundleV5_d13(auditId, monthKey, opts)
 *
 * Returns:
 *   The full openRes shape from getToolkitOpenFastV5, plus:
 *     openRes.auditorsBundle   = result of getToolkitAuditorsV5(auditId)
 *                                shape: { success, auditors, auditorEligibilityMeta, __serverMs }
 *     openRes.__bundleStage    = 'd13'   (used by UI to confirm deploy)
 *     openRes.__bundleServerMs = total server ms for the bundle
 *
 * Frontend contract (ManagerPlanningV5UI_d13.html):
 *   On success, after onContextLoaded(openRes), if openRes.auditorsBundle
 *   && openRes.auditorsBundle.success === true, the UI calls
 *   onAuditorsHydrated(openRes.auditorsBundle) immediately and sets
 *   ctx.auditorsHydrated = true so the lazy T16 path short-circuits.
 *
 * Fallback:
 *   If this endpoint is missing on the server (e.g. not yet deployed),
 *   the UI falls back to .getToolkitOpenFastV5(...) → .getToolkitOpenLiteV5(...)
 *   → .getPlanningContextAndFirstMonthV5(...) so the Plan button never
 *   regresses.
 *
 * Cache behaviour:
 *   - Cold open:  open ~1.0s + auditors ~2.4s = ~3.4s server
 *   - Warm open:  open <100ms (PATCH C 30s memo) + auditors <100ms (PATCH E)
 *                 → ~150ms server
 *   - Mixed:      open warm + auditors cold = ~2.5s server
 *
 * Perceived wall (single roundtrip):
 *   ~ server ms + 3-4s GAS HTTP floor
 *   Cold: 6-7s    Warm: ~3.5s
 *
 * NOTE: This file is additive. It does NOT modify
 * ManagerPlanningBackend_CORE_SPLIT_d12.js — both wrapped functions are
 * called by name, so this stays compatible with future _d14+ bumps of the
 * core file as long as those two function names are preserved.
 */

function getToolkitOpenBundleV5_d13(auditId, monthKey, opts) {
  var __tBundle0 = Date.now();
  var stages = [];

  function __stage_(name, ms) { stages.push({ name: name, ms: ms }); }

  opts = opts || {};
  var __role = String(opts.role || '').trim().toUpperCase();
  var __lockedAuditorEmail = String(opts.lockedAuditorEmail || '').trim();
  var __isLockedAuditorRoute = (__role === 'AUDITOR' && !!__lockedAuditorEmail);

  // Defensive: trim auditId once.
  auditId = String(auditId || '').trim();
  if (!auditId) {
    return { success: false, message: 'Missing auditId', __bundleStage: 'd13' };
  }

  // 1) OPEN — full fast-open path (cache + warmer apply here).
  var __tOpen0 = Date.now();
  var openRes;
  try {
    openRes = getToolkitOpenFastV5(auditId, monthKey, opts);
  } catch (eOpen) {
    return {
      success: false,
      message: 'open failed: ' + (eOpen && eOpen.message ? eOpen.message : eOpen),
      __bundleStage: 'd13'
    };
  }
  __stage_('bundle.open', Date.now() - __tOpen0);

  // 2) AUDITORS — eligible auditors with rotation history.
  // 3S d14: locked auditor route must not hydrate the full auditor dropdown.
  // The open payload already contains selectedAuditorOnly and inline firstMonth
  // when role=AUDITOR + lockedAuditorEmail is present. Calling
  // getToolkitAuditorsV5 here adds ~5-6s with no functional gain.
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
      audRes = getToolkitAuditorsV5(auditId);
    } catch (eAud) {
      audRes = {
        success: false,
        message: 'auditors failed: ' + (eAud && eAud.message ? eAud.message : eAud)
      };
    }
    __stage_('bundle.auditors', Date.now() - __tAud0);
  }

  // 3) ATTACH — never overwrite open's own __diag.stages; append our own.
  if (openRes && typeof openRes === 'object') {
    openRes.auditorsBundle = audRes;
    openRes.__bundleStage = 'd13';
    openRes.__bundleServerMs = Date.now() - __tBundle0;
    try {
      if (!openRes.__diag) openRes.__diag = {};
      if (!Array.isArray(openRes.__diag.stages)) openRes.__diag.stages = [];
      // Append bundle stages so UI [PATCHC] stage logging shows them too.
      for (var i = 0; i < stages.length; i++) openRes.__diag.stages.push(stages[i]);
    } catch (_eD) {}
  } else {
    // openRes was not an object — synthesize a minimal envelope so the UI
    // success handler can still run its dispatch logic.
    openRes = {
      success: false,
      message: 'open returned non-object',
      auditorsBundle: audRes,
      __bundleStage: 'd13',
      __bundleServerMs: Date.now() - __tBundle0
    };
  }

  try {
    Logger.log(
      '[d13][BUNDLE] auditId=' + auditId +
      ' open=' + (openRes && openRes.__serverMs) + 'ms' +
      ' aud=' + (audRes && audRes.__serverMs) + 'ms' +
      ' total=' + (Date.now() - __tBundle0) + 'ms' +
      ' openCacheHit=' + !!(openRes && openRes.__cacheHit) +
      ' audSuccess=' + !!(audRes && audRes.success)
    );
  } catch (_eL) {}

  return openRes;
}
