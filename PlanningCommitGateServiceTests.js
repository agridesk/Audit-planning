/***********************************************************************
 * PlanningCommitGateServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_GATE_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_COMMIT_GATE_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_GATE_TESTS_R1';

function PCGTEST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name:name, ok:ok, detail:ok ? '' : String(detail || 'failed') });
}

function PCGTEST_guard_(accepted, conflict, reason) {
  return { accepted:accepted === true, conflict:conflict === true, reason:reason || '' };
}

function PCGTEST_preflight_(canCommit, reason) {
  return { canCommit:canCommit === true, decisionReason:reason || '', overallLevel:canCommit ? 'OK' : 'HARD_BLOCK' };
}

function RUN_PLANNING_COMMIT_GATE_REGRESSION() {
  var results = [];

  var revisionRead = { revision:'PRT1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
  var conflict = PCG_conflictResult_('AUD-1','PRT1-old',revisionRead,PCGTEST_guard_(false,true,'REVISION_CONFLICT'));
  PCGTEST_assert_('conflictBlocksCommit', conflict.canCommit === false && conflict.revisionAccepted === false, 'conflict should block', results);
  PCGTEST_assert_('conflictSkipsPreflight', conflict.preflight === null && conflict.meta.preflightSkippedOnConflict === true && conflict.meta.canonicalPreflightPerformed === false, 'preflight should be skipped', results);
  PCGTEST_assert_('conflictFastPath', conflict.meta.conflictFastPath === true, 'conflict fast path', results);
  PCGTEST_assert_('conflictNoWrites', conflict.meta.writes === false && conflict.meta.futureWriteAllowed === false, 'no writes', results);

  var accepted = PCG_successResult_('AUD-1',revisionRead.revision,revisionRead,PCGTEST_guard_(true,false,'REVISION_MATCH'),PCGTEST_preflight_(true,'OK'));
  PCGTEST_assert_('acceptedGateCanCommit', accepted.canCommit === true && accepted.reason === 'GATE_ACCEPTED', 'accepted gate', results);
  PCGTEST_assert_('acceptedRequiresBothGates', accepted.revisionAccepted === true && accepted.preflight.canCommit === true, 'both gates', results);
  PCGTEST_assert_('acceptedFutureWriteAllowed', accepted.meta.futureWriteAllowed === true, 'future write allowed', results);
  PCGTEST_assert_('acceptedPreflightPerformed', accepted.meta.canonicalPreflightPerformed === true && accepted.meta.conflictFastPath === false, 'preflight performed', results);

  var blockedPreflight = PCG_successResult_('AUD-1',revisionRead.revision,revisionRead,PCGTEST_guard_(true,false,'REVISION_MATCH'),PCGTEST_preflight_(false,'HARD_BLOCK'));
  PCGTEST_assert_('preflightBlockStopsCommit', blockedPreflight.canCommit === false && blockedPreflight.reason === 'HARD_BLOCK', 'preflight should block', results);
  PCGTEST_assert_('revisionMatchAloneInsufficient', blockedPreflight.revisionAccepted === true && blockedPreflight.meta.futureWriteAllowed === false, 'revision alone insufficient', results);

  var deps = PCG_requiredFunctions_();
  PCGTEST_assert_('platformLockAvailable', deps.lock === true, 'Platform_withLock unavailable', results);
  PCGTEST_assert_('revisionServiceAvailable', deps.revision === true, 'revision service unavailable', results);
  PCGTEST_assert_('revisionGuardAvailable', deps.guard === true, 'revision guard unavailable', results);
  PCGTEST_assert_('preflightAvailable', deps.preflight === true, 'preflight unavailable', results);
  PCGTEST_assert_('serviceFunctionPresent', typeof PlanningCommitGateService_evaluate === 'function', 'service unavailable', results);

  PCGTEST_assert_('canonicalPlanningOwner', accepted.meta.canonicalPlanningOwner === 'Audit planning', 'canonical owner', results);
  PCGTEST_assert_('revisionDerivedOnly', accepted.meta.revisionRole === 'derived concurrency token only', 'revision role', results);
  PCGTEST_assert_('readOnlyBoundary', accepted.meta.writes === false && accepted.meta.readOnly === true, 'read only', results);

  var passed = results.filter(function(x) { return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_COMMIT_GATE_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    results: results,
    meta: {
      nonDestructive: true,
      liveCanonicalEvaluationPerformed: false,
      liveLockAcquired: false,
      liveWritesPerformed: false,
      reason: 'Regression validates orchestration policy without acquiring a live lock or mutating canonical planning data.'
    }
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
