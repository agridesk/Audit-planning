/***********************************************************************
 * ConceptPlanningDateSlotAdvisory.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_DATE_SLOT_ADVISORY_R1
 *
 * PURPOSE
 *   Pure read-only projection over already loaded Concept Planning rows and
 *   Availability overlay data. Produces bounded day-level advisory slots for
 *   the visible period without any Sheet/service reads.
 *
 * GOVERNANCE
 *   - No writes, holds, commits or lifecycle changes.
 *   - No second planning/availability/eligibility rule owner.
 *   - Planning-window dates come from loaded Concept Planning rows.
 *   - Candidate auditors come from canonical EligibilityService-derived data.
 *   - Availability overlay remains advisory; absence means UNKNOWN.
 *   - blockedWeekdays is advisory evidence only.
 *   - Commit must revalidate canonically.
 *
 * SPEED CONTRACT
 *   - Zero Sheet reads.
 *   - Zero service/RPC calls from this projection.
 *   - Reuses loaded Concept Planning + Availability overlay.
 *   - Bounded visible period and bounded slots per audit.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var CONCEPT_DATE_SLOT_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_DATE_SLOT_ADVISORY_R1';

function CDSA_clean_(v) { return String(v == null ? '' : v).trim(); }
function CDSA_norm_(v) { return CDSA_clean_(v).toLowerCase(); }

function CDSA_parseDate_(s) {
  s = CDSA_clean_(s);
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

function CDSA_iso_(d) {
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function CDSA_days_(from, to, maxDays) {
  var a = CDSA_parseDate_(from), b = CDSA_parseDate_(to);
  if (!a || !b || a.getTime() > b.getTime()) return [];
  maxDays = Math.max(1, Math.min(93, Number(maxDays || 62) || 62));
  var out = [], cur = new Date(a.getTime());
  while (cur.getTime() <= b.getTime() && out.length < maxDays) {
    out.push(CDSA_iso_(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function CDSA_weekday_(iso) {
  var d = CDSA_parseDate_(iso);
  if (!d) return '';
  return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][d.getUTCDay()];
}

function CDSA_availabilityIndex_(overlay) {
  var src = overlay && overlay.byAuditorEmail ? overlay.byAuditorEmail : (overlay || {});
  var out = {};
  Object.keys(src || {}).forEach(function(rawEmail) {
    var email = CDSA_norm_(rawEmail);
    if (!email) return;
    var byDate = {};
    var records = Array.isArray(src[rawEmail]) ? src[rawEmail] : [];
    for (var i = 0; i < records.length; i++) {
      var date = CDSA_clean_(records[i] && records[i].date);
      var state = CDSA_clean_(records[i] && records[i].state).toUpperCase();
      if (date && (state === 'YES' || state === 'NO')) byDate[date] = state;
    }
    out[email] = byDate;
  });
  return out;
}

function CDSA_blockedWeekday_(candidate, date) {
  var weekday = CDSA_weekday_(date);
  var blocked = Array.isArray(candidate && candidate.blockedWeekdays) ? candidate.blockedWeekdays : [];
  for (var i = 0; i < blocked.length; i++) {
    if (CDSA_clean_(blocked[i]).toUpperCase() === weekday) return true;
  }
  return false;
}

function CDSA_candidateSignal_(candidate, date, availabilityIndex) {
  var email = CDSA_norm_(candidate && candidate.email);
  if (!email) return 'UNKNOWN';
  if (CDSA_blockedWeekday_(candidate, date)) return 'BLOCKED_WEEKDAY';
  var state = availabilityIndex[email] && availabilityIndex[email][date];
  if (state === 'YES') return 'AVAILABLE';
  if (state === 'NO') return 'UNAVAILABLE';
  return 'UNKNOWN';
}

function ConceptPlanningDateSlotAdvisory_get(input) {
  input = input || {};
  var conceptRows = Array.isArray(input.conceptRows) ? input.conceptRows : [];
  var from = CDSA_clean_(input.from || input.start || input.periodFrom);
  var to = CDSA_clean_(input.to || input.end || input.periodTo);
  var maxDays = Math.max(1, Math.min(93, Number(input.maxDays || 62) || 62));
  var maxSlotsPerAudit = Math.max(1, Math.min(31, Number(input.maxSlotsPerAudit || 10) || 10));

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('ConceptPlanningDateSlotAdvisory_get', {
    from: from, to: to, conceptRows: conceptRows.length
  }) : null;

  var days = CDSA_days_(from, to, maxDays);
  var availabilityIndex = CDSA_availabilityIndex_(input.availabilityOverlay || input.byAuditorEmail || {});
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'prepareLoadedContext', {
    visibleDays: days.length,
    indexedAuditors: Object.keys(availabilityIndex).length
  });

  var rows = [], totalSlots = 0, readyAudits = 0, refreshRequired = 0;
  for (var i = 0; i < conceptRows.length; i++) {
    var c = conceptRows[i] || {};
    var auditId = CDSA_clean_(c.auditId);
    var requiresRefresh = c.requiresCanonicalRefresh === true || CDSA_clean_(c.advisoryState) === 'REFRESH_REQUIRED';
    var candidates = Array.isArray(c.candidateAuditors) ? c.candidateAuditors : [];
    var winFrom = CDSA_clean_(c.planningWindowFrom) || from;
    var winTo = CDSA_clean_(c.planningWindowTo) || to;
    var slots = [];

    if (!requiresRefresh && candidates.length) {
      for (var d = 0; d < days.length && slots.length < maxSlotsPerAudit; d++) {
        var date = days[d];
        if ((winFrom && date < winFrom) || (winTo && date > winTo)) continue;
        var available = [], unknown = [], unavailable = [], blocked = [];
        for (var a = 0; a < candidates.length; a++) {
          var cand = candidates[a] || {};
          var signal = CDSA_candidateSignal_(cand, date, availabilityIndex);
          var projected = {
            name: CDSA_clean_(cand.name),
            email: CDSA_norm_(cand.email),
            signal: signal,
            isPreassigned: cand.isPreassigned === true,
            rotationWarning: cand.rotationWarning === true
          };
          if (signal === 'AVAILABLE') available.push(projected);
          else if (signal === 'UNAVAILABLE') unavailable.push(projected);
          else if (signal === 'BLOCKED_WEEKDAY') blocked.push(projected);
          else unknown.push(projected);
        }
        if (available.length || unknown.length) {
          slots.push({
            date: date,
            signal: available.length ? 'AVAILABLE' : 'UNKNOWN',
            availableAuditors: available,
            unknownAuditors: unknown,
            unavailableCount: unavailable.length,
            blockedWeekdayCount: blocked.length
          });
        }
      }
    }

    if (requiresRefresh) refreshRequired++;
    if (slots.length) readyAudits++;
    totalSlots += slots.length;
    rows.push({
      auditId: auditId,
      advisoryState: requiresRefresh ? 'REFRESH_REQUIRED' : (slots.length ? 'DATE_SLOTS' : 'NO_DATE_SLOTS'),
      planningWindowFrom: winFrom,
      planningWindowTo: winTo,
      slots: slots,
      slotCount: slots.length,
      requiresCanonicalRefresh: requiresRefresh
    });
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'projectDateSlots', {
    audits: rows.length, readyAudits: readyAudits, refreshRequired: refreshRequired, totalSlots: totalSlots
  });

  var result = {
    success: true,
    build: CONCEPT_DATE_SLOT_BUILD,
    period: { from: from, to: to, visibleDays: days.length },
    rows: rows,
    totals: { audits: rows.length, readyAudits: readyAudits, refreshRequired: refreshRequired, totalSlots: totalSlots },
    meta: {
      writes: false,
      advisoryOnly: true,
      sheetReads: 0,
      serviceReads: 0,
      reusesLoadedConceptPlanning: true,
      reusesLoadedAvailabilityOverlay: true,
      absenceMeansUnknown: true,
      availabilityAffectsCanonicalEligibility: false,
      commitRevalidationRequired: true,
      maxDays: maxDays,
      maxSlotsPerAudit: maxSlotsPerAudit,
      canonicalOwners: {
        planningWindow: 'Planning Window canonical resolver via Concept Planning evidence',
        eligibility: 'EligibilityService',
        availability: 'AvailabilityService / Auditor Availability'
      }
    }
  };
  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    audits: rows.length, visibleDays: days.length, totalSlots: totalSlots
  });
  return result;
}
