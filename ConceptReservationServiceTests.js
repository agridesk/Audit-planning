/***********************************************************************
 * ConceptReservationServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_TESTS_R1
 ***********************************************************************/

var CONCEPT_RESERVATION_TEST_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_RESERVATION_TESTS_R1';

function RUN_CONCEPT_RESERVATION_REGRESSION() {
  var results = [];
  function check(name, ok, detail) { results.push({ name: name, ok: !!ok, detail: detail || '' }); }

  var built = ConceptReservationService_build({
    auditId: 'AUD_TEST_1',
    auditorEmail: 'Auditor@Example.com',
    auditorName: 'Auditor One',
    sourceRevision: 'PRT1-test',
    blocks: [{ date: '2026-10-12', start: '09:00', end: '13:00', hours: 4 }],
    createdBy: 'Planner@Example.com',
    createdAt: '2026-09-09T19:30:00'
  });
  var r = built.reservation;
  check('serviceSuccess', built.success === true);
  check('activeByDefault', r.state === 'ACTIVE');
  check('durable', built.meta.durable === true);
  check('noAutomaticExpiry', built.meta.automaticExpiry === false);
  check('explicitRelease', built.meta.explicitReleaseRequired === true);
  check('notFinalPlanning', built.meta.finalPlanning === false);
  check('zeroAuditPlanningWrites', built.meta.auditPlanningWrites === false);
  check('zeroLifecycleWrites', built.meta.lifecycleWrites === false);
  check('zeroAvailabilityWrites', built.meta.availabilityWrites === false);
  check('zeroStatusWrites', built.meta.statusWrites === false);
  check('zeroSheetReads', built.meta.sheetReads === 0);
  check('zeroServiceReads', built.meta.serviceReads === 0);
  check('emailNormalized', r.auditorEmail === 'auditor@example.com');
  check('sourceRevisionPreserved', r.sourceRevision === 'PRT1-test');
  check('finalCommitRevalidation', built.meta.finalCommitRevalidationRequired === true);
  check('activeConflictDetected', ConceptReservationService_conflicts(r, 'AUDITOR@example.com', { date:'2026-10-12', start:'12:00', end:'14:00' }) === true);
  check('differentDayNoConflict', ConceptReservationService_conflicts(r, 'auditor@example.com', { date:'2026-10-13', start:'12:00', end:'14:00' }) === false);
  check('differentAuditorNoConflict', ConceptReservationService_conflicts(r, 'other@example.com', { date:'2026-10-12', start:'12:00', end:'14:00' }) === false);

  var released = ConceptReservationService_release(r, { reason:'COMPANY_DECLINED', releasedBy:'planner@example.com', releasedAt:'2026-09-12T10:00:00' });
  check('releaseExplicit', released.state === 'RELEASED');
  check('releaseReason', released.releaseReason === 'COMPANY_DECLINED');
  check('releasedNoLongerConflicts', ConceptReservationService_conflicts(released, 'auditor@example.com', { date:'2026-10-12', start:'12:00', end:'14:00' }) === false);

  var failed = results.filter(function(x){ return !x.ok; }).length;
  var out = {
    ok: failed === 0,
    build: CONCEPT_RESERVATION_TEST_BUILD,
    total: results.length,
    passed: results.length - failed,
    failed: failed,
    results: results,
    meta: {
      nonDestructive: true,
      liveReadsPerformed: false,
      liveWritesPerformed: false,
      reason: 'Contract regression only; persistence and availability-overlay integration are separate slices.'
    }
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}
