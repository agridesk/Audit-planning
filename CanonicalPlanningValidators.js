/***********************************************************************
 * CanonicalPlanningValidators.js
 *
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_PLANNING_VALIDATORS_R1
 *
 * PURPOSE
 *   Canonical backend facade for planning validation.
 *
 *   It consumes existing canonical owners instead of reimplementing them:
 *     - Qualification: _mp_assertAuditorQualifiedForPlanning_
 *     - Availability:  AvailabilityService.validate
 *     - Planning Window: persisted Audit planning window columns
 *     - Rotation: existing eligibility/rotation metadata (soft in this gate)
 *
 *   Tiered rotation policy is intentionally NOT introduced here. Roadmap
 *   2.4 schedules that after this contract is established.
 ***********************************************************************/

var CANONICAL_PLANNING_VALIDATORS_BUILD = '2026-09-09_ROADMAP_2_4_CANONICAL_PLANNING_VALIDATORS_R1';

function CPV_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CPV_normEmail_(v) {
  return CPV_clean_(v).toLowerCase();
}

function CPV_headerIndex_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];
  var exact = {};
  for (var i = 0; i < headers.length; i++) {
    exact[CPV_clean_(headers[i]).toLowerCase()] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var key = CPV_clean_(candidates[j]).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(exact, key)) return exact[key];
  }
  return -1;
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

function CPV_qualification(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);

  if (!subject.auditorEmail && !subject.auditorName) {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_AUDITOR_REQUIRED',
      'Missing auditor for qualification check',
      { subject: subject, source: '_mp_assertAuditorQualifiedForPlanning_' }
    );
  }

  if (typeof _mp_assertAuditorQualifiedForPlanning_ !== 'function') {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_OWNER_UNAVAILABLE',
      'Canonical qualification owner is unavailable',
      { subject: subject, source: '_mp_assertAuditorQualifiedForPlanning_' }
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
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_CHECK_FAILED',
      CPV_clean_(e && e.message) || 'Qualification check failed',
      { subject: subject, source: '_mp_assertAuditorQualifiedForPlanning_' }
    );
  }

  if (result.success === true) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.QUALIFICATION,
      'QUALIFICATION_OK',
      result.message || 'Auditor qualified',
      { subject: subject, source: '_mp_assertAuditorQualifiedForPlanning_', evidence: result }
    );
  }

  return CanonicalValidator_hardBlock(
    CanonicalValidatorKind.QUALIFICATION,
    'QUALIFICATION_NOT_QUALIFIED',
    result.message || 'Auditor is not qualified for the required scope(s)',
    { subject: subject, source: '_mp_assertAuditorQualifiedForPlanning_', evidence: result }
  );
}

function CPV_availability(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);

  if (!subject.auditorEmail) {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_AUDITOR_EMAIL_REQUIRED',
      'Missing auditor email for Availability validation',
      { subject: subject, source: 'AvailabilityService.validate' }
    );
  }

  if (typeof AvailabilityService === 'undefined' || !AvailabilityService || typeof AvailabilityService.validate !== 'function') {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_OWNER_UNAVAILABLE',
      'Canonical Availability owner is unavailable',
      { subject: subject, source: 'AvailabilityService.validate' }
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
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_CHECK_FAILED',
      CPV_clean_(e && e.message) || 'Availability validation failed',
      { subject: subject, source: 'AvailabilityService.validate' }
    );
  }

  if (result.success === true) {
    return CanonicalValidator_ok(
      CanonicalValidatorKind.AVAILABILITY,
      'AVAILABILITY_OK',
      result.message || 'Availability OK',
      { subject: subject, source: 'AvailabilityService.validate', evidence: result }
    );
  }

  return CanonicalValidator_hardBlock(
    CanonicalValidatorKind.AVAILABILITY,
    'AVAILABILITY_CONFLICT',
    result.message || 'Auditor is unavailable or has a planning collision',
    { subject: subject, source: 'AvailabilityService.validate', evidence: result }
  );
}

function CPV_planningWindow(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var headers = ctx.headers || [];
  var row = ctx.row || [];

  var iFrom = CPV_headerIndex_(headers, [
    'Planning window from', 'Plan van', 'Planning from', 'Planning from date',
    'Plan from', 'Planning start', 'Plan start'
  ]);
  var iTo = CPV_headerIndex_(headers, [
    'Planning window to', 'Plan tot', 'Planning to', 'Planning to date',
    'Plan to', 'Planning end', 'Plan end'
  ]);

  if (iFrom < 0 || iTo < 0) {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_COLUMNS_MISSING',
      'Canonical planning-window columns are missing',
      { subject: subject, source: 'Audit planning persisted planning window' }
    );
  }

  var fromISO = CPV_isoDate_(row[iFrom]);
  var toISO = CPV_isoDate_(row[iTo]);
  if (!fromISO || !toISO) {
    return CanonicalValidator_hardBlock(
      CanonicalValidatorKind.PLANNING_WINDOW,
      'PLANNING_WINDOW_UNAVAILABLE',
      'Planning window is unavailable for this audit',
      {
        subject: subject,
        source: 'Audit planning persisted planning window',
        evidence: { from: fromISO, to: toISO }
      }
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
        { subject: subject, source: 'Audit planning persisted planning window' }
      );
    }
    if (d < fromISO || d > toISO) {
      return CanonicalValidator_hardBlock(
        CanonicalValidatorKind.PLANNING_WINDOW,
        'PLANNING_WINDOW_OUTSIDE',
        'Planned date ' + d + ' is outside planning window ' + fromISO + ' to ' + toISO,
        {
          subject: subject,
          source: 'Audit planning persisted planning window',
          evidence: { plannedDate: d, from: fromISO, to: toISO }
        }
      );
    }
  }

  return CanonicalValidator_ok(
    CanonicalValidatorKind.PLANNING_WINDOW,
    'PLANNING_WINDOW_OK',
    'Planning date(s) are within the canonical planning window',
    {
      subject: subject,
      source: 'Audit planning persisted planning window',
      evidence: { from: fromISO, to: toISO }
    }
  );
}

function CPV_rotation(ctx) {
  CPV_requireContract_();
  ctx = ctx || {};
  var subject = CPV_subject_(ctx);
  var meta = ctx.rotationMeta || {};

  // Roadmap 2.4 gate: current rotation remains advisory/soft here.
  // Tiered WAIVER_REQUIRED/HARD_BLOCK policy is a later governed release.
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
        source: 'existing eligibility/rotation metadata',
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
      source: 'existing eligibility/rotation metadata',
      evidence: {
        performedCount: performed,
        maxAllowed: maxAllowed,
        performedByScope: meta.performedByScope || {}
      }
    }
  );
}

/**
 * Shared facade. Callers may disable a validator only explicitly.
 * No writes are performed.
 */
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
