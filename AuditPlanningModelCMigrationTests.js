/**
 * AuditPlanningModelCMigrationTests.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_1_TESTS_R1
 * Pure tests. No sheet mutation.
 */

var MODEL_C_MIGRATION_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_1_TESTS_R2';

function RUN_MODEL_C_PHASE1_REGRESSION() {
  var tests = [
    ModelCMigrationTest_preflightEmptyTargets_,
    ModelCMigrationTest_preflightRejectsData_,
    ModelCMigrationTest_prepareCertificate_,
    ModelCMigrationTest_prepareAbc_,
    ModelCMigrationTest_prepareDependency_,
    ModelCMigrationTest_rejectDuplicateNaturalKey_,
    ModelCMigrationTest_stateMapping_
  ];
  var results = [];
  var passed = 0;
  for (var i = 0; i < tests.length; i++) {
    var name = tests[i].name || ('test_' + (i + 1));
    try {
      tests[i]();
      results.push({ name: name, ok: true });
      passed++;
    } catch (e) {
      results.push({ name: name, ok: false, error: String(e && e.message ? e.message : e) });
    }
  }
  var out = { ok: passed === tests.length, build: MODEL_C_MIGRATION_TEST_BUILD, migrationBuild: MODEL_C_MIGRATION_BUILD, passed: passed, total: tests.length, writesPerformed: false, results: results };
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.ok) throw new Error('Model C phase 1 regression failed: ' + JSON.stringify(out));
  return out;
}

function ModelCMigrationTest_preflightEmptyTargets_() {
  var result = ModelCMigration_preflightTargets_({ A: { exists: false, rows: 0, schemaValid: false }, B: { exists: true, rows: 0, schemaValid: true } });
  ModelCMigrationTest_assert_(result.success === true, 'empty targets should pass');
}

function ModelCMigrationTest_preflightRejectsData_() {
  var result = ModelCMigration_preflightTargets_({ A: { exists: true, rows: 1, schemaValid: true } });
  ModelCMigrationTest_assert_(result.success === false, 'populated target must block');
}

function ModelCMigrationTest_prepareCertificate_() {
  var source = ModelCMigrationTest_source_({
    Company: 'Grower', Company_UID: 'C1', 'Audit ID': 'AUD_1', Status: 'Pending Planning',
    SCOPE_02: 'x', 'Duration SCOPE_02': 8,
    'Birthdate certificate': '2018-05-31', 'Date - Will Expire': '2027-05-31',
    'Extended Expiration Date': '2027-05-31', 'Planning window from': '2027-03-01', 'Planning window to': '2027-05-31'
  });
  var result = ModelCMigration_prepare_(source, 'BATCH', false);
  ModelCMigrationTest_assert_(result.success === true, 'certificate preparation failed');
  ModelCMigrationTest_assert_(result.companyScopes.length === 1, 'company scope count');
  ModelCMigrationTest_assert_(result.obligations[0].Base_Expiry_Date === '2027-05-31', 'certificate expiry missing');
  ModelCMigrationTest_assert_(result.visitLinks.length === 1, 'link missing');
}

function ModelCMigrationTest_prepareAbc_() {
  var source = ModelCMigrationTest_source_({
    Company: 'ABC Grower', Company_UID: 'C2', 'Audit ID': 'AUD_2', Status: 'Pending Planning',
    SCOPE_01: 'x', 'Duration SCOPE_01': 5,
    'Birthdate certificate': '2026-12-31', 'Date - Will Expire': '2026-12-31',
    'Extended Expiration Date': '2026-12-31', 'Planning window from': '2026-01-01', 'Planning window to': '2026-12-31'
  });
  var result = ModelCMigration_prepare_(source, 'BATCH', false);
  ModelCMigrationTest_assert_(result.success === true, 'ABC preparation failed');
  ModelCMigrationTest_assert_(result.companyScopes[0].Certificate_Birthday === '', 'ABC birthday must be empty');
  ModelCMigrationTest_assert_(result.obligations[0].Base_Expiry_Date === '', 'ABC expiry must be empty');
  ModelCMigrationTest_assert_(result.obligations[0].Cycle_Key === '2026', 'ABC cycle year incorrect');
  ModelCMigrationTest_assert_(result.obligations[0].Trigger_Source === 'ECAS', 'ABC trigger incorrect');
}

