/***********************************************************************
 * PlanningCommitPreflightService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_PREFLIGHT_R1
 *
 * PURPOSE
 *   Read-only final validation boundary for one intended planning commit.
 *   This service does NOT save planning. It only asks the existing canonical
 *   planning validator gateway for a fresh verdict immediately before a
 *   later commit owner performs writes.
 *
 * GOVERNANCE
 *   - CanonicalPlanningValidators_evaluateAudit remains the validator owner.
 *   - No business rules are reimplemented here.
 *   - WARNING may commit without waiver.
 *   - WAIVER_REQUIRED requires an explicit accepted waiver before commit.
 *   - HARD_BLOCK can never commit.
 *   - No lifecycle, planning, availability or status writes.
 *   - This service is the read-only predecessor of a future canonical Commit.
 *
 * SPEED CONTRACT
 *   - One audit only; never a bulk planner loop.
 *   - One canonical validator gateway call.
 *   - No extra Sheet scans beyond the gateway/canonical owners.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var PLANNING_COMMIT_PREFLIGHT_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_COMMIT_PREFLIGHT_R1';

function PCP_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function PCP_blocks_(input) {
  var blocks = input && input.blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.map(function(b) {
    b = b || {};
    return {
      date: PCP_clean_(b.date),
      start: PCP_clean_(b.start || b.startTime),
      end: PCP_clean_(b.end || b.endTime),
      hours: Number(b.hours || 0) || 0
    };
  });
}

function PCP_decisionFromAggregate_(aggregate, waiverAccepted) {
  aggregate = aggregate || {};
  var level = PCP_clean_(aggregate.overallLevel).toUpperCase() || 'HARD_BLOCK';
  var decision = {
    level: level,
    canCommit: false,
    requiresWaiver: false,
    waiverAccepted: waiverAccepted === true,
    reason: ''
  };

  if (level === 'HARD_BLOCK') {
    decision.reason = 'HARD_BLOCK';
    return decision;
  }

  if (level === 'WAIVER_REQUIRED') {
    decision.requiresWaiver = true;
    decision.canCommit = waiverAccepted === true && aggregate.canCommitWithWaiver === true;
    decision.reason = decision.canCommit ? 'WAIVER_ACCEPTED' : 'WAIVER_REQUIRED';
    return decision;
  }

  if (level === 'WARNING' || level === 'OK') {
    decision.canCommit = aggregate.canCommitWithoutWaiver !== false;
    decision.reason = level;
    return decision;
  }

  decision.reason = 'UNKNOWN_VERDICT_LEVEL';
  return decision;
}

function PlanningCommitPreflightService_evaluate(input) {
  input = input || {};
  var auditId = PCP_clean_(input.auditId);
  var auditorEmail = PCP_clean_(input.auditorEmail).toLowerCase();
  var auditorName = PCP_clean_(input.auditorName);
  var blocks = PCP_blocks_(input);
  var waiverAccepted = input.waiverAccepted === true;

  if (!auditId) throw new Error('PlanningCommitPreflightService: auditId is required');
  if (!auditorEmail) throw new Error('PlanningCommitPreflightService: auditorEmail is required');
  if (!blocks.length) throw new Error('PlanningCommitPreflightService: at least one planning block is required');
  if (typeof CanonicalPlanningValidators_evaluateAudit !== 'function') {
    throw new Error('PlanningCommitPreflightService: CanonicalPlanningValidators_evaluateAudit unavailable');
  }

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('PlanningCommitPreflightService_evaluate', {
    auditId: auditId,
    auditorEmail: auditorEmail,
    blockCount: blocks.length,
    waiverAccepted: waiverAccepted
  }) : null;

  var aggregate = CanonicalPlanningValidators_evaluateAudit({
    auditId: auditId,
    auditorEmail: auditorEmail,
    auditorName: auditorName,
    blocks: blocks,
    include: {
      qualification: true,
      availability: true,
      planningWindow: true,
      rotation: true
    }
  });

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'canonicalValidation', {
    overallLevel: aggregate && aggregate.overallLevel || '',
    verdicts: aggregate && aggregate.verdicts ? aggregate.verdicts.length : 0,
    hardBlocks: aggregate && aggregate.counts ? aggregate.counts.hardBlocks || 0 : 0,
    waiversRequired: aggregate && aggregate.counts ? aggregate.counts.waiversRequired || 0 : 0,
    warnings: aggregate && aggregate.counts ? aggregate.counts.warnings || 0 : 0
  });

  var decision = PCP_decisionFromAggregate_(aggregate, waiverAccepted);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'commitDecision', {
    level: decision.level,
    canCommit: decision.canCommit,
    requiresWaiver: decision.requiresWaiver,
    waiverAccepted: decision.waiverAccepted
  });

  var result = {
    success: true,
    build: PLANNING_COMMIT_PREFLIGHT_BUILD,
    auditId: auditId,
    auditorEmail: auditorEmail,
    auditorName: auditorName,
    blocks: blocks,
    canCommit: decision.canCommit,
    requiresWaiver: decision.requiresWaiver,
    waiverAccepted: decision.waiverAccepted,
    decisionReason: decision.reason,
    overallLevel: decision.level,
    validatorResult: aggregate,
    meta: {
      writes: false,
      readOnly: true,
      singleAuditOnly: true,
      canonicalRevalidationPerformed: true,
      canonicalOwner: 'CanonicalPlanningValidators_evaluateAudit',
      hardBlockNeverCommit: true,
      waiverMustBeExplicit: true,
      warningMayCommit: true,
      futureCommitMustNotReuseStaleAdvisoryVerdict: true
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    overallLevel: decision.level,
    canCommit: decision.canCommit,
    requiresWaiver: decision.requiresWaiver
  });
  return result;
}
