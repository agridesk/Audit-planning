/***********************************************************************
 * TieredRotationPolicy.js
 * BUILD: 2026-09-09_ROADMAP_2_4_TIERED_ROTATION_POLICY_R1
 *
 * PURPOSE
 *   Govern rotation as a tiered planning rule on top of the existing
 *   canonical RotationAuditorService evidence.
 *
 * POLICY
 *   - Below max-1 performed audits: OK
 *   - At max-1 performed audits: WARNING (next audit reaches normal max)
 *   - At max performed audits: WAIVER_REQUIRED (one additional audit allowed)
 *   - At max+1 or more performed audits: HARD_BLOCK
 *
 * Example max=3:
 *   0/3 OK, 1/3 OK, 2/3 WARNING, 3/3 WAIVER_REQUIRED, 4/3 HARD_BLOCK.
 *
 * IMPORTANT
 *   consecutiveYears/performedCount means audits ALREADY performed before
 *   the proposed planning action. This module does not count the proposed
 *   audit itself in that input.
 *
 * No writes are performed here. Waiver persistence/audit trail is owned by
 * a later commit boundary; this module only returns the governed verdict.
 ***********************************************************************/

var TIERED_ROTATION_POLICY_BUILD = '2026-09-09_ROADMAP_2_4_TIERED_ROTATION_POLICY_R1';

function TRP_numOrNull_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function TRP_subject_(input) {
  input = input || {};
  return {
    auditId: String(input.auditId || '').trim(),
    companyUid: String(input.companyUid || '').trim(),
    company: String(input.company || input.companyName || '').trim(),
    scope: String(input.scope || '').trim(),
    auditorEmail: String(input.auditorEmail || '').trim().toLowerCase(),
    auditorName: String(input.auditorName || '').trim()
  };
}

function TieredRotationPolicy_evaluate(input) {
  input = input || {};
  var subject = TRP_subject_(input);
  var performed = TRP_numOrNull_(
    input.consecutiveYears != null ? input.consecutiveYears : input.performedCount
  );
  var max = TRP_numOrNull_(
    input.maxConsecutive != null ? input.maxConsecutive : input.maxAllowed
  );

  if (performed == null || performed < 0) performed = 0;

  if (max == null || max <= 0) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_NO_MAXIMUM',
      'No rotation maximum configured for this scope',
      {
        subject: subject,
        source: 'TieredRotationPolicy',
        policyVersion: TIERED_ROTATION_POLICY_BUILD,
        evidence: { performedCount: performed, maxAllowed: max }
      }
    );
  }

  if (performed >= max + 1) {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_HARD_BLOCK',
      'Rotation maximum plus waiver allowance has already been reached',
      {
        subject: subject,
        source: 'TieredRotationPolicy',
        policyVersion: TIERED_ROTATION_POLICY_BUILD,
        evidence: {
          performedCount: performed,
          maxAllowed: max,
          nextOrdinal: performed + 1,
          waiverAllowance: 1
        }
      }
    );
  }

  if (performed === max) {
    return CanonicalValidator_waiverRequired(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_WAIVER_REQUIRED',
      'One additional audit beyond the normal rotation maximum requires a waiver',
      {
        subject: subject,
        source: 'TieredRotationPolicy',
        policyVersion: TIERED_ROTATION_POLICY_BUILD,
        evidence: {
          performedCount: performed,
          maxAllowed: max,
          nextOrdinal: performed + 1,
          waiverAllowance: 1
        }
      }
    );
  }

  if (performed === max - 1) {
    return CanonicalValidator_warning(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_NEAR_LIMIT',
      'This planning reaches the normal rotation maximum',
      {
        subject: subject,
        source: 'TieredRotationPolicy',
        policyVersion: TIERED_ROTATION_POLICY_BUILD,
        evidence: {
          performedCount: performed,
          maxAllowed: max,
          nextOrdinal: performed + 1,
          waiverAllowance: 1
        }
      }
    );
  }

  return CanonicalValidator_ok(
    CanonicalValidatorKind.ROTATION,
    'ROTATION_OK',
    'Rotation is within the normal maximum',
    {
      subject: subject,
      source: 'TieredRotationPolicy',
      policyVersion: TIERED_ROTATION_POLICY_BUILD,
      evidence: {
        performedCount: performed,
        maxAllowed: max,
        nextOrdinal: performed + 1,
        waiverAllowance: 1
      }
    }
  );
}

/**
 * Evaluate multiple required scopes. Highest severity wins through the
 * canonical aggregate; per-scope evidence remains visible.
 */
function TieredRotationPolicy_evaluateScopes(input) {
  input = input || {};
  var byScope = input.performedByScope || {};
  var maxByScope = input.maxByScope || {};
  var scopes = Array.isArray(input.scopes) ? input.scopes : [];
  var verdicts = [];

  for (var i = 0; i < scopes.length; i++) {
    var scope = String(scopes[i] || '').trim();
    if (!scope) continue;
    verdicts.push(TieredRotationPolicy_evaluate({
      auditId: input.auditId,
      companyUid: input.companyUid,
      company: input.company,
      scope: scope,
      auditorEmail: input.auditorEmail,
      auditorName: input.auditorName,
      performedCount: Object.prototype.hasOwnProperty.call(byScope, scope) ? byScope[scope] : 0,
      maxAllowed: Object.prototype.hasOwnProperty.call(maxByScope, scope) ? maxByScope[scope] : null
    }));
  }

  if (!verdicts.length) {
    verdicts.push(TieredRotationPolicy_evaluate({
      auditId: input.auditId,
      companyUid: input.companyUid,
      company: input.company,
      auditorEmail: input.auditorEmail,
      auditorName: input.auditorName,
      performedCount: input.performedCount,
      maxAllowed: input.maxAllowed
    }));
  }

  var agg = CanonicalValidator_aggregate(verdicts);
  agg.policyBuild = TIERED_ROTATION_POLICY_BUILD;
  return agg;
}
