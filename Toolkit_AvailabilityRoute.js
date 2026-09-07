/**
 * FILE: Toolkit_AvailabilityRoute.js
 * BUILD: AMS01_TOOLKIT_AVAILABILITY_ROUTE_20260907_R1
 *
 * AMS-01 promoted visible-month route.
 * Reuses canonical AvailabilityService lite month reader and the existing
 * Planning JSON overlay. No second availability model; no business writes.
 *
 * The previous direct-month implementation remains in Toolkit_AvailabilityMonth.js
 * during DEV verification. This route owns the public endpoint in the current
 * DEV runtime; AMS01_GetAvailabilityRouteStatus verifies that ownership.
 */

var AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD = 'AMS01_TOOLKIT_AVAILABILITY_ROUTE_20260907_R1';

function getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, opts) {
  var t0 = Date.now();
  opts = opts || {};
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKey = _mp_tdm_clean_(monthKey);

  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { success:false, message:'Invalid monthKey: ' + monthKey };
  if (typeof v5_getAuditorAvailabilityLite !== 'function') {
    return { success:false, message:'Missing canonical v5_getAuditorAvailabilityLite' };
  }

  var startISO = monthKey + '-01';
  var startD = _mp_parseISODate_(startISO);
  var endISO = _mp_formatISODate_(new Date(startD.getFullYear(), startD.getMonth() + 1, 0));

  var tBase = Date.now();
  var base = v5_getAuditorAvailabilityLite(auditorEmail, startISO, endISO, {
    forceFresh: opts.forceFresh === true,
    bypassCache: opts.bypassCache === true
  });
  var baseMs = Date.now() - tBase;

  if (!base || base.success === false) {
    return base || { success:false, message:'Canonical availability returned no result' };
  }

  base.auditorEmail = auditorEmail;
  base.auditorKey = auditorEmail;
  base.monthKey = monthKey;
  base.rangeStart = startISO;
  base.rangeEnd = endISO;

  var tOverlay = Date.now();
  var out = _mp_tdm_addPlanningJsonOverlay_(base, auditorEmail, monthKey, {
    failOnOverlayError: opts.failOnOverlayError === true
  });
  var overlayMs = Date.now() - tOverlay;

  out.meta = out.meta || {};
  out.meta.build = AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD;
  out.meta.routeOwner = 'AvailabilityService.getAuditorAvailabilityLite';
  out.meta.sourceMode = 'CANONICAL_AVAILABILITY_SERVICE_LITE';
  out.meta.ams01Promoted = true;
  out.meta.baseMs = baseMs;
  out.meta.overlayMs = overlayMs;
  out.meta.serverMs = Date.now() - t0;
  return out;
}

function AMS01_GetAvailabilityRouteStatus() {
  return {
    success:true,
    active:true,
    build:AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD,
    owner:'AvailabilityService.getAuditorAvailabilityLite'
  };
}
