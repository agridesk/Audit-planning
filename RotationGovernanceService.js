/***********************************************************************
 * RotationGovernanceService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ROTATION_GOVERNANCE_R2_DEV_PERF
 *
 * PURPOSE
 *   Bridge canonical RotationAuditorService evidence to TieredRotationPolicy.
 *   No rotation history is duplicated and no writes are performed.
 *
 * PERFORMANCE
 *   DEV-only timing is emitted through DevPerformanceLog when available.
 *   Logging performs no sheet writes and emits one Logger record per call.
 ***********************************************************************/

var ROTATION_GOVERNANCE_BUILD = '2026-09-09_ROADMAP_2_4_ROTATION_GOVERNANCE_R2_DEV_PERF';

function RGS_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function RGS_uniqueScopes_(scopes) {
  var out = [];
  var seen = {};
  (Array.isArray(scopes) ? scopes : []).forEach(function(x) {
    var s = RGS_clean_(x);
    var k = s.toLowerCase();
    if (!s || seen[k]) return;
    seen[k] = true;
    out.push(s);
  });
  return out;
}

function RotationGovernanceService_evaluate(input) {
  input = input || {};
  var __perf = (typeof DPL_start_ === 'function') ? DPL_start_('RotationGovernanceService_evaluate', {
    auditId: RGS_clean_(input.auditId),
    auditorEmail: RGS_clean_(input.auditorEmail).toLowerCase()
  }) : null;

  if (typeof TieredRotationPolicy_evaluate !== 'function') {
    throw new Error('RotationGovernanceService: TieredRotationPolicy is required');
  }
  if (typeof RotationAuditorService_getAuditorScopeResult !== 'function') {
    throw new Error('RotationGovernanceService: canonical RotationAuditorService is unavailable');
  }

  var scopes = RGS_uniqueScopes_(input.scopes || input.requiredScopes || []);
  var verdicts = [];
  var evidence = [];

  if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'normalizeScopes', { scopeCount: scopes.length });

  for (var i = 0; i < scopes.length; i++) {
    var scope = scopes[i];
    var tScope = Date.now();
    var raw = RotationAuditorService_getAuditorScopeResult({
      companyUid: RGS_clean_(input.companyUid),
      companyName: RGS_clean_(input.company || input.companyName),
      auditorEmail: RGS_clean_(input.auditorEmail).toLowerCase(),
      auditorName: RGS_clean_(input.auditorName),
      scope: scope,
      maxYearExclusive: input.maxYearExclusive || null
    }) || {};

    evidence.push(raw);
    verdicts.push(TieredRotationPolicy_evaluate({
      auditId: input.auditId,
      companyUid: raw.companyUid || input.companyUid,
      company: raw.company || input.company,
      scope: raw.scope || scope,
      auditorEmail: input.auditorEmail,
      auditorName: input.auditorName,
      consecutiveYears: raw.consecutiveYears,
      maxConsecutive: raw.maxConsecutive
    }));

    if (typeof DPL_mark_ === 'function') {
      DPL_mark_(__perf, 'scope:' + scope, {
        scopeMs: Date.now() - tScope,
        consecutiveYears: raw.consecutiveYears,
        maxConsecutive: raw.maxConsecutive
      });
    }
  }

  if (!scopes.length) {
    verdicts.push(CanonicalValidator_warning(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_SCOPE_UNAVAILABLE',
      'Rotation cannot be evaluated because no required scope is available',
      {
        subject: {
          auditId: RGS_clean_(input.auditId),
          auditorEmail: RGS_clean_(input.auditorEmail).toLowerCase(),
          auditorName: RGS_clean_(input.auditorName),
          companyUid: RGS_clean_(input.companyUid),
          company: RGS_clean_(input.company || input.companyName)
        },
        source: 'RotationGovernanceService',
        policyVersion: TIERED_ROTATION_POLICY_BUILD
      }
    ));
  }

  var aggregate = CanonicalValidator_aggregate(verdicts);
  aggregate.rotationEvidence = evidence;
  aggregate.governanceBuild = ROTATION_GOVERNANCE_BUILD;

  if (typeof DPL_end_ === 'function') {
    var perfPayload = DPL_end_(__perf, {
      overallLevel: aggregate.overallLevel,
      verdictCount: verdicts.length
    });
    if (perfPayload) aggregate.devPerformance = perfPayload;
  }

  return aggregate;
}

/**
 * Select the single highest-severity rotation verdict for callers that need
 * one canonical verdict inside a wider planning-validation aggregate.
 */
function RotationGovernanceService_worstVerdict(input) {
  var result = RotationGovernanceService_evaluate(input);
  var verdicts = result.verdicts || [];
  if (!verdicts.length) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_OK',
      'No rotation limitation',
      { source: 'RotationGovernanceService', policyVersion: TIERED_ROTATION_POLICY_BUILD }
    );
  }

  var rank = { OK: 0, WARNING: 1, WAIVER_REQUIRED: 2, HARD_BLOCK: 3 };
  var worst = verdicts[0];
  for (var i = 1; i < verdicts.length; i++) {
    if ((rank[verdicts[i].level] || 0) > (rank[worst.level] || 0)) worst = verdicts[i];
  }
  return worst;
}
