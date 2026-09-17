/**
 * FILE: BatchPlanningFoundationTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_FOUNDATION_TESTS_R1
 * RUN: RUN_BATCH_PLANNING_FOUNDATION_REGRESSION
 */
var BATCH_PLANNING_FOUNDATION_TEST_BUILD = '2026-09-17_BATCH_PLANNING_FOUNDATION_TESTS_R1';

function RUN_BATCH_PLANNING_FOUNDATION_REGRESSION() {
  var results = [];
  function test(name, fn) {
    try {
      var ok = !!fn();
      results.push({ name:name, ok:ok, detail:ok ? '' : 'Contract failed' });
    } catch (e) {
      results.push({ name:name, ok:false, detail:String(e && e.message || e) });
    }
  }

  var policy = (typeof BATCH_PLANNING_POLICY !== 'undefined') ? BATCH_PLANNING_POLICY : {};
  var src = String(BatchPlanning_buildCandidate_);
  var allSrc = String(BatchPlanning_GetFoundationContract) + String(BatchPlanning_buildCandidate_) + String(BatchPlanning_getCompanyLocation_);

  test('advisoryOnly', function(){ return policy.advisoryOnly === true && policy.plannerControlsFinalSelection === true; });
  test('companyLocationSsotRetained', function(){ return policy.companyLocationOwner === 'Companies.Locations_JSON'; });
  test('availabilityOwnerRetained', function(){ return policy.availabilityOwner === 'Availability'; });
  test('auditorOwnerRetained', function(){ return policy.auditorOwner === 'Auditors'; });
  test('departurePointIncluded', function(){ return policy.geographicInputs.indexOf('auditorDeparturePoint') >= 0; });
  test('interAuditRouteIncluded', function(){ return policy.geographicInputs.indexOf('interAuditRoute') >= 0; });
  test('distanceAndTimeRequired', function(){ return policy.routeMetrics.indexOf('distanceMeters') >= 0 && policy.routeMetrics.indexOf('durationSeconds') >= 0; });
  test('googleRouteMatrixAdapterDeclared', function(){ return String(policy.routeProvider).indexOf('Compute Route Matrix') >= 0; });
  test('routeCacheRequired', function(){ return policy.routeCacheRequired === true; });
  test('flightOptimisationNotImplemented', function(){ return policy.flightOptimisation === false; });
  test('hotelOptimisationNotImplemented', function(){ return policy.hotelOptimisation === false; });
  test('hotelMapLayerReserved', function(){ return policy.hotelMapLayerFuture === true && policy.recommendedHotelsFuture === true; });
  test('noCandidateScoreYet', function(){ return src.indexOf('score: null') >= 0 && src.indexOf('requiresPlannerRules: true') >= 0; });
  test('noPlanningWrite', function(){ return allSrc.indexOf('setValue(') < 0 && allSrc.indexOf('setValues(') < 0 && allSrc.indexOf('appendRow(') < 0; });
  test('noAvailabilityWrite', function(){ return allSrc.indexOf('AVAILABILITY_WRITE') < 0 && allSrc.indexOf('saveAvailability') < 0; });
  test('noMapsApiCallYet', function(){ return allSrc.indexOf('UrlFetchApp') < 0 && allSrc.indexOf('maps.googleapis.com') < 0; });
  test('auditorBaseFieldNotInvented', function(){
    var gate = BatchPlanning_GetFoundationContract().nextFunctionalGate || [];
    return gate.join('|').indexOf('auditor departure-point field') >= 0;
  });
  test('plannerWeightingGatePresent', function(){
    var gate = BatchPlanning_GetFoundationContract().nextFunctionalGate || [];
    return gate.join('|').indexOf('planner weighting') >= 0;
  });

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: BATCH_PLANNING_FOUNDATION_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
    meta: {
      nonDestructive: true,
      liveReadsPerformed: false,
      liveWritesPerformed: false,
      contract: 'Batch Planning foundation uses auditor departure point + company/audit locations + inter-audit distance/time, while flight/hotel optimisation remains explicitly out of scope.'
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
