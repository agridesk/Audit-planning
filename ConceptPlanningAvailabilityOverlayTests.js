/***********************************************************************
 * ConceptPlanningAvailabilityOverlayTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TESTS_R2
 * Permanent, non-destructive regression.
 ***********************************************************************/

var CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TEST_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TESTS_R2';

function CPAOT_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function CPAOT_period_() {
  var tz = Session.getScriptTimeZone();
  var y = Number(Utilities.formatDate(new Date(), tz, 'yyyy'));
  return { from: y + '-01-01', to: y + '-12-31' };
}

function RUN_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_REGRESSION() {
  var results = [];

  CPAOT_assert_('availableTrue', CPAO_availableState_(true) === 'YES', 'true => YES', results);
  CPAOT_assert_('availableNo', CPAO_availableState_('NO') === 'NO', 'NO => NO', results);
  CPAOT_assert_('availableUnknown', CPAO_availableState_('MAYBE') === '', 'unknown stays unknown', results);

  var sig1 = CPAO_signalForWindow_([
    { date:'2026-01-10', state:'YES' },
    { date:'2026-01-11', state:'NO' }
  ], '2026-01-01', '2026-01-31');
  CPAOT_assert_('signalAvailableDays', sig1.signal === 'AVAILABLE_DAYS' && sig1.availableDays === 1 && sig1.unavailableDays === 1, 'mixed window', results);

  var sig2 = CPAO_signalForWindow_([
    { date:'2026-01-10', state:'NO' }
  ], '2026-01-01', '2026-01-31');
  CPAOT_assert_('signalNoAvailableDays', sig2.signal === 'NO_AVAILABLE_DAYS', 'known NO only', results);

  var sig3 = CPAO_signalForWindow_([], '2026-01-01', '2026-01-31');
  CPAOT_assert_('signalUnknown', sig3.signal === 'UNKNOWN' && sig3.knownDays === 0, 'absence is unknown', results);

  var dedupe = CPAO_candidateEmails_([
    { candidateAuditors:[{email:'A@EXAMPLE.COM'},{email:'a@example.com'}] },
    { candidateAuditors:[{email:'b@example.com'}] }
  ]);
  CPAOT_assert_('candidateEmailDedupe', dedupe.length === 2, 'candidate emails dedupe', results);

  var normalized = CPAO_normalizeEmails_(['A@EXAMPLE.COM','a@example.com','b@example.com']);
  CPAOT_assert_('inputEmailDedupe', normalized.length === 2, 'input emails dedupe', results);

  var p = CPAOT_period_();
  var prep0 = Date.now();
  var concept = ConceptPlanningService_get({ from:p.from, to:p.to, maxCandidates:5 });
  var conceptPreparationMs = Date.now() - prep0;
  var emails = CPAO_candidateEmails_(concept && concept.rows ? concept.rows : []);

  var t0 = Date.now();
  var smoke = ConceptPlanningAvailabilityOverlay_get({
    from:p.from,
    to:p.to,
    auditorEmails:emails
  });
  var smokeMs = Date.now() - t0;

  CPAOT_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  CPAOT_assert_('readOnly', smoke && smoke.meta && smoke.meta.writes === false, 'read-only', results);
  CPAOT_assert_('advisoryOnly', smoke && smoke.meta && smoke.meta.advisoryOnly === true, 'advisory only', results);
  CPAOT_assert_('availabilityOverlay', smoke && smoke.meta && smoke.meta.availabilityOverlay === true, 'overlay flag', results);
  CPAOT_assert_('rankingUnaffected', smoke && smoke.meta && smoke.meta.availabilityAffectsRanking === false, 'signal must not silently rerank', results);
  CPAOT_assert_('absenceUnknownContract', smoke && smoke.meta && smoke.meta.absenceMeansUnknown === true, 'absence contract', results);
  CPAOT_assert_('availabilityOwner', smoke && smoke.meta && smoke.meta.canonicalOwner === 'AvailabilityService / Auditor Availability', 'availability owner', results);
  CPAOT_assert_('commitRevalidationRequired', smoke && smoke.meta && smoke.meta.commitRevalidationRequired === true, 'commit revalidation', results);
  CPAOT_assert_('reusesLoadedConceptPlanning', smoke && smoke.meta && smoke.meta.reusesLoadedConceptPlanning === true, 'reuse loaded concept context', results);
  CPAOT_assert_('conceptPlanningNotReloaded', smoke && smoke.meta && smoke.meta.conceptPlanningReadPerformed === false, 'overlay must not reload concept planning', results);
  CPAOT_assert_('overlayIndexPresent', smoke && smoke.byAuditorEmail && typeof smoke.byAuditorEmail === 'object', 'overlay index', results);
  CPAOT_assert_('candidateAuditorsMatch', smoke && smoke.meta && smoke.meta.candidateAuditorsRead === emails.length, 'candidate auditor count', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    period: p,
    conceptPreparationMs: conceptPreparationMs,
    overlayServerMs: smokeMs,
    candidateAuditorsRead: smoke && smoke.meta ? smoke.meta.candidateAuditorsRead : 0,
    availabilityRowsRead: smoke && smoke.meta ? smoke.meta.availabilityRowsRead : 0,
    indexedAuditors: smoke && smoke.byAuditorEmail ? Object.keys(smoke.byAuditorEmail).length : 0,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
