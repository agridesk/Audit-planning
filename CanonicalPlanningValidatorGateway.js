/***********************************************************************
 * CanonicalPlanningValidatorGateway.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_GATEWAY_R3_DEV_PERF
 *
 * PURPOSE
 *   Audit-level read-only gateway for the shared planning validators.
 *
 *   This is the stable backend entry point intended for current planning,
 *   Planning Demand, Concept Planning, self-planning and later Commit.
 *   It loads one audit context and delegates decisions to canonical owners.
 *
 * PERFORMANCE
 *   DEV-only timing is emitted through DevPerformanceLog when available.
 *   The logger performs no sheet writes and emits one completion record.
 *
 *   NO writes. NO lifecycle changes. NO Availability writes.
 ***********************************************************************/

var CANONICAL_VALIDATOR_GATEWAY_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_GATEWAY_R3_DEV_PERF';

function CPVG_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CPVG_findCol_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];

  if (typeof _mp_findCol_ === 'function') {
    try {
      var ix = _mp_findCol_(headers, candidates);
      if (ix >= 0) return ix;
    } catch (e) {}
  }

  var normalized = headers.map(function(h) { return CPVG_clean_(h).toLowerCase(); });
  for (var c = 0; c < candidates.length; c++) {
    var key = CPVG_clean_(candidates[c]).toLowerCase();
    var found = normalized.indexOf(key);
    if (found >= 0) return found;
  }
  return -1;
}

function CPVG_readAudit_(auditId, perf) {
  auditId = CPVG_clean_(auditId);
  if (!auditId) throw new Error('CanonicalPlanningValidatorGateway: auditId is required');

  var ss = SpreadsheetApp.getActive();

  if (typeof __mp_getAuditPlanningRow_ === 'function') {
    var targeted = __mp_getAuditPlanningRow_(ss, auditId);
    if (targeted && targeted.row) {
      if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'auditReadTargeted', { rowNumber: targeted.rowNumber || 0 });
      return {
        ss: ss,
        headers: targeted.hdr || [],
        row: targeted.row,
        rowNumber: targeted.rowNumber || 0,
        source: '__mp_getAuditPlanningRow_'
      };
    }
  }

  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("CanonicalPlanningValidatorGateway: missing sheet 'Audit planning'");

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('CanonicalPlanningValidatorGateway: Audit planning is empty');

  var headers = values[0] || [];
  var cAuditId = CPVG_findCol_(headers, ['Audit ID', 'Audit_ID', 'AuditId', 'Audit Id']);
  if (cAuditId < 0) throw new Error("CanonicalPlanningValidatorGateway: missing 'Audit ID' column");

  for (var r = 1; r < values.length; r++) {
    if (CPVG_clean_(values[r][cAuditId]) === auditId) {
      if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'auditReadFallbackScan', { rowNumber: r + 1, rowsScanned: values.length - 1 });
      return {
        ss: ss,
        headers: headers,
        row: values[r],
        rowNumber: r + 1,
        source: 'Audit planning fallback scan'
      };
    }
  }

  throw new Error('CanonicalPlanningValidatorGateway: audit not found: ' + auditId);
}

function CPVG_requiredScopes_(headers, row) {
  if (typeof v5_extractScopesForAuditPlanningRow_ !== 'function') return [];
  var result = v5_extractScopesForAuditPlanningRow_(headers || [], row || []) || {};
  var scopes = Array.isArray(result.scopes) ? result.scopes : [];
  return scopes.map(function(s) {
    if (!s) return '';
    return CPVG_clean_(s.name || s.code || s.slot || '');
  }).filter(function(x) { return !!x; });
}

function CPVG_company_(headers, row) {
  var c = CPVG_findCol_(headers, ['Company']);
  return c >= 0 ? CPVG_clean_(row[c]) : '';
}

function CPVG_companyUid_(headers, row) {
  var c = CPVG_findCol_(headers, ['Company_UID', 'Company UID', 'CompanyUid', 'Company uid']);
  return c >= 0 ? CPVG_clean_(row[c]) : '';
}

function CPVG_rotationFromQualification_(qualificationVerdict) {
  if (!qualificationVerdict || qualificationVerdict.level !== 'OK') return null;
  var evidence = qualificationVerdict.evidence || {};
  var auditor = evidence.auditor || null;
  if (!auditor || typeof auditor !== 'object') return null;

  return {
    softBlockRotation: auditor.softBlockRotation === true,
    performedCount: Number(auditor.performedCount || 0) || 0,
    maxAllowed: Number(auditor.maxAllowed || 0) || 0,
    performedByScope: auditor.performedByScope || {}
  };
}

function CPVG_rotationMetadataUnavailable_(ctx) {
  return CanonicalValidator_warning(
    CanonicalValidatorKind.ROTATION,
    'ROTATION_METADATA_UNAVAILABLE',
    'Rotation metadata is not available for the selected auditor in this evaluation',
    {
      subject: CPV_subject_(ctx),
      source: 'rotation governance / existing eligibility metadata',
      evidence: null
    }
  );
}

