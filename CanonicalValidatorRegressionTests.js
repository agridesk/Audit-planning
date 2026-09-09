/***********************************************************************
 * CanonicalValidatorRegressionTests.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_REGRESSION_R1
 *
 * PURPOSE
 *   Permanent, non-destructive regression fixtures for the shared
 *   Canonical Validator contract and facade.
 *
 *   These tests do not write Sheets and do not create test data.
 *   They exercise pure contract behavior and precomputed-owner adapters,
 *   so they are safe to run in DEV.
 ***********************************************************************/

var CANONICAL_VALIDATOR_REGRESSION_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_REGRESSION_R1';

function CVR_assert_(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function CVR_eq_(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'Values differ') + ': expected=' + expected + ', actual=' + actual);
  }
}

function CVR_testContractLevels_() {
  var v1 = CanonicalValidator_ok(CanonicalValidatorKind.QUALIFICATION, 'Q_OK', 'ok');
  var v2 = CanonicalValidator_warning(CanonicalValidatorKind.ROTATION, 'R_WARN', 'warn');
  var v3 = CanonicalValidator_waiverRequired(CanonicalValidatorKind.ROTATION, 'R_WAIVER', 'waiver');
  var v4 = CanonicalValidator_hardBlock(CanonicalValidatorKind.AVAILABILITY, 'A_BLOCK', 'block');

  CVR_eq_(v1.level, 'OK', 'OK verdict');
  CVR_eq_(v2.level, 'WARNING', 'WARNING verdict');
  CVR_eq_(v3.level, 'WAIVER_REQUIRED', 'WAIVER_REQUIRED verdict');
  CVR_eq_(v4.level, 'HARD_BLOCK', 'HARD_BLOCK verdict');
  CVR_assert_(v3.waiverEligible === true, 'Waiver verdict must be waiver eligible');
  CVR_assert_(v4.waiverEligible === false, 'Hard block may not be waiver eligible');
}

function CVR_testAggregate_() {
  var aggregate = CanonicalValidator_aggregate([
    CanonicalValidator_ok(CanonicalValidatorKind.QUALIFICATION, 'Q_OK', 'ok'),
    CanonicalValidator_warning(CanonicalValidatorKind.ROTATION, 'R_WARN', 'warn'),
    CanonicalValidator_waiverRequired(CanonicalValidatorKind.ROTATION, 'R_WAIVER', 'waiver')
  ]);

  CVR_eq_(aggregate.overallLevel, 'WAIVER_REQUIRED', 'Aggregate worst level');
  CVR_assert_(aggregate.canCommitWithoutWaiver === false, 'Waiver aggregate must block normal commit');
  CVR_assert_(aggregate.canCommitWithWaiver === true, 'Waiver aggregate must permit governed waiver');
  CVR_eq_(aggregate.counts.warnings, 1, 'Warning count');
  CVR_eq_(aggregate.counts.waiversRequired, 1, 'Waiver count');
  CVR_eq_(aggregate.counts.hardBlocks, 0, 'Hard block count');
}

function CVR_baseContext_() {
  return {
    auditId: 'AUD_TEST_CANONICAL_VALIDATORS',
    auditorEmail: 'auditor@example.com',
    auditorName: 'Regression Auditor',
    company: 'Regression Company',
    requiredScopes: ['MPS-ABC'],
    blocks: [
      { date: '2026-09-15', start: '09:00', end: '17:00' }
    ],
    precomputed: {
      qualification: { success: true, message: 'qualified' },
      availability: { success: true, message: 'available' },
      planningWindow: {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        mode: 'INTERSECTION',
        activeScopes: ['MPS-ABC'],
        scopeWindows: [],
        warnings: []
      },
      rotation: {
        softBlockRotation: false,
        performedCount: 1,
        maxAllowed: 3,
        performedByScope: { 'MPS-ABC': 1 }
      }
    }
  };
}

function CVR_testAllOkWithPrecomputedOwnerResults_() {
  var res = CanonicalPlanningValidators_evaluate(CVR_baseContext_());
  CVR_eq_(res.overallLevel, 'OK', 'All-OK aggregate');
  CVR_assert_(res.canCommitWithoutWaiver === true, 'All-OK must permit normal commit');
  CVR_eq_(res.verdicts.length, 4, 'Expected four canonical verdicts');
}

