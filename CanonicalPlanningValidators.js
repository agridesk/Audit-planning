/***********************************************************************
 * CanonicalPlanningValidators.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_PLANNING_VALIDATORS_R2
 *
 * PURPOSE
 *   Canonical backend facade for planning validation.
 *
 *   Existing canonical owners keep deciding the business rules:
 *     - Qualification: _mp_assertAuditorQualifiedForPlanning_
 *     - Availability: AvailabilityService.validate
 *     - Planning Window: _mp_resolvePlanningWindowCached_ / _mp_resolvePlanningWindow_
 *     - Rotation: existing eligibility/rotation metadata (soft in this gate)
 *
 *   This file normalizes those outcomes to CanonicalValidatorContract.
 *   It performs NO writes.
 *
 * ROADMAP 2.4 GATE
 *   Tiered rotation policy is intentionally NOT introduced here.
 *   Rotation remains advisory until the dedicated governed release.
 ***********************************************************************/

var CANONICAL_PLANNING_VALIDATORS_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_PLANNING_VALIDATORS_R2';

function CPV_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CPV_normEmail_(v) {
  return CPV_clean_(v).toLowerCase();
}

function CPV_isoDate_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    var tz = 'Etc/UTC';
    try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || tz; } catch (e) {}
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var s = CPV_clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

function CPV_subject_(ctx) {
  ctx = ctx || {};
  return {
    auditId: CPV_clean_(ctx.auditId),
    auditorEmail: CPV_normEmail_(ctx.auditorEmail),
    auditorName: CPV_clean_(ctx.auditorName),
    company: CPV_clean_(ctx.company),
    scopes: Array.isArray(ctx.requiredScopes) ? ctx.requiredScopes.slice() : []
  };
}

function CPV_requireContract_() {
  if (typeof CanonicalValidator_makeVerdict !== 'function') {
    throw new Error('CanonicalPlanningValidators: CanonicalValidatorContract.js is required');
  }
}

function CPV_ownerFailure_(kind, ruleCode, reason, subject, source, evidence) {
  return CanonicalValidator_hardBlock(kind, ruleCode, reason, {
    subject: subject,
    source: source,
    evidence: evidence == null ? null : evidence
  });
}

/* =====================================================================
 * QUALIFICATION
 * ===================================================================== */

function CPV_qualification(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var source = '_mp_assertAuditorQualifiedForPlanning_';

  if (!subject.auditorEmail && !subject.auditorName) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_AUDITOR_REQUIRED',
      'Missing auditor for qualification check',
      subject,
      source
    );
  }

  if (typeof _mp_assertAuditorQualifiedForPlanning_ !== 'function') {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_OWNER_UNAVAILABLE',
      'Canonical qualification owner is unavailable',
      subject,
      source
    );
  }

  var ss = ctx.ss || SpreadsheetApp.getActive();
  var result;
  try {
    result = _mp_assertAuditorQualifiedForPlanning_(
      ss,
      ctx.headers || [],
      ctx.row || [],
      subject.auditorEmail,
      subject.auditorName
    ) || {};
  } catch (e) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_CHECK_FAILED',
      CPV_clean_(e && e.message) || 'Qualification check failed',
      subject,
      source,
      { error: CPV_clean_(e && e.message) }
    );
  }

  if (result.success === true) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_OK',
      result.message || 'Auditor qualified',
      { subject: subject, source: source, evidence: result }
    );
  }

  return CanonicalValidator_hardBlock(
    CanonicalValidatorKind.QUALIFICATION,
    'QUALIFICATION_NOT_QUALIFIED',
    result.message || 'Auditor is not qualified for the required scope(s)',
    { subject: subject, source: source, evidence: result }
  );
}

/* =====================================================================
 * AVAILABILITY
 * ===================================================================== */

function CPV_availability(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var source = 'AvailabilityService.validate';

  if (!subject.auditorEmail) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_AUDITOR_EMAIL_REQUIRED',
      'Missing auditor email for Availability validation',
      subject,
      source
    );
  }

  if (typeof AvailabilityService === 'undefined' || !AvailabilityService || typeof AvailabilityService.validate !== 'function') {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_OWNER_UNAVAILABLE',
      'Canonical Availability owner is unavailable',
      subject,
      source
    );
  }

  var result;
  try {
    result = AvailabilityService.validate(
      subject.auditId,
      subject.auditorEmail,
      subject.auditorName,
      ctx.blocks || []
    ) || {};
  } catch (e) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_CHECK_FAILED',
      CPV_clean_(e && e.message) || 'Availability validation failed',
      subject,
      source,
      { error: CPV_clean_(e && e.message) }
    );
  }

  if (result.success === true) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_OK',
      result.message || 'Availability OK',
      { subject: subject, source: source, evidence: result }
    );
  }

  return CanonicalValidator_hardBlock(
    CanonicalValidatorKind.AVAILABILITY,
    'AVAILABILITY_CONFLICT',
    result.message || 'Auditor is unavailable or has a planning collision',
    { subject: subject, source: source, evidence: result }
  );
}

/* =====================================================================
 * PLANNING WINDOW
 * ===================================================================== */

