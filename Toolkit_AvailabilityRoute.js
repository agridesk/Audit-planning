/**
 * FILE: Toolkit_AvailabilityRoute.js
 * BUILD: AMS01_TOOLKIT_AVAILABILITY_ROUTE_20260908_R3_BATCH_3_MONTHS
 *
 * AMS-01 promoted availability routes.
 * Reuses canonical AvailabilityService lite reader and existing Planning JSON
 * overlay. No second availability model; no business writes.
 */

var AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD = 'AMS01_TOOLKIT_AVAILABILITY_ROUTE_20260908_R3_BATCH_3_MONTHS';

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

/**
 * Batched calendar-navigation route.
 * Executes up to three canonical month reads inside ONE google.script.run
 * execution so AvailabilityService execution-local header/row indexes are reused
 * and browser transport overhead is paid once.
 *
 * Manager hot path: visible month + next two months.
 */
function getToolkitAvailabilityMonthsDirectV5(auditorEmail, monthKeys, opts) {
  var t0 = Date.now();
  opts = opts || {};
  auditorEmail = _mp_tdm_normEmail_(auditorEmail);
  monthKeys = Array.isArray(monthKeys) ? monthKeys.slice(0, 3) : [];

  if (!auditorEmail) return { success:false, message:'Missing auditorEmail' };
  if (!monthKeys.length) return { success:false, message:'Missing monthKeys' };

  var seen = {};
  var normalized = [];
  for (var i = 0; i < monthKeys.length; i++) {
    var mk = _mp_tdm_clean_(monthKeys[i]);
    if (!/^\d{4}-\d{2}$/.test(mk) || seen[mk]) continue;
    seen[mk] = true;
    normalized.push(mk);
  }
  if (!normalized.length) return { success:false, message:'No valid monthKeys' };

  var results = {};
  var timings = {};
  for (var j = 0; j < normalized.length; j++) {
    var monthKey = normalized[j];
    var m0 = Date.now();
    var res = getToolkitAvailabilityMonthDirectV5(auditorEmail, monthKey, opts);
    timings[monthKey] = Date.now() - m0;
    results[monthKey] = res;
    if (!res || res.success === false) {
      return {
        success:false,
        message:(res && res.message) ? res.message : ('Month load failed: ' + monthKey),
        failedMonth:monthKey,
        results:results,
        meta:{
          build:AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD,
          routeOwner:'AvailabilityService.getAuditorAvailabilityLite',
          monthTimings:timings,
          serverMs:Date.now() - t0
        }
      };
    }
  }

  return {
    success:true,
    auditorEmail:auditorEmail,
    monthKeys:normalized,
    results:results,
    meta:{
      build:AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD,
      routeOwner:'AvailabilityService.getAuditorAvailabilityLite',
      batchMode:'VISIBLE_PLUS_NEXT2_SINGLE_RPC',
      monthTimings:timings,
      serverMs:Date.now() - t0
    }
  };
}

function AMS01_GetAvailabilityRouteStatus() {
  return {
    success:true,
    active:true,
    build:AMS01_TOOLKIT_AVAILABILITY_ROUTE_BUILD,
    owner:'AvailabilityService.getAuditorAvailabilityLite',
    batchMonths:true,
    batchMonthCount:3
  };
}
