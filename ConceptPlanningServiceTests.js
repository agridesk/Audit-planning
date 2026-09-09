/***********************************************************************
 * ConceptPlanningServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var CONCEPT_PLANNING_TEST_BUILD = '2026-09-09_ROADMAP_2_4_CONCEPT_PLANNING_ADVISORY_TESTS_R1';

function CPST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function CPST_period_() {
  var tz = Session.getScriptTimeZone();
  var y = Number(Utilities.formatDate(new Date(), tz, 'yyyy'));
  return { from: y + '-01-01', to: y + '-12-31' };
}

function RUN_CONCEPT_PLANNING_REGRESSION() {
  var results = [];

  var ranked = CPS_rankAuditors_([
    { name:'B', performedCount:2, softBlockRotation:false },
    { name:'A', performedCount:1, softBlockRotation:false },
    { name:'P', isPreassigned:true, performedCount:99, softBlockRotation:true }
  ]);
  CPST_assert_('preassignedRanksFirst', ranked[0] && ranked[0].name === 'P', 'preassigned first', results);
  CPST_assert_('lowerRotationCountRanksEarlier', ranked[1] && ranked[1].name === 'A', 'lower performedCount first among normal candidates', results);

  var p = CPST_period_();
  var t0 = Date.now();
  var smoke = ConceptPlanningService_get({ from:p.from, to:p.to, maxCandidates:5 });
  var smokeMs = Date.now() - t0;

  CPST_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  CPST_assert_('rowsArray', smoke && Array.isArray(smoke.rows), 'rows array', results);
  CPST_assert_('readOnly', smoke && smoke.meta && smoke.meta.writes === false, 'read-only', results);
  CPST_assert_('advisoryOnly', smoke && smoke.meta && smoke.meta.advisoryOnly === true, 'advisory only', results);
  CPST_assert_('commitRevalidationRequired', smoke && smoke.meta && smoke.meta.commitRevalidationRequired === true, 'commit must revalidate', results);
  CPST_assert_('noPerAuditReads', smoke && smoke.meta && smoke.meta.noPerAuditReads === true, 'batch read contract', results);
  CPST_assert_('eligibilityOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.eligibility === 'EligibilityService', 'eligibility owner', results);
  CPST_assert_('totalsPresent', smoke && smoke.totals && Number(smoke.totals.audits) >= 0, 'totals', results);

  var statesOk = true;
  var candidatesOk = true;
  var staleGuardOk = true;
  for (var i = 0; i < (smoke.rows || []).length; i++) {
    var r = smoke.rows[i] || {};
    if (['READY','REFRESH_REQUIRED','NO_CANDIDATES'].indexOf(r.advisoryState) < 0) statesOk = false;
    if (!Array.isArray(r.candidateAuditors)) candidatesOk = false;
    if (r.advisoryState === 'REFRESH_REQUIRED' && r.candidateAuditors.length !== 0) staleGuardOk = false;
  }
  CPST_assert_('statesCanonical', statesOk, 'known advisory states only', results);
  CPST_assert_('candidateArrays', candidatesOk, 'candidateAuditors arrays', results);
  CPST_assert_('staleNeverRecommended', staleGuardOk, 'stale/missing eligibility must not produce recommendations', results);

  var countCheck = smoke && smoke.totals
    ? (Number(smoke.totals.ready || 0) + Number(smoke.totals.refreshRequired || 0) + Number(smoke.totals.noCandidates || 0) === Number(smoke.totals.audits || 0))
    : false;
  CPST_assert_('totalsBalance', countCheck, 'totals must balance', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: CONCEPT_PLANNING_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    period: p,
    smokeServerMs: smokeMs,
    audits: smoke && smoke.totals ? smoke.totals.audits : 0,
    ready: smoke && smoke.totals ? smoke.totals.ready : 0,
    refreshRequired: smoke && smoke.totals ? smoke.totals.refreshRequired : 0,
    noCandidates: smoke && smoke.totals ? smoke.totals.noCandidates : 0,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
