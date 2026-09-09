/***********************************************************************
 * ConceptPlanningAvailabilityOverlay.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_R2_REUSE_CONTEXT
 *
 * PURPOSE
 *   Optional read-only Availability dataset for an already loaded Concept
 *   Planning advisory result. The workspace supplies the unique candidate
 *   auditor emails and the visible/requested period; this endpoint only
 *   loads Availability and returns a compact overlay projection.
 *
 * GOVERNANCE
 *   - ConceptPlanningService remains advisory only.
 *   - AvailabilityService / Auditor Availability remains canonical owner.
 *   - This overlay owns no availability rules and performs no writes.
 *   - Absence of Availability rows means UNKNOWN, never unavailable.
 *   - Commit must still revalidate through canonical validators.
 *
 * SPEED CONTRACT
 *   - Does NOT call ConceptPlanningService_get.
 *   - One AvailabilityPeriodReadModel batch read for all unique candidates.
 *   - No per-audit/per-auditor Sheet calls.
 *   - Concept Planning rows stay client-side / caller-side and are reused.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var CONCEPT_PLANNING_AVAILABILITY_OVERLAY_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_R2_REUSE_CONTEXT';

function CPAO_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function CPAO_norm_(v) {
  return CPAO_clean_(v).toLowerCase();
}

function CPAO_availableState_(v) {
  if (v === true) return 'YES';
  if (v === false) return 'NO';
  var s = CPAO_clean_(v).toUpperCase();
  if (!s) return '';
  if (s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1' || s === 'AVAILABLE' || s === 'BESCHIKBAAR') return 'YES';
  if (s === 'FALSE' || s === 'NO' || s === 'N' || s === '0' || s === 'UNAVAILABLE' || s === 'NOT AVAILABLE' || s === 'NIET BESCHIKBAAR') return 'NO';
  return '';
}

function CPAO_candidateEmails_(conceptRows) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (conceptRows || []).length; i++) {
    var candidates = Array.isArray(conceptRows[i] && conceptRows[i].candidateAuditors)
      ? conceptRows[i].candidateAuditors : [];
    for (var j = 0; j < candidates.length; j++) {
      var email = CPAO_norm_(candidates[j] && candidates[j].email);
      if (!email || seen[email]) continue;
      seen[email] = true;
      out.push(email);
    }
  }
  return out;
}

function CPAO_normalizeEmails_(raw) {
  var arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var email = CPAO_norm_(arr[i]);
    if (!email || seen[email]) continue;
    seen[email] = true;
    out.push(email);
  }
  return out;
}

function CPAO_indexAvailability_(rows) {
  var byEmail = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i] || {};
    var email = CPAO_norm_(r.auditorEmail);
    var date = CPAO_clean_(r.date);
    if (!email || !date) continue;
    if (!byEmail[email]) byEmail[email] = [];
    byEmail[email].push({
      date: date,
      state: CPAO_availableState_(r.available)
    });
  }
  return byEmail;
}

function CPAO_signalForWindow_(records, from, to) {
  records = records || [];
  from = CPAO_clean_(from);
  to = CPAO_clean_(to);
  var knownDays = 0;
  var availableDays = 0;
  var unavailableDays = 0;
  var seenDates = {};

  for (var i = 0; i < records.length; i++) {
    var r = records[i] || {};
    var d = CPAO_clean_(r.date);
    if (!d || (from && d < from) || (to && d > to) || seenDates[d]) continue;
    var state = CPAO_clean_(r.state);
    if (state !== 'YES' && state !== 'NO') continue;
    seenDates[d] = true;
    knownDays++;
    if (state === 'YES') availableDays++;
    else unavailableDays++;
  }

  var signal = 'UNKNOWN';
  if (availableDays > 0) signal = 'AVAILABLE_DAYS';
  else if (knownDays > 0 && unavailableDays === knownDays) signal = 'NO_AVAILABLE_DAYS';

  return {
    signal: signal,
    knownDays: knownDays,
    availableDays: availableDays,
    unavailableDays: unavailableDays
  };
}

function ConceptPlanningAvailabilityOverlay_get(input) {
  input = input || {};
  var from = CPAO_clean_(input.from || input.start || input.periodFrom);
  var to = CPAO_clean_(input.to || input.end || input.periodTo);
  var emails = CPAO_normalizeEmails_(
    input.auditorEmails || input.candidateAuditorEmails || input.auditors
  );

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('ConceptPlanningAvailabilityOverlay_get', {
    from: from,
    to: to,
    candidateAuditors: emails.length
  }) : null;

  if (typeof AvailabilityPeriodReadModel_get !== 'function') {
    throw new Error('ConceptPlanningAvailabilityOverlay: AvailabilityPeriodReadModel_get unavailable');
  }

  var availability = AvailabilityPeriodReadModel_get({
    from: from,
    to: to,
    auditorEmails: emails
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'availabilityBatch', {
    candidateAuditors: emails.length,
    rows: availability && availability.rows ? availability.rows.length : 0
  });

  var idx = CPAO_indexAvailability_(availability && availability.rows ? availability.rows : []);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'projectOverlay', {
    indexedAuditors: Object.keys(idx).length
  });

  var result = {
    success: true,
    build: CONCEPT_PLANNING_AVAILABILITY_OVERLAY_BUILD,
    period: { from: from, to: to },
    byAuditorEmail: idx,
    meta: {
      writes: false,
      advisoryOnly: true,
      availabilityOverlay: true,
      availabilityAffectsRanking: false,
      absenceMeansUnknown: true,
      commitRevalidationRequired: true,
      reusesLoadedConceptPlanning: true,
      conceptPlanningReadPerformed: false,
      canonicalOwner: 'AvailabilityService / Auditor Availability',
      candidateAuditorsRead: emails.length,
      availabilityRowsRead: availability && availability.rows ? availability.rows.length : 0
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    candidateAuditors: emails.length,
    availabilityRows: availability && availability.rows ? availability.rows.length : 0,
    indexedAuditors: Object.keys(idx).length
  });
  return result;
}
