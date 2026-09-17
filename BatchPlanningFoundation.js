/**
 * FILE: BatchPlanningFoundation.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_FOUNDATION_R2_APPROVED_FUNCTIONAL_CONTRACT
 *
 * PURPOSE
 * - Canonical advisory contract for future manager Batch Planning.
 * - Captures planner-approved functional rules before candidate scoring/UI work.
 * - No planning writes and no route API calls in this foundation.
 */
var BATCH_PLANNING_FOUNDATION_BUILD = '2026-09-17_BATCH_PLANNING_FOUNDATION_R2_APPROVED_FUNCTIONAL_CONTRACT';

var BATCH_PLANNING_POLICY = Object.freeze({
  advisoryOnly: true,
  plannerControlsFinalSelection: true,
  explicitConfirmBeforeWrite: true,
  oneIdealConceptPlan: true,
  manualDragDropAfterGeneration: true,
  noAutomaticReoptimisationAfterPlannerMove: true,

  companyLocationOwner: 'Companies.Locations_JSON',
  auditorOwner: 'Auditors',
  auditorDefaultDepartureField: 'Auditors.Default departure from',
  auditorDefaultDepartureColumn: 'Q',
  hoursOwner: 'Hours to be planned',
  availabilityOwner: 'Availability',
  rotationLimitOwner: 'Config_Scopes.Max number audits',
  rotationLimitColumn: 'J',

  planningWindowLeading: true,
  outsidePlanningWindowAllowed: false,
  approvedAcceptedAreAnchors: true,
  existingAnchorsNeverAutoMoved: true,

  routeProvider: 'Google Routes API / Compute Route Matrix',
  routeCacheRequired: true,
  routeMetrics: ['distanceMeters', 'durationSeconds'],
  travelTimeLeading: true,
  distanceInformational: true,
  geographicInputs: ['inboundPoint', 'auditLocation', 'interAuditRoute', 'outboundPoint'],
  inboundOutboundIndependent: true,
  inboundDefault: 'HOME',
  outboundDefault: 'HOME',
  existingPreviousStopMayAnchorInbound: true,
  existingNextStopMayAnchorOutbound: true,
  outboundSuggestionFuture: true,

  auditHoursLeading: true,
  travelPlannedAroundAuditHours: true,
  hardDailyTravelLimit: false,
  longTravelAdvisoryOnly: true,

  softConstraintsAdvisory: true,
  companySoftConstraintsIncluded: true,
  auditorSoftConstraintsIncluded: true,

  separatePlanningStopField: 'separatePlanningStop',
  separatePlanningStopDefault: false,
  separatePlanningStopOwner: 'Companies.Locations_JSON',
  separateStopHoursAreAllocationOnly: true,
  separateStopHoursMustSumToHoursToBePlanned: true,
  separateStopHoursPlannerControlled: true,

  rotationWarningOffset: 1,
  rotationHardBlockBeyondWarning: true,

  flightOptimisation: false,
  hotelOptimisation: false,
  hotelMapLayerFuture: true,
  recommendedHotelsFuture: true
});

function BatchPlanning_normalizePoint_(raw) {
  raw = raw || {};
  if (typeof raw === 'string') raw = { label: raw };
  var lat = Number(raw.lat != null ? raw.lat : raw.latitude);
  var lng = Number(raw.lng != null ? raw.lng : raw.longitude);
  var gps = String(raw.gps || raw.gpsData || '').trim();
  var label = String(raw.label || raw.name || raw.location || '').trim();
  var mapsUrl = String(raw.mapsUrl || raw.googleMapsUrl || raw.url || '').trim();

  if ((!isFinite(lat) || !isFinite(lng)) && gps) {
    var m = gps.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      lat = Number(m[1]);
      lng = Number(m[2]);
    }
  }

  var hasCoords = isFinite(lat) && isFinite(lng);
  return {
    ok: hasCoords || !!label || !!mapsUrl,
    label: label,
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    gps: gps || (hasCoords ? (lat + ',' + lng) : ''),
    mapsUrl: mapsUrl
  };
}