function CVR_testQualificationHardBlock_() {
  var ctx = CVR_baseContext_();
  ctx.precomputed.qualification = { success: false, message: 'not qualified' };
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.overallLevel, 'HARD_BLOCK', 'Qualification failure must hard block');
  CVR_assert_(res.canCommitWithWaiver === false, 'Qualification hard block cannot be waived');
}

function CVR_testAvailabilityHardBlock_() {
  var ctx = CVR_baseContext_();
  ctx.precomputed.availability = { success: false, message: 'collision' };
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.overallLevel, 'HARD_BLOCK', 'Availability conflict must hard block');
}

function CVR_testPlanningWindowOutsideHardBlock_() {
  var ctx = CVR_baseContext_();
  ctx.blocks = [{ date: '2026-10-01', start: '09:00', end: '17:00' }];
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.overallLevel, 'HARD_BLOCK', 'Outside planning window must hard block');
  var found = false;
  for (var i = 0; i < res.verdicts.length; i++) {
    if (res.verdicts[i].ruleCode === 'PLANNING_WINDOW_OUTSIDE') found = true;
  }
  CVR_assert_(found, 'PLANNING_WINDOW_OUTSIDE verdict missing');
}

function CVR_testPlanningWindowSoftWarning_() {
  var ctx = CVR_baseContext_();
  ctx.precomputed.planningWindow.warnings = [
    { code: 'SCOPE_WINDOW_CONFLICT_EMPTY_INTERSECTION', severity: 'WARN', message: 'soft conflict' }
  ];
  ctx.precomputed.planningWindow.mode = 'UNION_FALLBACK';
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.overallLevel, 'WARNING', 'Planning-window soft warning must remain advisory');
  CVR_assert_(res.canCommitWithoutWaiver === true, 'WARNING must not block commit');
}

function CVR_testRotationSoftWarning_() {
  var ctx = CVR_baseContext_();
  ctx.precomputed.rotation.softBlockRotation = true;
  ctx.precomputed.rotation.performedCount = 3;
  ctx.precomputed.rotation.maxAllowed = 3;
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.overallLevel, 'WARNING', 'Current rotation limit remains warning in this gate');
  CVR_assert_(res.canCommitWithoutWaiver === true, 'Current rotation warning must not block commit');
}

function CVR_testExplicitInclude_() {
  var ctx = CVR_baseContext_();
  ctx.include = {
    qualification: true,
    availability: false,
    planningWindow: false,
    rotation: false
  };
  var res = CanonicalPlanningValidators_evaluate(ctx);
  CVR_eq_(res.verdicts.length, 1, 'Explicit include must limit validator set');
  CVR_eq_(res.verdicts[0].kind, 'QUALIFICATION', 'Qualification-only result');
}

function RUN_CANONICAL_VALIDATOR_REGRESSION() {
  var tests = [
    ['contractLevels', CVR_testContractLevels_],
    ['aggregate', CVR_testAggregate_],
    ['allOkPrecomputed', CVR_testAllOkWithPrecomputedOwnerResults_],
    ['qualificationHardBlock', CVR_testQualificationHardBlock_],
    ['availabilityHardBlock', CVR_testAvailabilityHardBlock_],
    ['planningWindowOutside', CVR_testPlanningWindowOutsideHardBlock_],
    ['planningWindowSoftWarning', CVR_testPlanningWindowSoftWarning_],
    ['rotationSoftWarning', CVR_testRotationSoftWarning_],
    ['explicitInclude', CVR_testExplicitInclude_]
  ];

  var results = [];
  var failed = 0;

  for (var i = 0; i < tests.length; i++) {
    var name = tests[i][0];
    var fn = tests[i][1];
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      failed++;
      results.push({ name: name, ok: false, error: String(e && e.message ? e.message : e) });
    }
  }

  var out = {
    ok: failed === 0,
    build: CANONICAL_VALIDATOR_REGRESSION_BUILD,
    total: tests.length,
    passed: tests.length - failed,
    failed: failed,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
