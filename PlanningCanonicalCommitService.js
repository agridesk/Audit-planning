/***********************************************************************
 * PlanningCanonicalCommitService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_COMMIT_ORCHESTRATION_R1
 *
 * PURPOSE
 *   Atomic orchestration boundary for Workspace 2.0 planning Commit.
 *   This service does NOT become a second planning writer. It keeps one
 *   Platform lock around the new concurrency/preflight gate and then delegates
 *   the actual PLAN write to existing AuditPlanningEngine owner
 *   Planning_executeWrite_.
 *
 * ORDER UNDER ONE LOCK
 *   1. reread canonical revision + optimistic guard
 *   2. fresh canonical validator preflight
 *   3. fresh StatusMachine transition
 *   4. existing Planning_executeWrite_ owner performs Planning JSON/status/
 *      assignment/date + Availability synchronization
 *   5. derive returned post-write revision from the exact committed payload
 *
 * GOVERNANCE
 *   - AuditPlanningEngine remains PLAN/RESCHEDULE write owner.
 *   - StatusMachine remains transition owner.
 *   - Availability existing services remain reservation owner.
 *   - Revision is derived concurrency metadata only.
 *   - expectedRevision is mandatory for this new entrypoint.
 *   - Existing legacy planning entrypoints are untouched.
 ***********************************************************************/

var PLANNING_CANONICAL_COMMIT_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_COMMIT_ORCHESTRATION_R1';

function PCCS_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PCCS_dependencies_() {
  return {
    lock: typeof Platform_withLock === 'function',
    lockedGate: typeof PlanningCommitGateService_evaluateLocked_ === 'function',
    statusMachine: typeof Status_applyTransition_ === 'function',
    loadContext: typeof loadContext_ === 'function',
    findAudit: typeof findAudit_ === 'function',
    canonicalWriter: typeof Planning_executeWrite_ === 'function',
    revisionBuilder: typeof PRT_tokenFromSnapshot_ === 'function'
  };
}

function PCCS_assertDependencies_() {
  var d = PCCS_dependencies_();
  Object.keys(d).forEach(function(k) {
    if (!d[k]) throw new Error('PlanningCanonicalCommitService: dependency unavailable: ' + k);
  });
}

function PCCS_blocked_(input, gate, reason) {
  return {
    success: true,
    build: PLANNING_CANONICAL_COMMIT_BUILD,
    auditId: PCCS_clean_(input && input.auditId),
    committed: false,
    canCommit: false,
    reason: reason || (gate && gate.reason) || 'COMMIT_BLOCKED',
    gate: gate || null,
    writeResult: null,
    newRevision: '',
    meta: {
      lockUsed: true,
      oneLockThroughWriteBoundary: true,
      canonicalWriterCalled: false,
      canonicalWriter: 'AuditPlanningEngine.Planning_executeWrite_',
      statusOwner: 'StatusMachine',
      availabilityOwner: 'Existing AvailabilityService via AuditPlanningEngine',
      revisionRole: 'derived concurrency token only'
    }
  };
}

function PCCS_postWriteRevision_(writeResult) {
  if (!writeResult || writeResult.success !== true) return '';
  return PRT_tokenFromSnapshot_({
    auditId: PCCS_clean_(writeResult.auditId),
    status: PCCS_clean_(writeResult.newStatus || writeResult.afterStatusDisplay),
    assignedTo: PCCS_clean_(writeResult.assignedTo),
    datePlanned: PCCS_clean_(writeResult.plannedDate),
    planningJson: PCCS_clean_(writeResult.planningJson)
  });
}