function CPV_resolvePlanningWindow_(ctx) {
  ctx = ctx || {};
  var ss = ctx.ss || SpreadsheetApp.getActive();
  var headers = ctx.headers || [];
  var row = ctx.row || [];
  var auditId = CPV_clean_(ctx.auditId);

  if (typeof _mp_resolvePlanningWindowCached_ === 'function') {
    return _mp_resolvePlanningWindowCached_(ss, headers, row, auditId) || null;
  }
  if (typeof _mp_resolvePlanningWindow_ === 'function') {
    return _mp_resolvePlanningWindow_(ss, headers, row) || null;
  }
  return null;
}

function CPV_planningWindow(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var source = '_mp_resolvePlanningWindowCached_/_mp_resolvePlanningWindow_';

  if (typeof _mp_resolvePlanningWindowCached_ !== 'function' &&
      typeof _mp_resolvePlanningWindow_ !== 'function') {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_OWNER_UNAVAILABLE',
      'Canonical planning-window owner is unavailable',
      subject,
      source
    );
  }

  var resolved;
  try {
    resolved = CPV_resolvePlanningWindow_(ctx);
  } catch (e) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_CHECK_FAILED',
      CPV_clean_(e && e.message) || 'Planning-window resolution failed',
      subject,
      source,
      { error: CPV_clean_(e && e.message) }
    );
  }

  var fromISO = CPV_isoDate_(resolved && resolved.startDate);
  var toISO = CPV_isoDate_(resolved && resolved.endDate);
  if (!fromISO || !toISO) {
    return CPV_ownerFailure_(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_UNAVAILABLE',
      'Planning window is unavailable for this audit',
      subject,
      source,
      resolved
    );
  }

  var blocks = Array.isArray(ctx.blocks) ? ctx.blocks : [];
  for (var b = 0; b < blocks.length; b++) {
    var d = CPV_isoDate_(blocks[b] && blocks[b].date);
    if (!d) {
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.PLANNING_WINDOW,
        'PLANNING_WINDOW_INVALID_DATE',
        'Invalid planned date',
        { subject: subject, source: source, evidence: resolved }
      );
    }
    if (d < fromISO || d > toISO) {
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.PLANNING_WINDOW,
        'PLANNING_WINDOW_OUTSIDE',
        'Planned date ' + d + ' is outside planning window ' + fromISO + ' to ' + toISO,
        {
          subject: subject,
          source: source,
          evidence: {
            plannedDate: d,
            from: fromISO,
            to: toISO,
            mode: resolved.mode || '',
            warnings: resolved.warnings || [],
            activeScopes: resolved.activeScopes || [],
            scopeWindows: resolved.scopeWindows || []
          }
        }
      );
    }
  }

  var warnings = Array.isArray(resolved.warnings) ? resolved.warnings : [];
  if (warnings.length) {
    return CanonicalValidator_warning(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_SOFT_WARNING',
      CPV_clean_(warnings[0] && warnings[0].message) || 'Planning window contains a soft warning',
      {
        subject: subject,
        source: source,
        evidence: {
          from: fromISO,
          to: toISO,
          mode: resolved.mode || '',
          warnings: warnings,
          activeScopes: resolved.activeScopes || [],
          scopeWindows: resolved.scopeWindows || []
        }
      }
    );
  }

  return CanonicalValidator_ok(
    CanonicalValidatorKind.PLANNING_WINDOW,
    'PLANNING_WINDOW_OK',
    'Planning date(s) are within the canonical planning window',
    {
      subject: subject,
      source: source,
      evidence: {
        from: fromISO,
        to: toISO,
        mode: resolved.mode || '',
        activeScopes: resolved.activeScopes || [],
        scopeWindows: resolved.scopeWindows || []
      }
    }
  );
}

/* =====================================================================
 * ROTATION — current soft policy only
 * ===================================================================== */

function CPV_rotation(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var meta = ctx.rotationMeta || {};
  var source = 'existing eligibility/rotation metadata';

  var soft = meta.softBlockRotation === true;
  var performed = Number(meta.performedCount || 0) || 0;
  var maxAllowed = Number(meta.maxAllowed || 0) || 0;

  if (soft || (maxAllowed > 0 && performed >= maxAllowed)) {
    return CanonicalValidator_warning(
      CanonicalValidatorKind.ROTATION,
      'ROTATION_SOFT_LIMIT',
      'Rotation limitation requires manager attention',
      {
        subject: subject,
        source: source,
        evidence: {
          softBlockRotation: soft,
          performedCount: performed,
          maxAllowed: maxAllowed,
          performedByScope: meta.performedByScope || {}
        }
      }
    );
  }

  return CanonicalValidator_ok(
    CanonicalValidatorKind.ROTATION,
    'ROTATION_OK',
    'No current rotation limitation',
    {
      subject: subject,
      source: source,
      evidence: {
        performedCount: performed,
        maxAllowed: maxAllowed,
        performedByScope: meta.performedByScope || {}
      }
    }
  );
}

/* =====================================================================
 * SHARED FACADE
 * ===================================================================== */

function CanonicalPlanningValidators_evaluate(ctx) {
  ctx = ctx || {};
  var verdicts = [];
  var include = ctx.include || {};

  if (include.qualification !== false) verdicts.push(CPV_qualification(ctx));
  if (include.availability !== false) verdicts.push(CPV_availability(ctx));
  if (include.planningWindow !== false) verdicts.push(CPV_planningWindow(ctx));
  if (include.rotation !== false) verdicts.push(CPV_rotation(ctx));

  var aggregate = CanonicalValidator_aggregate(verdicts);
  aggregate.validatorBuild = CANONICAL_PLANNING_VALIDATORS_BUILD;
  return aggregate;
}