function CPVG_rotationVerdict_(ctx, qualificationVerdict) {
  var explicitRotation = CPV_precomputed_(ctx, 'rotation');

  if (explicitRotation && explicitRotation.kind === CanonicalValidatorKind.ROTATION && explicitRotation.level) {
    return CanonicalValidator_makeVerdict(explicitRotation);
  }

  if (typeof RotationGovernanceService_worstVerdict === 'function') {
    try {
      return RotationGovernanceService_worstVerdict({
        auditId: ctx.auditId,
        companyUid: ctx.companyUid,
        company: ctx.company,
        auditorEmail: ctx.auditorEmail,
        auditorName: ctx.auditorName,
        scopes: ctx.requiredScopes
      });
    } catch (eGov) {
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.ROTATION,
        'ROTATION_GOVERNANCE_FAILED',
        CPVG_clean_(eGov && eGov.message) || 'Rotation governance failed',
        {
          subject: CPV_subject_(ctx),
          source: 'RotationGovernanceService',
          evidence: null
        }
      );
    }
  }

  var rotationMeta = explicitRotation != null
    ? explicitRotation
    : CPVG_rotationFromQualification_(qualificationVerdict);

  if (rotationMeta) {
    return CPV_rotation({
      auditId: ctx.auditId,
      auditorEmail: ctx.auditorEmail,
      auditorName: ctx.auditorName,
      company: ctx.company,
      requiredScopes: ctx.requiredScopes,
      rotationMeta: rotationMeta
    });
  }

  return CPVG_rotationMetadataUnavailable_(ctx);
}

/**
 * Public read-only gateway.
 */
function CanonicalPlanningValidators_evaluateAudit(input) {
  input = input || {};
  var auditId = CPVG_clean_(input.auditId);
  if (!auditId) throw new Error('CanonicalPlanningValidators_evaluateAudit: auditId is required');

  var __perf = (typeof DPL_start_ === 'function') ? DPL_start_('CanonicalPlanningValidators_evaluateAudit', {
    auditId: auditId,
    auditorEmail: CPVG_clean_(input.auditorEmail).toLowerCase()
  }) : null;

  var audit = CPVG_readAudit_(auditId, __perf);
  var include = input.include || {};
  var ctx = {
    ss: audit.ss,
    auditId: auditId,
    headers: audit.headers,
    row: audit.row,
    auditorEmail: CPVG_clean_(input.auditorEmail).toLowerCase(),
    auditorName: CPVG_clean_(input.auditorName),
    company: CPVG_company_(audit.headers, audit.row),
    companyUid: CPVG_companyUid_(audit.headers, audit.row),
    requiredScopes: CPVG_requiredScopes_(audit.headers, audit.row),
    blocks: Array.isArray(input.blocks) ? input.blocks : [],
    include: include,
    precomputed: input.precomputed || {}
  };

  if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'contextPrepared', { scopeCount: ctx.requiredScopes.length, blockCount: ctx.blocks.length });

  var verdicts = [];
  var qualificationVerdict = null;

  if (include.qualification !== false) {
    qualificationVerdict = CPV_qualification(ctx);
    verdicts.push(qualificationVerdict);
    if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'qualification', { level: qualificationVerdict.level });
  }

  if (include.availability !== false) {
    var availabilityVerdict = CPV_availability(ctx);
    verdicts.push(availabilityVerdict);
    if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'availability', { level: availabilityVerdict.level });
  }

  if (include.planningWindow !== false) {
    var windowVerdict = CPV_planningWindow(ctx);
    verdicts.push(windowVerdict);
    if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'planningWindow', { level: windowVerdict.level });
  }

  if (include.rotation !== false) {
    var rotationVerdict = CPVG_rotationVerdict_(ctx, qualificationVerdict);
    verdicts.push(rotationVerdict);
    if (typeof DPL_mark_ === 'function') DPL_mark_(__perf, 'rotation', { level: rotationVerdict.level });
  }

  var aggregate = CanonicalValidator_aggregate(verdicts);
  aggregate.validatorBuild = CANONICAL_PLANNING_VALIDATORS_BUILD;
  aggregate.gatewayBuild = CANONICAL_VALIDATOR_GATEWAY_BUILD;
  aggregate.auditContext = {
    auditId: auditId,
    companyUid: ctx.companyUid,
    company: ctx.company,
    requiredScopes: ctx.requiredScopes.slice(),
    rowNumber: audit.rowNumber || 0,
    contextSource: audit.source
  };

  if (typeof DPL_end_ === 'function') {
    var perfPayload = DPL_end_(__perf, {
      overallLevel: aggregate.overallLevel,
      verdictCount: verdicts.length,
      contextSource: audit.source
    });
    if (perfPayload) aggregate.devPerformance = perfPayload;
  }

  return aggregate;
}