function BatchPlanning_normalizeLocationPlanningMeta_(rawLocation) {
  rawLocation = rawLocation || {};
  var separate = rawLocation.separatePlanningStop === true || String(rawLocation.separatePlanningStop || '').toLowerCase() === 'true';
  var stopHours = Number(rawLocation.planningStopHours != null ? rawLocation.planningStopHours : rawLocation.defaultPlanningHours);
  return {
    separatePlanningStop: separate,
    planningStopHours: isFinite(stopHours) && stopHours >= 0 ? stopHours : null
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
  var planningMeta = BatchPlanning_normalizeLocationPlanningMeta_(selected || {});
  return {
    ok: point.ok,
    reason: point.ok ? '' : 'LOCATION_COORDINATES_MISSING',
    companyUid: String(company.companyUid || ''),
    companyName: String(company.companyName || companyName || ''),
    location: String((selected && (selected.label || selected.name || selected.code)) || company.location || locationCodeOrLabel || ''),
    point: point,
    separatePlanningStop: planningMeta.separatePlanningStop,
    planningStopHours: planningMeta.planningStopHours,
    source: 'Companies.Locations_JSON'
  };
}

function BatchPlanning_evaluateRotation_(completedCount, maxNumberAudits) {
  var count = Number(completedCount);
  var max = Number(maxNumberAudits);
  if (!isFinite(count) || count < 0 || !isFinite(max) || max < 0) {
    return { status:'UNKNOWN', allowed:false, warning:true };
  }
  var nextOrdinal = count + 1;
  if (nextOrdinal <= max) return { status:'OK', allowed:true, warning:false, nextOrdinal:nextOrdinal, max:max };
  if (nextOrdinal === max + BATCH_PLANNING_POLICY.rotationWarningOffset) {
    return { status:'WARNING', allowed:true, warning:true, exceptionRequired:true, nextOrdinal:nextOrdinal, max:max };
  }
  return { status:'HARD_BLOCK', allowed:false, warning:true, nextOrdinal:nextOrdinal, max:max };
}

function BatchPlanning_validateStopHours_(hoursToBePlanned, stops) {
  var total = Number(hoursToBePlanned);
  var list = Array.isArray(stops) ? stops : [];
  if (!isFinite(total) || total < 0) return { ok:false, reason:'INVALID_HOURS_TO_BE_PLANNED' };
  var sum = 0;
  for (var i = 0; i < list.length; i++) {
    var hours = Number(list[i] && list[i].hours);
    if (!isFinite(hours) || hours < 0) return { ok:false, reason:'INVALID_STOP_HOURS', index:i };
    sum += hours;
  }
  var ok = Math.abs(sum - total) < 0.000001;
  return { ok:ok, reason:ok ? '' : 'STOP_HOURS_MUST_SUM_TO_HOURS_TO_BE_PLANNED', sumHours:sum, hoursToBePlanned:total };
}

function BatchPlanning_resolveBoundaryPoints_(input) {
  input = input || {};
  var home = BatchPlanning_normalizePoint_(input.home || input.defaultDeparturePoint || {});
  var inbound = BatchPlanning_normalizePoint_(input.inbound || input.previousPlannedStop || home);
  var outbound = BatchPlanning_normalizePoint_(input.outbound || input.nextPlannedStop || home);
  return {
    home: home,
    inbound: inbound,
    outbound: outbound,
    inboundSource: input.inbound ? 'PLANNER_OVERRIDE' : (input.previousPlannedStop ? 'PREVIOUS_PLANNED_STOP' : 'HOME'),
    outboundSource: input.outbound ? 'PLANNER_OVERRIDE' : (input.nextPlannedStop ? 'NEXT_PLANNED_STOP' : 'HOME')
  };
}

function BatchPlanning_buildCandidate_(input) {
  input = input || {};
  var auditorEmail = String(input.auditorEmail || '').trim().toLowerCase();
  var boundaries = BatchPlanning_resolveBoundaryPoints_({
    home: input.auditorDeparturePoint || input.home,
    inbound: input.inboundPoint,
    outbound: input.outboundPoint,
    previousPlannedStop: input.previousPlannedStop,
    nextPlannedStop: input.nextPlannedStop
  });
  var destination = BatchPlanning_getCompanyLocation_(input.companyName, input.location);

  return {
    build: BATCH_PLANNING_FOUNDATION_BUILD,
    advisoryOnly: true,
    auditId: String(input.auditId || '').trim(),
    auditorEmail: auditorEmail,
    boundaries: boundaries,
    destination: destination,
    planningWindow: input.planningWindow || null,
    hoursToBePlanned: Number(input.hoursToBePlanned != null ? input.hoursToBePlanned : (Number(input.auditDurationMinutes || 0) / 60)) || 0,
    eligibility: input.eligibility || null,
    availability: input.availability || null,
    rotation: input.rotation || null,
    companySoftConstraints: input.companySoftConstraints || null,
    auditorSoftConstraints: input.auditorSoftConstraints || null,
    existingAnchor: input.existingAnchor || null,
    route: input.route || null,
    interAuditRoutes: Array.isArray(input.interAuditRoutes) ? input.interAuditRoutes : [],
    decision: null,
    score: null,
    requiresRouteAndCandidateEngine: true
  };
}

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
    functionalDecisionsComplete: true,
    nextTechnicalGate: [
      'Expose Auditors column Q Default departure from through the canonical auditor read model.',
      'Expose Locations_JSON separatePlanningStop and optional default stop-hour allocation.',
      'Build read-only candidate collection using planning windows, eligibility, Availability, rotation and soft constraints.',
      'Add cached route-matrix adapter before geographic scoring.',
      'Generate one advisory concept plan between inbound and outbound anchors.'
    ]
  };
}
