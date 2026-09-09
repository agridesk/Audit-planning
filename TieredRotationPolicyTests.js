/***********************************************************************
 * TieredRotationPolicyTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_TIERED_ROTATION_TESTS_R1
 *
 * Non-destructive policy regression tests. No sheets are written.
 ***********************************************************************/

var TIERED_ROTATION_TEST_BUILD = '2026-09-09_ROADMAP_2_4_TIERED_ROTATION_TESTS_R1';

function TRPT_assert_(name, condition, detail) {
  return { name: name, ok: !!condition, detail: condition ? '' : String(detail || 'assertion failed') };
}

function RUN_TIERED_ROTATION_POLICY_REGRESSION() {
  var tests = [];

  function eval_(performed, max) {
    return TieredRotationPolicy_evaluate({
      auditId: 'TEST_AUDIT',
      companyUid: 'TEST_COMPANY',
      company: 'Test Company',
      scope: 'TEST_SCOPE',
      auditorEmail: 'auditor@example.com',
      performedCount: performed,
      maxAllowed: max
    });
  }

  var v0 = eval_(0, 3);
  tests.push(TRPT_assert_('zeroIsOk', v0.level === 'OK', v0.level));

  var v1 = eval_(1, 3);
  tests.push(TRPT_assert_('belowNearLimitIsOk', v1.level === 'OK', v1.level));

  var v2 = eval_(2, 3);
  tests.push(TRPT_assert_('nearLimitWarning', v2.level === 'WARNING' && v2.ruleCode === 'ROTATION_NEAR_LIMIT', v2.level + '/' + v2.ruleCode));

  var v3 = eval_(3, 3);
  tests.push(TRPT_assert_('fourthRequiresWaiver', v3.level === 'WAIVER_REQUIRED' && v3.waiverEligible === true, v3.level));

  var v4 = eval_(4, 3);
  tests.push(TRPT_assert_('fifthHardBlocked', v4.level === 'HARD_BLOCK' && v4.waiverEligible === false, v4.level));

  var v5 = eval_(5, 3);
  tests.push(TRPT_assert_('beyondFifthHardBlocked', v5.level === 'HARD_BLOCK', v5.level));

  var noMax = eval_(8, null);
  tests.push(TRPT_assert_('noMaximumConfiguredIsOk', noMax.level === 'OK' && noMax.ruleCode === 'ROTATION_NO_MAXIMUM', noMax.level + '/' + noMax.ruleCode));

  var agg = TieredRotationPolicy_evaluateScopes({
    auditId: 'TEST_AUDIT',
    auditorEmail: 'auditor@example.com',
    scopes: ['S1', 'S2'],
    performedByScope: { S1: 1, S2: 3 },
    maxByScope: { S1: 3, S2: 3 }
  });
  tests.push(TRPT_assert_('multiScopeWorstWins', agg.overallLevel === 'WAIVER_REQUIRED' && agg.verdicts.length === 2, agg.overallLevel));

  var maxOne = eval_(0, 1);
  tests.push(TRPT_assert_('maxOneNearLimitWarning', maxOne.level === 'WARNING', maxOne.level));

  var failed = tests.filter(function(t){ return !t.ok; });
  var out = {
    ok: failed.length === 0,
    build: TIERED_ROTATION_TEST_BUILD,
    total: tests.length,
    passed: tests.length - failed.length,
    failed: failed.length,
    results: tests
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
