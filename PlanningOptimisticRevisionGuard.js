/***********************************************************************
 * PlanningOptimisticRevisionGuard.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_OPTIMISTIC_REVISION_GUARD_R1
 *
 * PURPOSE
 *   Pure optimistic-concurrency boundary for a future canonical planning
 *   Commit. A caller supplies the revision it originally loaded and the
 *   revision observed immediately before commit under the canonical lock.
 *
 * GOVERNANCE
 *   - This service owns NO planning truth and performs NO writes.
 *   - Revision is a concurrency token, never a second SSoT.
 *   - Future Commit must acquire Platform_withLock first, reread canonical
 *     planning state, derive its current revision, then call this guard.
 *   - A mismatch fails closed and requires the caller to reload/reconcile.
 *   - Missing expected/current revisions fail closed.
 *   - Preflight validation remains mandatory after revision acceptance.
 *
 * SPEED CONTRACT
 *   - Pure in-memory comparison.
 *   - Zero Sheet reads, zero RPC/service reads, zero writes.
 *   - Suitable for one-audit Commit hot path.
 ***********************************************************************/

var PLANNING_OPTIMISTIC_REVISION_GUARD_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_OPTIMISTIC_REVISION_GUARD_R1';

function PORG_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PORG_decide_(expectedRevision, currentRevision) {
  var expected = PORG_clean_(expectedRevision);
  var current = PORG_clean_(currentRevision);

  if (!expected) {
    return {
      accepted: false,
      conflict: false,
      reason: 'EXPECTED_REVISION_REQUIRED',
      expectedRevision: '',
      currentRevision: current
    };
  }

  if (!current) {
    return {
      accepted: false,
      conflict: false,
      reason: 'CURRENT_REVISION_REQUIRED',
      expectedRevision: expected,
      currentRevision: ''
    };
  }

  if (expected !== current) {
    return {
      accepted: false,
      conflict: true,
      reason: 'REVISION_CONFLICT',
      expectedRevision: expected,
      currentRevision: current
    };
  }

  return {
    accepted: true,
    conflict: false,
    reason: 'REVISION_MATCH',
    expectedRevision: expected,
    currentRevision: current
  };
}

function PlanningOptimisticRevisionGuard_evaluate(input) {
  input = input || {};
  var decision = PORG_decide_(input.expectedRevision, input.currentRevision);

  return {
    success: true,
    build: PLANNING_OPTIMISTIC_REVISION_GUARD_BUILD,
    auditId: PORG_clean_(input.auditId),
    accepted: decision.accepted,
    conflict: decision.conflict,
    reason: decision.reason,
    expectedRevision: decision.expectedRevision,
    currentRevision: decision.currentRevision,
    meta: {
      writes: false,
      readOnly: true,
      pureComparison: true,
      zeroSheetReads: true,
      zeroServiceReads: true,
      revisionIsConcurrencyTokenOnly: true,
      canonicalPlanningTruthUnchanged: true,
      lockRequiredByFutureCommit: true,
      lockOwner: 'Platform_withLock',
      rereadCanonicalStateUnderLock: true,
      preflightRequiredAfterRevisionAcceptance: true,
      conflictRequiresReload: true,
      failClosed: true
    }
  };
}
