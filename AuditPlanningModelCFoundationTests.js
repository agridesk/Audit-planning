/**
 * AuditPlanningModelCFoundationTests.gs
 * Build: 2026-09-20_AMS_01_6_MODEL_C_PHASE_0_TESTS_R1
 *
 * Pure regression tests for AuditPlanningModelCFoundation.
 * No sheet writes and no production data mutation.
 */

var MODEL_C_FOUNDATION_TEST_BUILD = '2026-09-20_AMS_01_6_MODEL_C_PHASE_0_TESTS_R2_READINESS_GATES';

function RUN_MODEL_C_PHASE0_REGRESSION() {
  var tests = [
    ModelCFoundationTest_schemaContract_,
    ModelCFoundationTest_headerValidation_,
    ModelCFoundationTest_scopeExtraction_,
    ModelCFoundationTest_rowAnalysis_,
    ModelCFoundationTest_abcLifecycleDetection_,
    ModelCFoundationTest_duplicateAuditId_,
    ModelCFoundationTest_migrationGates_
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

  var out = {
    ok: passed === tests.length,
    build: MODEL_C_FOUNDATION_TEST_BUILD,
    foundationBuild: MODEL_C_FOUNDATION_BUILD,
    passed: passed,
    total: tests.length,
    writesPerformed: false,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  if (!out.ok) throw new Error('Model C phase 0 regression failed: ' + JSON.stringify(out));
  return out;
}

function ModelCFoundationTest_schemaContract_() {
  var contract = ModelCFoundation_getContract();
  ModelCFoundationTest_assert_(contract.success === true, 'contract must succeed');
  ModelCFoundationTest_assert_(contract.readOnly === true, 'contract must be read-only');
  ModelCFoundationTest_assert_(MODEL_C_SCHEMA.Company_Scopes.indexOf('Company_Scope_ID') >= 0, 'Company Scope ID missing');
  ModelCFoundationTest_assert_(MODEL_C_SCHEMA.Audit_Obligations.indexOf('Obligation_ID') >= 0, 'Obligation ID missing');
  ModelCFoundationTest_assert_(MODEL_C_SCHEMA.Audit_Obligations.indexOf('Planning_Duration') < 0, 'Planning duration must remain in Config_Scopes');
  ModelCFoundationTest_assert_(MODEL_C_SCHEMA.Audit_Visit_Obligations.indexOf('Audit_ID') >= 0, 'Visit link Audit ID missing');
}

function ModelCFoundationTest_headerValidation_() {
  var result = ModelCFoundation_validateHeaders_('X', ['Audit ID', 'Company_UID', 'Status'], ['Audit ID', 'Company_UID']);
  ModelCFoundationTest_assert_(result.valid === true, 'valid headers rejected');
  ModelCFoundationTest_assert_(result.extra.length === 1 && result.extra[0] === 'Status', 'extra header not reported');

  var missing = ModelCFoundation_validateHeaders_('X', ['Audit ID'], ['Audit ID', 'Company_UID']);
  ModelCFoundationTest_assert_(missing.valid === false, 'missing header accepted');
  ModelCFoundationTest_assert_(missing.missing[0] === 'Company_UID', 'wrong missing header');
}

function ModelCFoundationTest_scopeExtraction_() {
  var headers = ['SCOPE_01', 'Duration SCOPE_01', 'SCOPE_02', 'Duration SCOPE_02'];
  var row = ['x', 5, '', ''];
  var catalog = {
    bySlot: {
      SCOPE_01: { scopeCode: 'MPS-ABC', displayName: 'MPS-ABC' },
      SCOPE_02: { scopeCode: 'MPS-GAP', displayName: 'MPS-GAP' }
    }
  };
  var selected = ModelCFoundation_selectedScopes_(headers, row, catalog);
  ModelCFoundationTest_assert_(selected.length === 1, 'selected scope count incorrect');
  ModelCFoundationTest_assert_(selected[0].scopeCode === 'MPS-ABC', 'scope code incorrect');
  ModelCFoundationTest_assert_(selected[0].formalHours === 5, 'formal hours incorrect');
}

function ModelCFoundationTest_rowAnalysis_() {
  var headers = ModelCFoundationTest_headers_();
  var row = ModelCFoundationTest_row_(headers, {
    Company: 'Example Grower',
    Company_UID: 'company-1',
    'Audit ID': 'AUD_1',
    SCOPE_02: 'x',
    'Duration SCOPE_02': 8,
    'Date - Will Expire': '2027-05-31',
    'Planning window from': '2027-03-01',
    'Planning window to': '2027-05-31'
  });
  var result = ModelCFoundation_analyzeRows_(headers, [row], ModelCFoundationTest_catalog_());
  ModelCFoundationTest_assert_(result.counts.proposedCompanyScopes === 1, 'company scope count incorrect');
  ModelCFoundationTest_assert_(result.counts.proposedObligations === 1, 'obligation count incorrect');
  ModelCFoundationTest_assert_(result.counts.proposedVisitLinks === 1, 'visit link count incorrect');
}

function ModelCFoundationTest_abcLifecycleDetection_() {
  var headers = ModelCFoundationTest_headers_();
  var row = ModelCFoundationTest_row_(headers, {
    Company: 'ABC Grower',
    Company_UID: 'company-abc',
    'Audit ID': 'AUD_ABC',
    SCOPE_01: 'x',
    'Duration SCOPE_01': 5,
    'Birthdate certificate': '2026-12-31',
    'Planning window from': '2026-01-01',
    'Planning window to': '2026-12-31'
  });
  var result = ModelCFoundation_analyzeRows_(headers, [row], ModelCFoundationTest_catalog_());
  ModelCFoundationTest_assert_(result.counts.abcOnlyRows === 1, 'ABC-only row not detected');
  ModelCFoundationTest_assert_(result.counts.abcRowsWithFakeCertificateLifecycle === 1, 'ABC fake lifecycle not detected');
  ModelCFoundationTest_assert_(result.obligationNaturalKeys[0].indexOf('|2026|ECAS') >= 0, 'ABC cycle/trigger key incorrect');
}

function ModelCFoundationTest_duplicateAuditId_() {
  var headers = ModelCFoundationTest_headers_();
  var row1 = ModelCFoundationTest_row_(headers, { Company: 'A', Company_UID: 'C1', 'Audit ID': 'AUD_DUP', SCOPE_02: 'x' });
  var row2 = ModelCFoundationTest_row_(headers, { Company: 'B', Company_UID: 'C2', 'Audit ID': 'AUD_DUP', SCOPE_02: 'x' });
  var result = ModelCFoundation_analyzeRows_(headers, [row1, row2], ModelCFoundationTest_catalog_());
  ModelCFoundationTest_assert_(result.counts.duplicateAuditIds === 1, 'duplicate Audit ID not detected');
}

function ModelCFoundationTest_migrationGates_() {
  var out = {
    counts: { rowsMissingCompanyUid: 0, rowsMissingAuditId: 2, duplicateAuditIds: 0 },
    samples: { unknownScopeSlot: [] },
    blockers: []
  };
  ModelCFoundation_applyMigrationGates_(out);
  ModelCFoundationTest_assert_(out.blockers.length === 1, 'missing Audit IDs must create one blocker');
  ModelCFoundationTest_assert_(out.blockers[0] === 'Audit planning rows missing Audit ID: 2', 'wrong Audit ID blocker');

  var clean = {
    counts: { rowsMissingCompanyUid: 0, rowsMissingAuditId: 0, duplicateAuditIds: 0 },
    samples: { unknownScopeSlot: [] },
    blockers: []
  };
  ModelCFoundation_applyMigrationGates_(clean);
  ModelCFoundationTest_assert_(clean.blockers.length === 0, 'clean readiness must remain unblocked');
}

function ModelCFoundationTest_headers_() {
  return [
    'Company', 'Company_UID', 'Audit ID', 'Status',
    'SCOPE_01', 'Duration SCOPE_01', 'SCOPE_02', 'Duration SCOPE_02',
    'Birthdate certificate', 'Preassigned Auditor', 'Date - Will Expire',
    'Extended Expiration Date', 'Allow self planning', 'Extension applied',
    'Planning window from', 'Planning window to'
  ];
}

function ModelCFoundationTest_row_(headers, values) {
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push('');
  Object.keys(values || {}).forEach(function(key) {
    var idx = headers.indexOf(key);
    if (idx >= 0) row[idx] = values[key];
  });
  return row;
}

function ModelCFoundationTest_catalog_() {
  return {
    bySlot: {
      SCOPE_01: { slotKey: 'SCOPE_01', scopeCode: 'MPS-ABC', displayName: 'MPS-ABC' },
      SCOPE_02: { slotKey: 'SCOPE_02', scopeCode: 'MPS-GAP', displayName: 'MPS-GAP' }
    },
    byCode: {},
    warnings: []
  };
}

function ModelCFoundationTest_assert_(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}
