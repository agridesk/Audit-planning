/***********************************************************************
 * PlanningCommitGateService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_GATE_R2_LOCKED_CORE
 *
 * PURPOSE
 *   Read-only orchestration boundary immediately before canonical planning
 *   writes. It supports both:
 *     - public standalone evaluation that acquires Platform_withLock; and
 *     - an internal locked core for the canonical write owner, so validation
 *       and write can execute under ONE lock without a nested-lock race.
 *
 * REQUIRED ORDER
 *   1. fresh canonical revision reread
 *   2. optimistic revision guard
 *   3. fresh canonical planning preflight
 *   4. caller may write only when gate.canCommit === true
 *
 * GOVERNANCE
 *   - Performs NO planning/lifecycle/availability/status writes.
 *   - Audit planning remains the planning SSoT.
 *   - Revision token is concurrency metadata only.
 *   - On revision conflict, canonical preflight is skipped.
 *   - On matching revision, fresh preflight is mandatory.
 *   - Future/canonical write owner must keep the same lock through write.
 *
 * SPEED CONTRACT
 *   - Single audit only.
 *   - Conflict fast-path avoids validator work.
 *   - No nested lock when caller already owns Platform_withLock.
 *   - DEV-only timing; no telemetry sheet writes.
 ***********************************************************************/

var PLANNING_COMMIT_GATE_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_GATE_R2_LOCKED_CORE';

function PCG_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PCG_requiredFunctions_() {
  return {
    lock: typeof Platform_withLock === 'function',
    revision: typeof PlanningRevisionTokenService_get === 'function',
    guard: typeof PlanningOptimisticRevisionGuard_evaluate === 'function',
    preflight: typeof PlanningCommitPreflightService_evaluate === 'function'
  };
}

function PCG_assertDependencies_() {
  var f = PCG_requiredFunctions_();
  if (!f.lock) throw new Error('PlanningCommitGateService: Platform_withLock unavailable');
  if (!f.revision) throw new Error('PlanningCommitGateService: PlanningRevisionTokenService_get unavailable');
  if (!f.guard) throw new Error('PlanningCommitGateService: PlanningOptimisticRevisionGuard_evaluate unavailable');
  if (!f.preflight) throw new Error('PlanningCommitGateService: PlanningCommitPreflightService_evaluate unavailable');
}

function PCG_conflictResult_(auditId, expectedRevision, revisionRead, guard, lockMode) {
  return {
    success: true,
    build: PLANNING_COMMIT_GATE_BUILD,
    auditId: auditId,
    canCommit: false,
    reason: guard && guard.reason || 'REVISION_CONFLICT',
    revisionAccepted: false,
    currentRevision: revisionRead && revisionRead.revision || '',
    expectedRevision: expectedRevision,
    revision: revisionRead || null,
    revisionGuard: guard || null,
    preflight: null,
    meta: {
      writes: false,
      readOnly: true,
      lockUsed: true,
      lockMode: lockMode || 'CALLER_OWNED',
      conflictFastPath: true,
      preflightSkippedOnConflict: true,
      canonicalPreflightPerformed: false,
      futureWriteAllowed: false,
      canonicalPlanningOwner: 'Audit planning',
      revisionRole: 'derived concurrency token only'
    }
  };
}

function PCG_successResult_(auditId, expectedRevision, revisionRead, guard, preflight, lockMode) {
  var canCommit = !!(guard && guard.accepted === true && preflight && preflight.canCommit === true);
  return {
    success: true,
    build: PLANNING_COMMIT_GATE_BUILD,
    auditId: auditId,
    canCommit: canCommit,
    reason: canCommit ? 'GATE_ACCEPTED' : (preflight && preflight.decisionReason || 'PREFLIGHT_BLOCKED'),
    revisionAccepted: !!(guard && guard.accepted === true),
    currentRevision: revisionRead && revisionRead.revision || '',
    expectedRevision: expectedRevision,
    revision: revisionRead || null,
    revisionGuard: guard || null,
    preflight: preflight || null,
    meta: {
      writes: false,
      readOnly: true,
      lockUsed: true,
      lockMode: lockMode || 'CALLER_OWNED',
      conflictFastPath: false,
      preflightSkippedOnConflict: false,
      canonicalPreflightPerformed: true,
      futureWriteAllowed: canCommit,
      canonicalPlanningOwner: 'Audit planning',
      revisionRole: 'derived concurrency token only'
    }
  };
}

/**
 * INTERNAL LOCKED CORE.
 * Caller MUST already own Platform_withLock and retain it through the write.
 */
function PlanningCommitGateService_evaluateLocked_(input, perf) {
  input = input || {};
  var auditId = PCG_clean_(input.auditId);
  var expectedRevision = PCG_clean_(input.expectedRevision);
  if (!auditId) throw new Error('PlanningCommitGateService: auditId is required');
  if (!expectedRevision) throw new Error('PlanningCommitGateService: expectedRevision is required');
  PCG_assertDependencies_();

  var revisionRead = PlanningRevisionTokenService_get({ auditId: auditId });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'revisionReread', {
    revisionPrefix: PCG_clean_(revisionRead && revisionRead.revision).substring(0, 9)
  });

  var guard = PlanningOptimisticRevisionGuard_evaluate({
    auditId: auditId,
    expectedRevision: expectedRevision,
    currentRevision: revisionRead && revisionRead.revision
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'revisionGuard', {
    accepted: guard && guard.accepted === true,
    conflict: guard && guard.conflict === true,
    reason: guard && guard.reason || ''
  });

  if (!guard || guard.accepted !== true) {
    return PCG_conflictResult_(auditId, expectedRevision, revisionRead, guard, 'CALLER_OWNED');
  }

  var preflight = PlanningCommitPreflightService_evaluate({
    auditId: auditId,
    auditorEmail: input.auditorEmail,
    auditorName: input.auditorName,
    blocks: input.blocks,
    waiverAccepted: input.waiverAccepted === true
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'canonicalPreflight', {
    canCommit: preflight && preflight.canCommit === true,
    overallLevel: preflight && preflight.overallLevel || '',
    reason: preflight && preflight.decisionReason || ''
  });

  return PCG_successResult_(auditId, expectedRevision, revisionRead, guard, preflight, 'CALLER_OWNED');
}

function PlanningCommitGateService_evaluate(input) {
  input = input || {};
  var auditId = PCG_clean_(input.auditId);
  var expectedRevision = PCG_clean_(input.expectedRevision);
  if (!auditId) throw new Error('PlanningCommitGateService: auditId is required');
  if (!expectedRevision) throw new Error('PlanningCommitGateService: expectedRevision is required');
  PCG_assertDependencies_();

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningCommitGateService_evaluate', {
    auditId: auditId,
    blockCount: Array.isArray(input.blocks) ? input.blocks.length : 0
  }) : null;

  var lockWaitMs = Math.max(500, Math.min(10000, Number(input.lockWaitMs || 3000) || 3000));
  var result = Platform_withLock('planning-commit:' + auditId, function() {
    var locked = PlanningCommitGateService_evaluateLocked_(input, perf);
    if (locked && locked.meta) locked.meta.lockMode = 'SERVICE_OWNED';
    return locked;
  }, lockWaitMs);

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    canCommit: result && result.canCommit === true,
    reason: result && result.reason || '',
    conflictFastPath: !!(result && result.meta && result.meta.conflictFastPath)
  });
  return result;
}
