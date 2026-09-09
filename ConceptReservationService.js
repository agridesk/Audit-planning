/***********************************************************************
 * ConceptReservationService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_R1_CONTRACT
 *
 * PURPOSE
 *   Canonical contract for durable preliminary planning reservations.
 *   A reservation may remain active for days/weeks while the company is
 *   contacted. It is NOT a short technical lock and NOT a final planning.
 *
 * GOVERNANCE
 *   - Audit planning remains canonical final planning truth.
 *   - Concept Reservation is separate preliminary workflow state.
 *   - No Audit planning / lifecycle / StatusMachine writes here.
 *   - No automatic TTL/expiry. Release is explicit until governance says
 *     otherwise.
 *   - A reservation carries the planning revision from which it was created;
 *     final Commit must still use fresh canonical revision + preflight.
 *   - Availability overlay may treat ACTIVE reservations as preliminary busy,
 *     but AvailabilityService remains canonical availability owner.
 *
 * SPEED CONTRACT
 *   - Pure contract/projection functions in this slice: zero Sheet reads.
 *   - No RPC/service reads.
 *   - Persistence/index integration follows as a separate bounded slice.
 ***********************************************************************/

var CONCEPT_RESERVATION_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_R1_CONTRACT';

function CRS_clean_(v) { return String(v == null ? '' : v).trim(); }
function CRS_norm_(v) { return CRS_clean_(v).toLowerCase(); }

function CRS_blocks_(blocks) {
  var src = Array.isArray(blocks) ? blocks : [];
  var out = [];
  for (var i = 0; i < src.length; i++) {
    var b = src[i] || {};
    var date = CRS_clean_(b.date);
    var start = CRS_clean_(b.start || b.startTime);
    var end = CRS_clean_(b.end || b.endTime);
    var hours = Number(b.hours || 0) || 0;
    if (!date) continue;
    out.push({ date: date, start: start, end: end, hours: hours });
  }
  return out;
}

function CRS_reservationId_(auditId) {
  return 'CR-' + CRS_clean_(auditId);
}

function ConceptReservationService_build(input) {
  input = input || {};
  var auditId = CRS_clean_(input.auditId);
  var auditorEmail = CRS_norm_(input.auditorEmail);
  var blocks = CRS_blocks_(input.blocks);
  var sourceRevision = CRS_clean_(input.sourceRevision || input.expectedRevision);
  if (!auditId) throw new Error('ConceptReservationService: auditId is required');
  if (!auditorEmail) throw new Error('ConceptReservationService: auditorEmail is required');
  if (!blocks.length) throw new Error('ConceptReservationService: at least one planning block is required');
  if (!sourceRevision) throw new Error('ConceptReservationService: sourceRevision is required');

  return {
    success: true,
    build: CONCEPT_RESERVATION_BUILD,
    reservation: {
      reservationId: CRS_reservationId_(auditId),
      auditId: auditId,
      auditorEmail: auditorEmail,
      auditorName: CRS_clean_(input.auditorName),
      blocks: blocks,
      sourceRevision: sourceRevision,
      state: 'ACTIVE',
      purpose: 'PRELIMINARY_COMPANY_CONFIRMATION',
      note: CRS_clean_(input.note),
      createdBy: CRS_norm_(input.createdBy),
      createdAt: CRS_clean_(input.createdAt),
      updatedAt: CRS_clean_(input.updatedAt || input.createdAt)
    },
    meta: {
      finalPlanning: false,
      durable: true,
      automaticExpiry: false,
      explicitReleaseRequired: true,
      auditPlanningWrites: false,
      lifecycleWrites: false,
      availabilityWrites: false,
      statusWrites: false,
      sheetReads: 0,
      serviceReads: 0,
      canonicalFinalPlanningOwner: 'Audit planning',
      canonicalAvailabilityOwner: 'AvailabilityService / Auditor availability',
      finalCommitRevalidationRequired: true,
      revisionRole: 'source concurrency evidence only'
    }
  };
}

function ConceptReservationService_release(reservation, input) {
  reservation = reservation || {};
  input = input || {};
  var out = JSON.parse(JSON.stringify(reservation));
  if (!CRS_clean_(out.auditId)) throw new Error('ConceptReservationService: reservation auditId is required');
  out.state = 'RELEASED';
  out.releaseReason = CRS_clean_(input.reason || 'MANUAL_RELEASE');
  out.releasedBy = CRS_norm_(input.releasedBy);
  out.releasedAt = CRS_clean_(input.releasedAt);
  out.updatedAt = CRS_clean_(input.releasedAt || input.updatedAt || out.updatedAt);
  return out;
}

function ConceptReservationService_isActive(reservation) {
  return CRS_clean_(reservation && reservation.state).toUpperCase() === 'ACTIVE';
}

function ConceptReservationService_conflicts(reservation, auditorEmail, block) {
  if (!ConceptReservationService_isActive(reservation)) return false;
  if (CRS_norm_(reservation.auditorEmail) !== CRS_norm_(auditorEmail)) return false;
  var target = CRS_blocks_([block]);
  if (!target.length) return false;
  var t = target[0];
  var blocks = CRS_blocks_(reservation.blocks);
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.date !== t.date) continue;
    if (!b.start || !b.end || !t.start || !t.end) return true;
    if (b.start < t.end && t.start < b.end) return true;
  }
  return false;
}
