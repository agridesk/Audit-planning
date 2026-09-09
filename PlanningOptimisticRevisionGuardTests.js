/***********************************************************************
 * PlanningOptimisticRevisionGuardTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_OPTIMISTIC_REVISION_GUARD_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_OPTIMISTIC_REVISION_GUARD_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_OPTIMISTIC_REVISION_GUARD_TESTS_R1';

function PORGTEST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function RUN_PLANNING_OPTIMISTIC_REVISION_GUARD_REGRESSION() {
  var results = [];

  var match = PORG_decide_('rev-17', 'rev-17');
  PORGTEST_assert_('matchingRevisionAccepted', match.accepted === true && match.conflict === false && match.reason === 'REVISION_MATCH', 'matching revisions', results);

  var mismatch = PORG_decide_('rev-17', 'rev-18');
  PORGTEST_assert_('mismatchRejected', mismatch.accepted === false && mismatch.conflict === true && mismatch.reason === 'REVISION_CONFLICT', 'revision conflict', results);

  var missingExpected = PORG_decide_('', 'rev-18');
  PORGTEST_assert_('missingExpectedFailsClosed', missingExpected.accepted === false && missingExpected.reason === 'EXPECTED_REVISION_REQUIRED', 'expected revision required', results);

  var missingCurrent = PORG_decide_('rev-17', '');
  PORGTEST_assert_('missingCurrentFailsClosed', missingCurrent.accepted === false && missingCurrent.reason === 'CURRENT_REVISION_REQUIRED', 'current revision required', results);

  var trimmed = PORG_decide_('  rev-17  ', 'rev-17');
  PORGTEST_assert_('revisionNormalized', trimmed.accepted === true && trimmed.expectedRevision === 'rev-17', 'trim normalization', results);

  var service = PlanningOptimisticRevisionGuard_evaluate({ auditId: 'AUD-1', expectedRevision: 'r1', currentRevision: 'r1' });
  PORGTEST_assert_('serviceSuccess', service.success === true && service.accepted === true, 'service result', results);
  PORGTEST_assert_('readOnly', service.meta.writes === false && service.meta.readOnly === true, 'read only', results);
  PORGTEST_assert_('zeroSheetReads', service.meta.zeroSheetReads === true, 'zero sheet reads', results);
  PORGTEST_assert_('zeroServiceReads', service.meta.zeroServiceReads === true, 'zero service reads', results);
  PORGTEST_assert_('revisionNotTruth', service.meta.revisionIsConcurrencyTokenOnly === true && service.meta.canonicalPlanningTruthUnchanged === true, 'revision governance', results);
  PORGTEST_assert_('lockRequired', service.meta.lockRequiredByFutureCommit === true && service.meta.lockOwner === 'Platform_withLock', 'canonical lock', results);
  PORGTEST_assert_('rereadUnderLock', service.meta.rereadCanonicalStateUnderLock === true, 'reread canonical state', results);
  PORGTEST_assert_('preflightStillRequired', service.meta.preflightRequiredAfterRevisionAcceptance === true, 'preflight mandatory', results);
  PORGTEST_assert_('conflictRequiresReload', service.meta.conflictRequiresReload === true, 'reload on conflict', results);
  PORGTEST_assert_('failClosed', service.meta.failClosed === true, 'fail closed', results);
  PORGTEST_assert_('platformLockAvailable', typeof Platform_withLock === 'function', 'Platform_withLock unavailable', results);
  PORGTEST_assert_('preflightAvailable', typeof PlanningCommitPreflightService_evaluate === 'function', 'PlanningCommitPreflightService unavailable', results);

  var passed = results.filter(function(x) { return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_OPTIMISTIC_REVISION_GUARD_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
    meta: {
      nonDestructive: true,
      livePlanningReadPerformed: false,
      liveLockAcquired: false,
      reason: 'Regression validates optimistic concurrency policy without reading or mutating canonical planning data.'
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
