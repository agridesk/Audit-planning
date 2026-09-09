/***********************************************************************
 * PlanningContextReadModelTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_CONTEXT_TESTS_R2
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_CONTEXT_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_CONTEXT_TESTS_R2';

function PCRMT_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function PCRMT_testPeriod_() {
  var today = new Date();
  var tz = Session.getScriptTimeZone();
  var year = Number(Utilities.formatDate(today, tz, 'yyyy'));
  return { from: year + '-01-01', to: year + '-12-31' };
}

function RUN_PLANNING_CONTEXT_REGRESSION() {
  var results = [];

  PCRMT_assert_('uniqueDedupes', PCRM_unique_(['A','a','B'], function(x){ return x.toLowerCase(); }).length === 2, 'unique helper', results);

  var demandPlan = PCRM_demandInput_({ from: '2026-01-01', to: '2026-12-31' });
  PCRMT_assert_('normalFlowSkipsDemandCompanyRead', demandPlan && demandPlan.input && demandPlan.input.includeCompanyMeta === false, 'normal flow must skip duplicate Companies read', results);

  var filteredPlan = PCRM_demandInput_({ from: '2026-01-01', to: '2026-12-31', country: 'NL' });
  PCRMT_assert_('countryFilterKeepsDemandCompanyRead', filteredPlan && filteredPlan.input && filteredPlan.input.includeCompanyMeta === true, 'country filter needs company read', results);

  var period = PCRMT_testPeriod_();
  var t0 = Date.now();
  var smoke = PlanningContextReadModel_get({
    from: period.from,
    to: period.to
  });
  var smokeMs = Date.now() - t0;

  PCRMT_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  PCRMT_assert_('readOnly', smoke && smoke.meta && smoke.meta.writes === false, 'must be read-only', results);
  PCRMT_assert_('coarseGrainedRpc', smoke && smoke.meta && smoke.meta.coarseGrainedRpc === true, 'coarse-grained RPC contract', results);
  PCRMT_assert_('demandPresent', smoke && smoke.demand && Array.isArray(smoke.demand.rows), 'demand', results);
  PCRMT_assert_('profilesPresent', smoke && smoke.profiles && Array.isArray(smoke.profiles.companies) && Array.isArray(smoke.profiles.auditors), 'profiles', results);
  PCRMT_assert_('availabilityPresent', smoke && smoke.availability && Array.isArray(smoke.availability.rows), 'availability', results);
  PCRMT_assert_('scopeOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.scope === 'Config_Scopes', 'scope owner', results);
  PCRMT_assert_('availabilityOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.availability === 'AvailabilityService / Auditor Availability', 'availability owner', results);
  PCRMT_assert_('scopeEvidenceReused', smoke && smoke.profiles && smoke.profiles.meta && smoke.profiles.meta.auditorMeta && smoke.profiles.meta.auditorMeta.scopeEvidenceSource === 'precomputedCanonicalEvidence', 'profiles must reuse canonical precomputed evidence', results);
  PCRMT_assert_('duplicateCompaniesReadAvoided', smoke && smoke.meta && smoke.meta.duplicateCompaniesReadAvoided === true, 'normal context must avoid duplicate Companies read', results);

  var enriched = 0;
  if (smoke && smoke.demand && Array.isArray(smoke.demand.rows)) {
    enriched = smoke.demand.rows.filter(function(r){ return !!(r && (r.country || r.region || r.companyUid)); }).length;
  }
  PCRMT_assert_('demandReenrichedFromProfiles', !smoke.demand.rows.length || enriched > 0, 'demand should regain canonical company metadata from profiles', results);

  var lean = PlanningContextReadModel_get({
    from: period.from,
    to: period.to,
    includeAvailability: false,
    includeCompanies: false
  });
  PCRMT_assert_('availabilityOptional', lean && lean.availability === null, 'availability skip', results);
  PCRMT_assert_('companiesOptional', lean && lean.profiles && lean.profiles.meta && lean.profiles.meta.companyMeta && lean.profiles.meta.companyMeta.skipped === true, 'company profile skip', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_CONTEXT_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    period: period,
    smokeServerMs: smokeMs,
    demandRows: smoke && smoke.demand && smoke.demand.rows ? smoke.demand.rows.length : 0,
    companyProfiles: smoke && smoke.profiles && smoke.profiles.companies ? smoke.profiles.companies.length : 0,
    auditorProfiles: smoke && smoke.profiles && smoke.profiles.auditors ? smoke.profiles.auditors.length : 0,
    availabilityRows: smoke && smoke.availability && smoke.availability.rows ? smoke.availability.rows.length : 0,
    demandRowsEnrichedFromProfiles: smoke && smoke.meta ? smoke.meta.demandRowsEnrichedFromProfiles || 0 : 0,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
