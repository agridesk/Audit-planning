/***********************************************************************
 * CanonicalPlanningValidatorGateway.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_GATEWAY_R1
 *
 * PURPOSE
 *   Audit-level read-only gateway for the shared planning validators.
 *
 *   This is the stable backend entry point intended for current planning,
 *   Planning Demand, Concept Planning, self-planning and later Commit.
 *   It loads one audit context, invokes canonical owners once, reuses the
 *   qualification result for current rotation metadata, and returns the
 *   shared verdict DTO.
 *
 *   NO writes. NO lifecycle changes. NO Availability writes.
 ***********************************************************************/

var CANONICAL_VALIDATOR_GATEWAY_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_VALIDATOR_GATEWAY_R1';

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

function CPVG_readAudit_(auditId) {
  auditId = CPVG_clean_(auditId);
  if (!auditId) throw new Error('CanonicalPlanningValidatorGateway: auditId is required');

  var ss = SpreadsheetApp.getActive();

  if (typeof __mp_getAuditPlanningRow_ === 'function') {
    var targeted = __mp_getAuditPlanningRow_(ss, auditId);
    if (targeted && targeted.row) {
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
      source: 'qualification verdict / existing eligibility metadata',
      evidence: null
    }
  );
}

/**
 * Public read-only gateway.
 *
 * input:
 *   auditId       required
 *   auditorEmail  required for Availability; email remains canonical identity
 *   auditorName   optional compatibility/display field
 *   blocks        planned blocks; required when Availability/Planning Window are evaluated
 *   include       optional flags: qualification, availability, planningWindow, rotation
 *   precomputed   optional canonical-owner results for callers that already executed an owner
 *
 * output:
 *   CanonicalValidator aggregate + auditContext metadata.
 */
function CanonicalPlanningValidators_evaluateAudit(input) {
  input = input || {};
  var auditId = CPVG_clean_(input.auditId);
  if (!auditId) throw new Error('CanonicalPlanningValidators_evaluateAudit: auditId is required');

  var audit = CPVG_readAudit_(auditId);
  var include = input.include || {};
  var ctx = {
    ss: audit.ss,
    auditId: auditId,
    headers: audit.headers,
    row: audit.row,
    auditorEmail: CPVG_clean_(input.auditorEmail).toLowerCase(),
    auditorName: CPVG_clean_(input.auditorName),
    company: CPVG_company_(audit.headers, audit.row),
    requiredScopes: CPVG_requiredScopes_(audit.headers, audit.row),
    blocks: Array.isArray(input.blocks) ? input.blocks : [],
    include: include,
    precomputed: input.precomputed || {}
  };

  var verdicts = [];
  var qualificationVerdict = null;

  if (include.qualification !== false) {
    qualificationVerdict = CPV_qualification(ctx);
    verdicts.push(qualificationVerdict);
  }

  if (include.availability !== false) {
    verdicts.push(CPV_availability(ctx));
  }

  if (include.planningWindow !== false) {
    verdicts.push(CPV_planningWindow(ctx));
  }

  if (include.rotation !== false) {
    var explicitRotation = CPV_precomputed_(ctx, 'rotation');
    var rotationMeta = explicitRotation != null
      ? explicitRotation
      : CPVG_rotationFromQualification_(qualificationVerdict);

    if (rotationMeta) {
      var rotationCtx = {
        auditId: ctx.auditId,
        auditorEmail: ctx.auditorEmail,
        auditorName: ctx.auditorName,
        company: ctx.company,
        requiredScopes: ctx.requiredScopes,
        rotationMeta: rotationMeta
      };
      verdicts.push(CPV_rotation(rotationCtx));
    } else {
      verdicts.push(CPVG_rotationMetadataUnavailable_(ctx));
    }
  }

  var aggregate = CanonicalValidator_aggregate(verdicts);
  aggregate.validatorBuild = CANONICAL_PLANNING_VALIDATORS_BUILD;
  aggregate.gatewayBuild = CANONICAL_VALIDATOR_GATEWAY_BUILD;
  aggregate.auditContext = {
    auditId: auditId,
    company: ctx.company,
    requiredScopes: ctx.requiredScopes.slice(),
    rowNumber: audit.rowNumber || 0,
    contextSource: audit.source
  };

  return aggregate;
}
