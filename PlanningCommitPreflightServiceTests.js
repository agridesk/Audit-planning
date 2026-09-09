/***********************************************************************
 * PlanningCommitPreflightServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_PREFLIGHT_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_COMMIT_PREFLIGHT_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_PREFLIGHT_TESTS_R1';

function PCPTEST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function PCPTEST_aggregate_(level, opts) {
  opts = opts || {};
  return {
    overallLevel: level,
    canCommitWithoutWaiver: opts.canCommitWithoutWaiver !== false,
    canCommitWithWaiver: opts.canCommitWithWaiver !== false,
    verdicts: [],
    counts: {
      total: Number(opts.total || 0) || 0,
      warnings: Number(opts.warnings || 0) || 0,
      waiversRequired: Number(opts.waiversRequired || 0) || 0,
      hardBlocks: Number(opts.hardBlocks || 0) || 0
    }
  };
}

function RUN_PLANNING_COMMIT_PREFLIGHT_REGRESSION() {
  var results = [];

  var ok = PCP_decisionFromAggregate_(PCPTEST_aggregate_('OK'), false);
  PCPTEST_assert_('okCanCommit', ok.canCommit === true && ok.requiresWaiver === false, 'OK decision', results);

  var warning = PCP_decisionFromAggregate_(PCPTEST_aggregate_('WARNING', { warnings: 1 }), false);
  PCPTEST_assert_('warningCanCommit', warning.canCommit === true && warning.requiresWaiver === false, 'WARNING decision', results);

  var waiverNo = PCP_decisionFromAggregate_(PCPTEST_aggregate_('WAIVER_REQUIRED', { canCommitWithoutWaiver: false, canCommitWithWaiver: true, waiversRequired: 1 }), false);
  PCPTEST_assert_('waiverBlocksWithoutAcceptance', waiverNo.canCommit === false && waiverNo.requiresWaiver === true, 'waiver without acceptance', results);

  var waiverYes = PCP_decisionFromAggregate_(PCPTEST_aggregate_('WAIVER_REQUIRED', { canCommitWithoutWaiver: false, canCommitWithWaiver: true, waiversRequired: 1 }), true);
  PCPTEST_assert_('waiverAllowsExplicitAcceptance', waiverYes.canCommit === true && waiverYes.requiresWaiver === true && waiverYes.reason === 'WAIVER_ACCEPTED', 'waiver accepted', results);

  var hard = PCP_decisionFromAggregate_(PCPTEST_aggregate_('HARD_BLOCK', { canCommitWithoutWaiver: false, canCommitWithWaiver: false, hardBlocks: 1 }), true);
  PCPTEST_assert_('hardBlockNeverCommits', hard.canCommit === false && hard.requiresWaiver === false, 'hard block', results);

  var unknown = PCP_decisionFromAggregate_({}, false);
  PCPTEST_assert_('unknownFailsClosed', unknown.canCommit === false && unknown.level === 'HARD_BLOCK', 'fail closed', results);

  var blocks = PCP_blocks_({ blocks: [
    { date: '2026-09-10', startTime: '08:00', endTime: '12:00', hours: 4 },
    { date: '2026-09-11', start: '09:00', end: '11:30', hours: 2.5 }
  ]});
  PCPTEST_assert_('blocksNormalized', blocks.length === 2 && blocks[0].start === '08:00' && blocks[1].end === '11:30', 'block normalization', results);

  var noBlocks = PCP_blocks_({ blocks: null });
  PCPTEST_assert_('missingBlocksNormalizeEmpty', Array.isArray(noBlocks) && noBlocks.length === 0, 'missing blocks', results);

  PCPTEST_assert_('serviceFunctionPresent', typeof PlanningCommitPreflightService_evaluate === 'function', 'service available', results);
  PCPTEST_assert_('gatewayPresent', typeof CanonicalPlanningValidators_evaluateAudit === 'function', 'canonical gateway available', results);

  var passed = results.filter(function(x) { return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_COMMIT_PREFLIGHT_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
    meta: {
      nonDestructive: true,
      liveCanonicalEvaluationPerformed: false,
      reason: 'Permanent regression validates boundary policy without mutating or depending on current planning data.'
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
