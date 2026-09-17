/**
 * FILE: BatchPlanningReadModelTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_READ_MODEL_TESTS_R1
 * RUN: RUN_BATCH_PLANNING_READ_MODEL_REGRESSION
 */
var BATCH_PLANNING_READ_MODEL_TEST_BUILD = '2026-09-17_BATCH_PLANNING_READ_MODEL_TESTS_R1';

function RUN_BATCH_PLANNING_READ_MODEL_REGRESSION() {
  var results = [];
  function test(name, fn) {
    try {
      var ok = !!fn();
      results.push({name:name, ok:ok, detail:ok ? '' : 'Contract failed'});
    } catch (e) {
      results.push({name:name, ok:false, detail:String(e && e.message || e)});
    }
  }

  var directory = AuditorsIndex_GetDirectory(false);
  var auditors = directory && directory.list ? directory.list : [];
  var first = auditors.length ? BatchPlanningReadModel_GetAuditor(auditors[0].email, false) : null;
  var src = String(BatchPlanningReadModel_GetAuditor) + String(BatchPlanningReadModel_getDepartureFrom_) + String(BatchPlanningReadModel_GetBoundaryDefaults);

  test('directoryAvailable', function(){ return !!(directory && directory.ok); });
  test('auditorsPresent', function(){ return auditors.length > 0; });
  test('auditorReadModelResolves', function(){ return !!(first && first.ok); });
  test('departureOwnerAuditors', function(){ return first && first.source === 'Auditors'; });
  test('departureHeaderCanonical', function(){ return first && first.sourceField === 'Default departure from'; });
  test('departureColumnQDeclared', function(){ return first && first.sourceColumn === 'Q'; });
  test('departureValuePresent', function(){ return first && String(first.defaultDepartureFrom || '').trim().length > 0; });
  test('homeDefaultsInboundOutbound', function(){ return first && first.defaultInbound === first.defaultDepartureFrom && first.defaultOutbound === first.defaultDepartureFrom; });
  test('auditorSoftConstraintFieldsExposed', function(){ return first && first.hasOwnProperty('blockedWeekdays') && first.hasOwnProperty('timezone'); });
  test('companyLocationDelegatesCanonicalOwner', function(){ return typeof BatchPlanningReadModel_GetCompanyLocation === 'function' && BATCH_PLANNING_POLICY.companyLocationOwner === 'Companies.Locations_JSON'; });
  test('boundaryResolverAvailable', function(){ return typeof BatchPlanningReadModel_GetBoundaryDefaults === 'function'; });
  test('previousNextAnchorsSupported', function(){ return src.indexOf('previousPlannedStop') >= 0 && src.indexOf('nextPlannedStop') >= 0; });
  test('plannerBoundaryOverridesSupported', function(){ return src.indexOf('input.inbound') >= 0 && src.indexOf('input.outbound') >= 0; });
  test('readOnlyNoPlanningWrites', function(){ return src.indexOf('setValue(') < 0 && src.indexOf('setValues(') < 0 && src.indexOf('appendRow(') < 0; });

  var diag = RUN_BATCH_PLANNING_READ_MODEL_DIAGNOSTICS();
  test('diagnosticsNonDestructive', function(){ return diag && diag.ok && diag.nonDestructive === true; });
  test('diagnosticsDepartureValues', function(){
    return (diag.sample || []).every(function(x){ return String(x.defaultDepartureFrom || '').trim().length > 0; });
  });

  var passed = results.filter(function(x){return x.ok;}).length;
  var out = {
    ok:passed === results.length,
    build:BATCH_PLANNING_READ_MODEL_TEST_BUILD,
    total:results.length,
    passed:passed,
    failed:results.length-passed,
    results:results,
    meta:{
      nonDestructive:true,
      liveReadsPerformed:true,
      liveWritesPerformed:false,
      contract:'Batch Planning read model exposes Auditors Default departure from (column Q) and canonical location/boundary inputs without planning writes.'
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
