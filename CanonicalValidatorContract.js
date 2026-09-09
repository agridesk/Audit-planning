/***********************************************************************
 * CanonicalValidatorContract.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_CONTRACT_R1
 *
 * PURPOSE
 *   One shared verdict contract for planning validators.
 *
 *   This file deliberately contains NO qualification, availability,
 *   planning-window or rotation business rules. Existing canonical owners
 *   keep deciding those rules. This module only normalizes their outcomes
 *   so current planning, Planning Demand, Concept Planning, self-planning
 *   and future batch Commit can consume one stable DTO.
 *
 * GOVERNANCE
 *   Verdict levels:
 *     OK | WARNING | WAIVER_REQUIRED | HARD_BLOCK
 *
 *   UI reads; backend decides.
 *   Cache never owns a verdict.
 *   No second validator implementation is allowed in this module.
 ***********************************************************************/

var CANONICAL_VALIDATOR_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_CONTRACT_R1';

var CanonicalValidatorVerdict = Object.freeze({
  OK: 'OK',
  WARNING: 'WARNING',
  WAIVER_REQUIRED: 'WAIVER_REQUIRED',
  HARD_BLOCK: 'HARD_BLOCK'
});

var CanonicalValidatorKind = Object.freeze({
  QUALIFICATION: 'QUALIFICATION',
  AVAILABILITY: 'AVAILABILITY',
  PLANNING_WINDOW: 'PLANNING_WINDOW',
  ROTATION: 'ROTATION'
});

function CV_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CV_level_(level) {
  var v = CV_clean_(level).toUpperCase();
  if (v === CanonicalValidatorVerdict.OK ||
      v === CanonicalValidatorVerdict.WARNING ||
      v === CanonicalValidatorVerdict.WAIVER_REQUIRED ||
      v === CanonicalValidatorVerdict.HARD_BLOCK) {
    return v;
  }
  throw new Error('CanonicalValidatorContract: invalid verdict level: ' + level);
}

function CV_kind_(kind) {
  var v = CV_clean_(kind).toUpperCase();
  if (v === CanonicalValidatorKind.QUALIFICATION ||
      v === CanonicalValidatorKind.AVAILABILITY ||
      v === CanonicalValidatorKind.PLANNING_WINDOW ||
      v === CanonicalValidatorKind.ROTATION) {
    return v;
  }
  throw new Error('CanonicalValidatorContract: invalid validator kind: ' + kind);
}

function CV_isoNow_() {
  return new Date().toISOString();
}

/**
 * Stable public verdict DTO.
 *
 * Required:
 *   kind, level, ruleCode
 *
 * Optional context is copied only from explicit input. The contract does
 * not infer policy or business meaning.
 */
function CanonicalValidator_makeVerdict(input) {
  input = input || {};

  var out = {
    kind: CV_kind_(input.kind),
    level: CV_level_(input.level),
    ruleCode: CV_clean_(input.ruleCode),
    reason: CV_clean_(input.reason),
    evaluatedAt: CV_clean_(input.evaluatedAt) || CV_isoNow_(),
    policyVersion: CV_clean_(input.policyVersion),
    waiverEligible: input.waiverEligible === true,
    evidence: input.evidence == null ? null : input.evidence,
    subject: input.subject == null ? null : input.subject,
    source: CV_clean_(input.source),
    build: CANONICAL_VALIDATOR_BUILD
  };

  if (!out.ruleCode) {
    throw new Error('CanonicalValidatorContract: ruleCode is required');
  }

  if (out.level === CanonicalValidatorVerdict.WAIVER_REQUIRED && !out.waiverEligible) {
    throw new Error('CanonicalValidatorContract: WAIVER_REQUIRED must be waiverEligible');
  }

  if (out.level === CanonicalValidatorVerdict.HARD_BLOCK) {
    out.waiverEligible = false;
  }

  return out;
}

function CanonicalValidator_ok(kind, ruleCode, reason, extra) {
  extra = extra || {};
  extra.kind = kind;
  extra.level = CanonicalValidatorVerdict.OK;
  extra.ruleCode = ruleCode;
  extra.reason = reason || 'OK';
  return CanonicalValidator_makeVerdict(extra);
}

