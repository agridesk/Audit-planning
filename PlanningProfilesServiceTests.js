/***********************************************************************
 * PlanningProfilesServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_PLANNING_PROFILES_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var PLANNING_PROFILES_TEST_BUILD = '2026-09-09_ROADMAP_2_4_PLANNING_PROFILES_TESTS_R1';

function PPST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function RUN_PLANNING_PROFILES_REGRESSION() {
  var results = [];

  PPST_assert_('normEmail', PPS_email_(' TEST@Example.COM ') === 'test@example.com', 'email normalization', results);
  PPST_assert_('keyNormalization', PPS_key_('Company A B.V.') === 'companyabv', 'key normalization', results);

  var set = PPS_requestedSet_(['A@EXAMPLE.COM','a@example.com','b@example.com'], PPS_email_);
  PPST_assert_('requestedSetDedupes', set && Object.keys(set).length === 2, 'dedupe', results);

  var t0 = Date.now();
  var smoke = PlanningProfilesService_get({});
  var smokeMs = Date.now() - t0;

  PPST_assert_('realDataSuccess', smoke && smoke.success === true, 'service success', results);
  PPST_assert_('companiesArray', smoke && Array.isArray(smoke.companies), 'companies array', results);
  PPST_assert_('auditorsArray', smoke && Array.isArray(smoke.auditors), 'auditors array', results);
  PPST_assert_('readOnlyContract', smoke && smoke.meta && smoke.meta.writes === false, 'must be read-only', results);
  PPST_assert_('companyOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.company === 'Companies', 'company owner', results);
  PPST_assert_('auditorOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.auditor === 'Auditors', 'auditor owner', results);
  PPST_assert_('scopeOwner', smoke && smoke.meta && smoke.meta.canonicalOwners && smoke.meta.canonicalOwners.scope === 'Config_Scopes', 'scope owner', results);

  var targetedCompany = null;
  if (smoke.companies && smoke.companies.length) {
    var c = smoke.companies[0];
    targetedCompany = PlanningProfilesService_get({
      companyUids: c.companyUid ? [c.companyUid] : [],
      companyNames: c.companyName ? [c.companyName] : [],
      includeAuditors: false
    });
    PPST_assert_('targetedCompanyReturns', targetedCompany && targetedCompany.companies && targetedCompany.companies.length >= 1, 'targeted company', results);
  } else {
    PPST_assert_('targetedCompanyReturns', true, '', results);
  }

  var targetedAuditor = null;
  if (smoke.auditors && smoke.auditors.length) {
    var a = smoke.auditors[0];
    targetedAuditor = PlanningProfilesService_get({ auditorEmails: [a.email], includeCompanies: false });
    PPST_assert_('targetedAuditorReturns', targetedAuditor && targetedAuditor.auditors && targetedAuditor.auditors.length === 1, 'targeted auditor', results);
  } else {
    PPST_assert_('targetedAuditorReturns', true, '', results);
  }

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: PLANNING_PROFILES_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    smokeCompanies: smoke && smoke.companies ? smoke.companies.length : 0,
    smokeAuditors: smoke && smoke.auditors ? smoke.auditors.length : 0,
    smokeServerMs: smokeMs,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
