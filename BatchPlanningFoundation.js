/**
 * FILE: BatchPlanningFoundation.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_FOUNDATION_R1
 *
 * PURPOSE
 * - Foundation only for future manager Batch Planning.
 * - Creates a read-only planning candidate model around existing canonical owners.
 * - Geographic input is practical: auditor departure point + audit/company location.
 * - Route distance/time is an adapter contract; no flight/hotel optimisation here.
 *
 * GOVERNANCE
 * - UI/advisory layer only; canonical planning backend remains final authority.
 * - Companies.Locations_JSON remains company-location SSoT.
 * - Auditors remains auditor identity/qualification source.
 * - Availability remains Availability owner; no duplicate availability truth.
 * - Rotation remains existing canonical service/guard.
 * - No planning writes.
 */
var BATCH_PLANNING_FOUNDATION_BUILD = '2026-09-17_BATCH_PLANNING_FOUNDATION_R1';

var BATCH_PLANNING_POLICY = Object.freeze({
  advisoryOnly: true,
  plannerControlsFinalSelection: true,
  companyLocationOwner: 'Companies.Locations_JSON',
  auditorOwner: 'Auditors',
  availabilityOwner: 'Availability',
  routeProvider: 'Google Routes API / Compute Route Matrix',
  routeCacheRequired: true,
  routeMetrics: ['distanceMeters', 'durationSeconds'],
  geographicInputs: ['auditorDeparturePoint', 'auditLocation', 'interAuditRoute'],
  flightOptimisation: false,
  hotelOptimisation: false,
  hotelMapLayerFuture: true,
  recommendedHotelsFuture: true
});

/**
 * Normalized departure-point contract.
 * The actual auditor base field is deliberately not invented here. The caller
 * must supply a resolved canonical departure point once its Auditors column is
 * confirmed/configured.
 */
function BatchPlanning_normalizePoint_(raw) {
  raw = raw || {};
  var lat = Number(raw.lat != null ? raw.lat : raw.latitude);
  var lng = Number(raw.lng != null ? raw.lng : raw.longitude);
  var gps = String(raw.gps || raw.gpsData || '').trim();
  var label = String(raw.label || raw.name || '').trim();

  if ((!isFinite(lat) || !isFinite(lng)) && gps) {
    var m = gps.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      lat = Number(m[1]);
      lng = Number(m[2]);
    }
  }

  var hasCoords = isFinite(lat) && isFinite(lng);
  return {
    ok: hasCoords,
    label: label,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    gps: gps || (hasCoords ? (lat + ',' + lng) : '')
  };
}

/** Resolve an audit/company location from the existing Companies index. */
function BatchPlanning_getCompanyLocation_(companyName, locationCodeOrLabel) {
  var company = (typeof CompaniesIndex_GetCompanyCoreByName === 'function')
    ? CompaniesIndex_GetCompanyCoreByName(companyName)
    : null;
  if (!company) return { ok:false, reason:'COMPANY_NOT_FOUND', companyName:String(companyName || '') };

  var wanted = String(locationCodeOrLabel || '').trim().toLowerCase();
  var summary = company.locationsSummary || {};
  var locations = Array.isArray(summary.locations) ? summary.locations : [];
  var selected = null;

  if (wanted) {
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i] || {};
      var keys = [loc.code, loc.label, loc.name, loc.location].map(function(v){ return String(v || '').trim().toLowerCase(); });
      if (keys.indexOf(wanted) >= 0) { selected = loc; break; }
    }
  }
  if (!selected && locations.length) {
    for (var j = 0; j < locations.length; j++) {
      var l = locations[j] || {};
      if (l.hq === true || String(l.type || '').toUpperCase() === 'HQ' || String(l.code || '').toUpperCase() === 'HQ') {
        selected = l; break;
      }
    }
  }

  var point = BatchPlanning_normalizePoint_(selected || { label: company.location, gps: company.gpsData });
  return {
    ok: point.ok,
    reason: point.ok ? '' : 'LOCATION_COORDINATES_MISSING',
    companyUid: String(company.companyUid || ''),
    companyName: String(company.companyName || companyName || ''),
    location: String((selected && (selected.label || selected.name || selected.code)) || company.location || locationCodeOrLabel || ''),
    point: point,
    source: 'Companies.Locations_JSON'
  };
}

/**
 * Candidate shell for Batch Planning. No score is intentionally calculated:
 * scoring/weighting requires planner-approved functional rules.
 */
function BatchPlanning_buildCandidate_(input) {
  input = input || {};
  var auditorEmail = String(input.auditorEmail || '').trim().toLowerCase();
  var departure = BatchPlanning_normalizePoint_(input.auditorDeparturePoint || {});
  var destination = BatchPlanning_getCompanyLocation_(input.companyName, input.location);

  return {
    build: BATCH_PLANNING_FOUNDATION_BUILD,
    advisoryOnly: true,
    auditId: String(input.auditId || '').trim(),
    auditorEmail: auditorEmail,
    auditorDeparturePoint: departure,
    destination: destination,
    planningWindow: input.planningWindow || null,
    auditDurationMinutes: Number(input.auditDurationMinutes || 0) || 0,
    eligibility: input.eligibility || null,
    availability: input.availability || null,
    rotation: input.rotation || null,
    route: input.route || null,
    interAuditRoutes: Array.isArray(input.interAuditRoutes) ? input.interAuditRoutes : [],
    decision: null,
    score: null,
    requiresPlannerRules: true
  };
}

/** Route matrix response normalizer for later Google Routes adapter. */
function BatchPlanning_normalizeRouteMetric_(raw) {
  raw = raw || {};
  var distanceMeters = Number(raw.distanceMeters);
  var durationSeconds = Number(raw.durationSeconds);
  if (!isFinite(durationSeconds) && raw.duration) {
    var m = String(raw.duration).match(/([0-9.]+)s/);
    if (m) durationSeconds = Number(m[1]);
  }
  return {
    ok: isFinite(distanceMeters) && distanceMeters >= 0 && isFinite(durationSeconds) && durationSeconds >= 0,
    distanceMeters: isFinite(distanceMeters) ? distanceMeters : null,
    durationSeconds: isFinite(durationSeconds) ? durationSeconds : null
  };
}

function BatchPlanning_GetFoundationContract() {
  return {
    ok: true,
    build: BATCH_PLANNING_FOUNDATION_BUILD,
    policy: BATCH_PLANNING_POLICY,
    nextFunctionalGate: [
      'Confirm canonical auditor departure-point field/configuration.',
      'Confirm planner weighting/priorities before any candidate scoring.',
      'Confirm first Batch Planning interaction/workflow before UI implementation.'
    ]
  };
}