function CanonicalValidator_warning(kind, ruleCode, reason, extra) {
  extra = extra || {};
  extra.kind = kind;
  extra.level = CanonicalValidatorVerdict.WARNING;
  extra.ruleCode = ruleCode;
  extra.reason = reason || 'Warning';
  return CanonicalValidator_makeVerdict(extra);
}

function CanonicalValidator_waiverRequired(kind, ruleCode, reason, extra) {
  extra = extra || {};
  extra.kind = kind;
  extra.level = CanonicalValidatorVerdict.WAIVER_REQUIRED;
  extra.ruleCode = ruleCode;
  extra.reason = reason || 'Waiver required';
  extra.waiverEligible = true;
  return CanonicalValidator_makeVerdict(extra);
}

function CanonicalValidator_hardBlock(kind, ruleCode, reason, extra) {
  extra = extra || {};
  extra.kind = kind;
  extra.level = CanonicalValidatorVerdict.HARD_BLOCK;
  extra.ruleCode = ruleCode;
  extra.reason = reason || 'Hard block';
  extra.waiverEligible = false;
  return CanonicalValidator_makeVerdict(extra);
}

function CV_rank_(level) {
  switch (CV_level_(level)) {
    case CanonicalValidatorVerdict.OK: return 0;
    case CanonicalValidatorVerdict.WARNING: return 1;
    case CanonicalValidatorVerdict.WAIVER_REQUIRED: return 2;
    case CanonicalValidatorVerdict.HARD_BLOCK: return 3;
    default: return 3;
  }
}

/**
 * Aggregates already-computed canonical verdicts. It does not re-evaluate
 * business rules. The highest severity becomes overallLevel.
 */
function CanonicalValidator_aggregate(verdicts) {
  verdicts = Array.isArray(verdicts) ? verdicts : [];

  var normalized = [];
  var worst = CanonicalValidatorVerdict.OK;
  var hardBlocks = 0;
  var waivers = 0;
  var warnings = 0;

  for (var i = 0; i < verdicts.length; i++) {
    var v = verdicts[i];
    if (!v) continue;
    var n = CanonicalValidator_makeVerdict(v);
    normalized.push(n);

    if (CV_rank_(n.level) > CV_rank_(worst)) worst = n.level;
    if (n.level === CanonicalValidatorVerdict.HARD_BLOCK) hardBlocks++;
    else if (n.level === CanonicalValidatorVerdict.WAIVER_REQUIRED) waivers++;
    else if (n.level === CanonicalValidatorVerdict.WARNING) warnings++;
  }

  return {
    ok: hardBlocks === 0 && waivers === 0,
    canCommitWithoutWaiver: hardBlocks === 0 && waivers === 0,
    canCommitWithWaiver: hardBlocks === 0,
    overallLevel: worst,
    verdicts: normalized,
    counts: {
      total: normalized.length,
      warnings: warnings,
      waiversRequired: waivers,
      hardBlocks: hardBlocks
    },
    evaluatedAt: CV_isoNow_(),
    build: CANONICAL_VALIDATOR_BUILD
  };
}

/**
 * Minimal structural assertion for boundary callers and permanent tests.
 */
function CanonicalValidator_assertVerdict(verdict) {
  if (!verdict || typeof verdict !== 'object') {
    throw new Error('CanonicalValidatorContract: verdict object required');
  }
  CV_kind_(verdict.kind);
  CV_level_(verdict.level);
  if (!CV_clean_(verdict.ruleCode)) {
    throw new Error('CanonicalValidatorContract: ruleCode is required');
  }
  if (verdict.level === CanonicalValidatorVerdict.WAIVER_REQUIRED && verdict.waiverEligible !== true) {
    throw new Error('CanonicalValidatorContract: WAIVER_REQUIRED must be waiverEligible');
  }
  if (verdict.level === CanonicalValidatorVerdict.HARD_BLOCK && verdict.waiverEligible === true) {
    throw new Error('CanonicalValidatorContract: HARD_BLOCK cannot be waiverEligible');
  }
  return true;
}