function ModelCMigrationTest_prepareDependency_() {
  var source = ModelCMigrationTest_source_({
    Company: 'Grower', Company_UID: 'C3', 'Audit ID': 'AUD_3', Status: 'Pending Planning',
    SCOPE_02: 'x', 'Duration SCOPE_02': 8
  });
  source.scopeCatalog.byCode['MPS-GAP'] = source.scopeCatalog.bySlot.SCOPE_02;
  source.scopeCatalog.byCode.GRASP = { slotKey: 'SCOPE_03', scopeCode: 'GRASP', displayName: 'GRASP', recurring: 'YES' };
  var result = ModelCMigration_prepare_(source, 'BATCH', false);
  ModelCMigrationTest_assert_(result.dependencies.length === 1, 'GAP-GRASP dependency missing');
  ModelCMigrationTest_assert_(result.dependencies[0].Must_Audit_Together === 'YES', 'dependency together flag');
  ModelCMigrationTest_assert_(result.dependencies[0].Share_Expiry === 'YES', 'dependency expiry flag');
}

function ModelCMigrationTest_rejectDuplicateNaturalKey_() {
  var cs = [{ Company_Scope_ID: 'CS1', Company_UID: 'C1', ScopeCode: 'MPS-GAP' }];
  var obligations = [
    { Obligation_ID: 'O1', Company_Scope_ID: 'CS1', Company_UID: 'C1', ScopeCode: 'MPS-GAP', Cycle_Key: '2027-01-01', Trigger_Source: 'CERTIFICATE_LIFECYCLE' },
    { Obligation_ID: 'O2', Company_Scope_ID: 'CS1', Company_UID: 'C1', ScopeCode: 'MPS-GAP', Cycle_Key: '2027-01-01', Trigger_Source: 'CERTIFICATE_LIFECYCLE' }
  ];
  var links = [
    { Audit_ID: 'A1', Obligation_ID: 'O1', Link_State: 'ACTIVE' },
    { Audit_ID: 'A2', Obligation_ID: 'O2', Link_State: 'ACTIVE' }
  ];
  var result = ModelCMigration_validatePrepared_([], cs, obligations, links, []);
  ModelCMigrationTest_assert_(result.success === false, 'duplicate obligation natural key accepted');
}

function ModelCMigrationTest_stateMapping_() {
  ModelCMigrationTest_assert_(ModelCMigration_obligationStateFromVisitStatus_('Pending Planning') === 'OPEN', 'pending mapping');
  ModelCMigrationTest_assert_(ModelCMigration_obligationStateFromVisitStatus_('Accepted') === 'LINKED_TO_VISIT', 'accepted mapping');
  ModelCMigrationTest_assert_(ModelCMigration_obligationStateFromVisitStatus_('Completed') === 'COMPLETED', 'completed mapping');
}

function ModelCMigrationTest_source_(values) {
  var headers = [
    'Company', 'Company_UID', 'Audit ID', 'Status',
    'SCOPE_01', 'Duration SCOPE_01', 'SCOPE_02', 'Duration SCOPE_02',
    'Birthdate certificate', 'Preassigned Auditor', 'Date - Will Expire',
    'Extended Expiration Date', 'Allow self planning', 'Extension applied',
    'Planning window from', 'Planning window to'
  ];
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push('');
  Object.keys(values || {}).forEach(function(key) {
    var idx = headers.indexOf(key);
    if (idx >= 0) row[idx] = values[key];
  });
  return {
    success: true,
    planningHeaders: headers,
    planningRows: [row],
    configValues: [],
    scopeCatalog: {
      bySlot: {
        SCOPE_01: { slotKey: 'SCOPE_01', scopeCode: 'MPS-ABC', displayName: 'MPS-ABC', recurring: 'NO' },
        SCOPE_02: { slotKey: 'SCOPE_02', scopeCode: 'MPS-GAP', displayName: 'MPS-GAP', recurring: 'YES' }
      },
      byCode: {}, warnings: []
    }
  };
}

function ModelCMigrationTest_assert_(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}
