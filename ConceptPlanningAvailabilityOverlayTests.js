/***********************************************************************
 * ConceptPlanningAvailabilityOverlayTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TEST_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TESTS_R1';

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

  var p = CPAOT_period_();
  var t0 = Date.now();
  var smoke = ConceptPlanningAvailabilityOverlay_get({ from:p.from, to:p.to, maxCandidates:5 });
  var smokeMs = Date.now() - t0;

  CPAOT_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  CPAOT_assert_('rowsArray', smoke && Array.isArray(smoke.rows), 'rows array', results);
  CPAOT_assert_('readOnly', smoke && smoke.meta && smoke.meta.writes === false, 'read-only', results);
  CPAOT_assert_('advisoryOnly', smoke && smoke.meta && smoke.meta.advisoryOnly === true, 'advisory only', results);
  CPAOT_assert_('availabilityOverlay', smoke && smoke.meta && smoke.meta.availabilityOverlay === true, 'overlay flag', results);
  CPAOT_assert_('rankingUnaffected', smoke && smoke.meta && smoke.meta.availabilityAffectsRanking === false, 'signal must not silently rerank', results);
  CPAOT_assert_('absenceUnknownContract', smoke && smoke.meta && smoke.meta.absenceMeansUnknown === true, 'absence contract', results);
  CPAOT_assert_('availabilityOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.availability === 'AvailabilityService / Auditor Availability', 'availability owner', results);
  CPAOT_assert_('commitRevalidationRequired', smoke && smoke.meta && smoke.meta.commitRevalidationRequired === true, 'commit revalidation', results);

  var candidateSignalsOk = true;
  var annotated = 0;
  for (var i = 0; i < (smoke.rows || []).length; i++) {
    var cands = Array.isArray(smoke.rows[i] && smoke.rows[i].candidateAuditors) ? smoke.rows[i].candidateAuditors : [];
    for (var j = 0; j < cands.length; j++) {
      var c = cands[j] || {};
      if (['AVAILABLE_DAYS','NO_AVAILABLE_DAYS','UNKNOWN'].indexOf(c.availabilitySignal) < 0) candidateSignalsOk = false;
      if (typeof c.availabilityKnownDays !== 'number' || typeof c.availabilityAvailableDays !== 'number' || typeof c.availabilityUnavailableDays !== 'number') candidateSignalsOk = false;
      annotated++;
    }
  }
  CPAOT_assert_('candidateSignalsPresent', candidateSignalsOk, 'candidate availability signals', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: CONCEPT_PLANNING_AVAILABILITY_OVERLAY_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    period: p,
    smokeServerMs: smokeMs,
    audits: smoke && smoke.rows ? smoke.rows.length : 0,
    candidateAuditorsRead: smoke && smoke.meta ? smoke.meta.candidateAuditorsRead : 0,
    availabilityRowsRead: smoke && smoke.meta ? smoke.meta.availabilityRowsRead : 0,
    annotatedCandidates: annotated,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