function PlanningCanonicalCommitService_commit(input) {
  input = input || {};
  var auditId = PCCS_clean_(input.auditId);
  var expectedRevision = PCCS_clean_(input.expectedRevision);
  var actorRole = PCCS_clean_(input.actorRole || 'MANAGER').toUpperCase();

  if (!auditId) throw new Error('PlanningCanonicalCommitService: auditId is required');
  if (!expectedRevision) throw new Error('PlanningCanonicalCommitService: expectedRevision is required');
  if (!Array.isArray(input.blocks) || !input.blocks.length) throw new Error('PlanningCanonicalCommitService: blocks are required');
  PCCS_assertDependencies_();

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningCanonicalCommitService_commit', {
    auditId: auditId,
    blockCount: input.blocks.length,
    actorRole: actorRole
  }) : null;

  var lockWaitMs = Math.max(500, Math.min(10000, Number(input.lockWaitMs || 3000) || 3000));
  var result = Platform_withLock('planning-commit:' + auditId, function() {
    var gate = PlanningCommitGateService_evaluateLocked_({
      auditId: auditId,
      expectedRevision: expectedRevision,
      auditorEmail: input.auditorEmail,
      auditorName: input.auditorName,
      blocks: input.blocks,
      waiverAccepted: input.waiverAccepted === true
    }, perf);

    if (!gate || gate.canCommit !== true) {
      return PCCS_blocked_(input, gate, gate && gate.reason);
    }

    var ss = SpreadsheetApp.getActive();
    var sh = ss && ss.getSheetByName('Audit planning');
    if (!sh) return PCCS_blocked_(input, gate, "Sheet 'Audit planning' missing.");

    var ctx = loadContext_(sh);
    var rowInfo = findAudit_(ctx, auditId);
    if (!rowInfo) return PCCS_blocked_(input, gate, 'AUDIT_NOT_FOUND_AT_WRITE_BOUNDARY');

    var transition = Status_applyTransition_({
      status: rowInfo.status,
      action: 'PLAN',
      role: actorRole
    });
    if (!transition || !transition.ok) {
      return PCCS_blocked_(input, gate, 'STATUS_TRANSITION_BLOCKED');
    }

    if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'freshStatusTransition', {
      beforeStatus: rowInfo.status || '',
      afterStatus: transition.afterStatusDisplay || ''
    });

    var writeResult = Planning_executeWrite_(rowInfo, transition, {
      auditId: auditId,
      blocks: input.blocks,
      auditorName: input.auditorName || '',
      auditorEmail: input.auditorEmail || '',
      allowWeekend: input.allowWeekendOverride !== false,
      isReschedule: false
    });

    if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'canonicalWriteOwner', {
      success: writeResult && writeResult.success === true,
      writer: 'Planning_executeWrite_'
    });

    if (!writeResult || writeResult.success !== true) {
      return {
        success: false,
        build: PLANNING_CANONICAL_COMMIT_BUILD,
        auditId: auditId,
        committed: false,
        canCommit: true,
        reason: 'CANONICAL_WRITE_FAILED',
        gate: gate,
        writeResult: writeResult || null,
        newRevision: '',
        meta: {
          lockUsed: true,
          oneLockThroughWriteBoundary: true,
          canonicalWriterCalled: true,
          canonicalWriter: 'AuditPlanningEngine.Planning_executeWrite_'
        }
      };
    }

    var newRevision = PCCS_postWriteRevision_(writeResult);
    return {
      success: true,
      build: PLANNING_CANONICAL_COMMIT_BUILD,
      auditId: auditId,
      committed: true,
      canCommit: true,
      reason: 'COMMITTED',
      gate: gate,
      writeResult: writeResult,
      newRevision: newRevision,
      meta: {
        lockUsed: true,
        oneLockThroughWriteBoundary: true,
        canonicalWriterCalled: true,
        canonicalWriter: 'AuditPlanningEngine.Planning_executeWrite_',
        statusOwner: 'StatusMachine',
        availabilityOwner: 'Existing AvailabilityService via AuditPlanningEngine',
        revisionRole: 'derived concurrency token only',
        postWriteRevisionExtraRead: false,
        legacyEntrypointsChanged: false
      }
    };
  }, lockWaitMs);

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    committed: result && result.committed === true,
    reason: result && result.reason || '',
    canonicalWriterCalled: !!(result && result.meta && result.meta.canonicalWriterCalled)
  });
  return result;
}
