/**
 * FILE: BatchPlanningFoundationTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_FOUNDATION_TESTS_R2_APPROVED_FUNCTIONAL_CONTRACT
 * RUN: RUN_BATCH_PLANNING_FOUNDATION_REGRESSION
 */
var BATCH_PLANNING_FOUNDATION_TEST_BUILD = '2026-09-17_BATCH_PLANNING_FOUNDATION_TESTS_R2_APPROVED_FUNCTIONAL_CONTRACT';

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

  var p = BATCH_PLANNING_POLICY || {};
  var allSrc = String(BatchPlanning_GetFoundationContract) + String(BatchPlanning_buildCandidate_) + String(BatchPlanning_getCompanyLocation_);

  test('advisoryPlannerControlled', function(){ return p.advisoryOnly === true && p.plannerControlsFinalSelection === true && p.explicitConfirmBeforeWrite === true; });
  test('oneConceptThenDragDrop', function(){ return p.oneIdealConceptPlan === true && p.manualDragDropAfterGeneration === true && p.noAutomaticReoptimisationAfterPlannerMove === true; });
  test('canonicalOwners', function(){ return p.companyLocationOwner === 'Companies.Locations_JSON' && p.auditorOwner === 'Auditors' && p.availabilityOwner === 'Availability'; });
  test('auditorDepartureColumnQ', function(){ return p.auditorDefaultDepartureColumn === 'Q' && p.auditorDefaultDepartureField === 'Auditors.Default departure from'; });
  test('hoursToBePlannedLeading', function(){ return p.hoursOwner === 'Hours to be planned' && p.auditHoursLeading === true; });
  test('planningWindowLeading', function(){ return p.planningWindowLeading === true && p.outsidePlanningWindowAllowed === false; });
  test('approvedAcceptedAnchors', function(){ return p.approvedAcceptedAreAnchors === true && p.existingAnchorsNeverAutoMoved === true; });
  test('travelTimeLeading', function(){ return p.travelTimeLeading === true && p.distanceInformational === true; });
  test('openRouteInboundOutbound', function(){ return p.inboundOutboundIndependent === true && p.inboundDefault === 'HOME' && p.outboundDefault === 'HOME'; });
  test('existingBoundaryAnchors', function(){ return p.existingPreviousStopMayAnchorInbound === true && p.existingNextStopMayAnchorOutbound === true; });
  test('travelAroundAuditHours', function(){ return p.travelPlannedAroundAuditHours === true && p.hardDailyTravelLimit === false && p.longTravelAdvisoryOnly === true; });
  test('softConstraintsIncluded', function(){ return p.softConstraintsAdvisory === true && p.companySoftConstraintsIncluded === true && p.auditorSoftConstraintsIncluded === true; });
  test('separatePlanningStopContract', function(){ return p.separatePlanningStopOwner === 'Companies.Locations_JSON' && p.separatePlanningStopField === 'separatePlanningStop' && p.separatePlanningStopDefault === false; });
  test('stopHoursAllocationOnly', function(){ return p.separateStopHoursAreAllocationOnly === true && p.separateStopHoursMustSumToHoursToBePlanned === true && p.separateStopHoursPlannerControlled === true; });
  test('rotationDynamicOwner', function(){ return p.rotationLimitOwner === 'Config_Scopes.Max number audits' && p.rotationLimitColumn === 'J' && p.rotationWarningOffset === 1; });
  test('rotationEvaluator', function(){
    return BatchPlanning_evaluateRotation_(2, 3).status === 'OK' &&
      BatchPlanning_evaluateRotation_(3, 3).status === 'WARNING' &&
      BatchPlanning_evaluateRotation_(4, 3).status === 'HARD_BLOCK' &&
      BatchPlanning_evaluateRotation_(5, 5).status === 'WARNING';
  });
  test('stopHoursValidator', function(){
    return BatchPlanning_validateStopHours_(9, [{hours:5},{hours:4}]).ok === true &&
      BatchPlanning_validateStopHours_(9, [{hours:5},{hours:3}]).ok === false;
  });
  test('boundaryOverridePriority', function(){
    var x = BatchPlanning_resolveBoundaryPoints_({
      home:{label:'Valencia'}, previousPlannedStop:{label:'Audit A'}, nextPlannedStop:{label:'Audit Z'},
      inbound:{label:'Lisbon Airport'}, outbound:{label:'Porto Airport'}
    });
    return x.inbound.label === 'Lisbon Airport' && x.outbound.label === 'Porto Airport' && x.inboundSource === 'PLANNER_OVERRIDE' && x.outboundSource === 'PLANNER_OVERRIDE';
  });
  test('boundaryExistingAuditFallback', function(){
    var x = BatchPlanning_resolveBoundaryPoints_({home:{label:'Valencia'}, previousPlannedStop:{label:'Audit A'}, nextPlannedStop:{label:'Audit Z'}});
    return x.inbound.label === 'Audit A' && x.outbound.label === 'Audit Z' && x.inboundSource === 'PREVIOUS_PLANNED_STOP' && x.outboundSource === 'NEXT_PLANNED_STOP';
  });
  test('googleRouteMatrixDeclaredAndCached', function(){ return String(p.routeProvider).indexOf('Compute Route Matrix') >= 0 && p.routeCacheRequired === true; });
  test('flightHotelOptimisationStillParked', function(){ return p.flightOptimisation === false && p.hotelOptimisation === false && p.hotelMapLayerFuture === true && p.recommendedHotelsFuture === true; });
  test('noPlanningWrite', function(){ return allSrc.indexOf('setValue(') < 0 && allSrc.indexOf('setValues(') < 0 && allSrc.indexOf('appendRow(') < 0; });
  test('noMapsApiCallYet', function(){ return allSrc.indexOf('UrlFetchApp') < 0 && allSrc.indexOf('maps.googleapis.com') < 0; });
  test('functionalDecisionsComplete', function(){ return BatchPlanning_GetFoundationContract().functionalDecisionsComplete === true; });

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
      contract: 'Approved Batch Planning functional contract: planning-window-led, open inbound/outbound route, one advisory concept plan, existing anchors fixed, soft constraints advisory, dynamic rotation limit, separate location stops with Hours to be planned remaining canonical total.'
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
