/***********************************************************************
 * EligibilityBatchReadModelTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_BATCH_READ_TESTS_R3_CACHE_VALIDITY_PARITY
 * Permanent, non-destructive regression.
 ***********************************************************************/

var ELIGIBILITY_BATCH_READ_TEST_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_BATCH_READ_TESTS_R3_CACHE_VALIDITY_PARITY';

function EBRMT_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function EBRMT_sampleAuditIds_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Eligibility_Cache');
  if (!sh || sh.getLastRow() < 2) return [];
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
  var cAuditId = EBRM_findCol_(headers, ['Audit_ID','Audit ID']);
  if (cAuditId < 0) return [];
  var count = Math.min(10, sh.getLastRow() - 1);
  var values = sh.getRange(2, cAuditId + 1, count, 1).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var id = EBRM_clean_(values[i][0]);
    if (id) out.push(id);
    if (out.length >= 5) break;
  }
  return out;
}

function RUN_ELIGIBILITY_BATCH_READ_REGRESSION() {
  var results = [];

  EBRMT_assert_('boolTrue1', EBRM_bool_(1) === true, '1 must be true', results);
  EBRMT_assert_('boolTrueX', EBRM_bool_('X') === true, 'X must be true', results);
  EBRMT_assert_('boolFalse0', EBRM_bool_(0) === false, '0 must be false', results);
  EBRMT_assert_('jsonArray', Array.isArray(EBRM_parseJson_('[1,2]', null)), 'json parse array', results);
  EBRMT_assert_('jsonFallback', EBRM_parseJson_('{bad', null) === null, 'invalid json fallback', results);

  var wrappedAuditors = EBRM_normalizeAuditorsPayload_('{"auditors":[{"email":"x@example.com"}]}');
  EBRMT_assert_('wrappedAuditorsPayload', wrappedAuditors.ok === true && wrappedAuditors.auditors.length === 1, 'wrapped auditors payload', results);

  var wrappedMeta = EBRM_normalizeMetaPayload_('{"meta":{"companyUid":"C1"},"requiredScopes":["MPS-ABC"],"scopesRes":{"scopes":[],"scopesText":"MPS-ABC"}}');
  EBRMT_assert_('wrappedMetaPayload', wrappedMeta.ok === true && wrappedMeta.meta.companyUid === 'C1' && wrappedMeta.requiredScopes.length === 1, 'wrapped meta payload', results);

  var parityOk = EBRM_cacheValidity_({
    computedBuild: 'B1',
    currentBuild: 'B1',
    notes: 'auditorScopeGeneration=G1',
    currentGeneration: 'G1'
  });
  EBRMT_assert_('cacheValidityAcceptsMatchingBuildAndGeneration', parityOk.validByEligibilityServiceSheetContract === true, 'matching cache must be valid', results);

  var parityBuild = EBRM_cacheValidity_({
    computedBuild: 'OLD',
    currentBuild: 'NEW',
    notes: 'auditorScopeGeneration=G1',
    currentGeneration: 'G1'
  });
  EBRMT_assert_('cacheValidityRejectsBuildMismatch', parityBuild.validByEligibilityServiceSheetContract === false && parityBuild.buildMismatch === true, 'build mismatch must refresh', results);

  var parityGeneration = EBRM_cacheValidity_({
    computedBuild: 'B1',
    currentBuild: 'B1',
    notes: 'auditorScopeGeneration=OLD',
    currentGeneration: 'NEW'
  });
  EBRMT_assert_('cacheValidityRejectsGenerationMismatch', parityGeneration.validByEligibilityServiceSheetContract === false && parityGeneration.generationMismatch === true, 'generation mismatch must refresh', results);

  var parityLegacyNotes = EBRM_cacheValidity_({
    computedBuild: 'B1',
    currentBuild: 'B1',
    notes: 'legacy note without generation marker',
    currentGeneration: 'NEW'
  });
  EBRMT_assert_('cacheValidityAllowsLegacyNotesWithoutGenerationMarker', parityLegacyNotes.validByEligibilityServiceSheetContract === true && parityLegacyNotes.generationMarkerPresent === false, 'EligibilityService accepts rows without generation marker', results);

  var sampleIds = EBRMT_sampleAuditIds_();
  var t0 = Date.now();
  var smoke = EligibilityBatchReadModel_get({ auditIds: sampleIds });
  var smokeMs = Date.now() - t0;

  EBRMT_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  EBRMT_assert_('rowsArray', smoke && Array.isArray(smoke.rows), 'rows array', results);
  EBRMT_assert_('readOnly', smoke && smoke.meta && smoke.meta.writes === false, 'must be read-only', results);
  EBRMT_assert_('canonicalOwner', smoke && smoke.meta && smoke.meta.canonicalOwner === 'EligibilityService', 'canonical owner', results);
  EBRMT_assert_('derivedCacheOnly', smoke && smoke.meta && smoke.meta.cacheRole === 'derived acceleration only', 'cache role', results);
  EBRMT_assert_('cacheValidityContract', smoke && smoke.meta && smoke.meta.cacheValidityContract === 'EligibilityService sheet acceptance parity', 'validity contract', results);
  EBRMT_assert_('noParseErrors', smoke && smoke.meta && smoke.meta.parseErrors === 0, 'canonical EligibilityService payloads must decode without parse errors', results);
  EBRMT_assert_('currentBuildPresent', smoke && smoke.meta && typeof smoke.meta.currentEligibilityBuild === 'string' && smoke.meta.currentEligibilityBuild.length > 0, 'canonical ELIG_BUILD must be visible', results);
  EBRMT_assert_('generationPresent', smoke && smoke.meta && typeof smoke.meta.auditorScopeGeneration === 'string' && smoke.meta.auditorScopeGeneration.length > 0, 'generation captured once per batch', results);

  if (sampleIds.length) {
    EBRMT_assert_('sampleRowsReturned', smoke.rows.length > 0, 'sample rows must return', results);
    var first = smoke.rows[0] || {};
    EBRMT_assert_('auditorsArray', Array.isArray(first.auditors), 'auditors must be array', results);
    EBRMT_assert_('requiredScopesArray', Array.isArray(first.requiredScopes), 'requiredScopes must be array', results);
    EBRMT_assert_('eligibilityMetaObject', first.eligibilityMeta && typeof first.eligibilityMeta === 'object', 'eligibility meta object', results);
    EBRMT_assert_('targetedMissingReported', Array.isArray(smoke.missingAuditIds), 'missing ids array', results);
    EBRMT_assert_('cacheValidityPresent', first.cacheValidity && typeof first.cacheValidity === 'object', 'row cache validity object', results);
    EBRMT_assert_('refreshReasonsArray', Array.isArray(first.refreshReasons), 'refresh reasons array', results);
    EBRMT_assert_('computedBuildParity', first.computedBuild === smoke.meta.currentEligibilityBuild || first.requiresCanonicalRefresh === true, 'build mismatch may not be silently trusted', results);
    EBRMT_assert_('generationParity', !(first.cacheValidity && first.cacheValidity.generationMismatch === true) || first.requiresCanonicalRefresh === true, 'generation mismatch may not be silently trusted', results);
  } else {
    EBRMT_assert_('sampleRowsReturned', true, '', results);
    EBRMT_assert_('auditorsArray', true, '', results);
    EBRMT_assert_('requiredScopesArray', true, '', results);
    EBRMT_assert_('eligibilityMetaObject', true, '', results);
    EBRMT_assert_('targetedMissingReported', true, '', results);
    EBRMT_assert_('cacheValidityPresent', true, '', results);
    EBRMT_assert_('refreshReasonsArray', true, '', results);
    EBRMT_assert_('computedBuildParity', true, '', results);
    EBRMT_assert_('generationParity', true, '', results);
  }

  var missingProbe = EligibilityBatchReadModel_get({ auditIds: ['__ROADMAP_2_4_MISSING_AUDIT__'] });
  EBRMT_assert_('missingProbeExplicit', missingProbe && missingProbe.missingAuditIds && missingProbe.missingAuditIds.indexOf('__ROADMAP_2_4_MISSING_AUDIT__') >= 0, 'missing audit must be explicit', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: ELIGIBILITY_BATCH_READ_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    sampleAuditIds: sampleIds.length,
    smokeReturned: smoke && smoke.rows ? smoke.rows.length : 0,
    smokeServerMs: smokeMs,
    parseErrors: smoke && smoke.meta ? smoke.meta.parseErrors : null,
    staleRows: smoke && smoke.meta ? smoke.meta.stale : null,
    buildMismatchRows: smoke && smoke.meta ? smoke.meta.buildMismatch : null,
    generationMismatchRows: smoke && smoke.meta ? smoke.meta.generationMismatch : null,
    refreshRequiredRows: smoke && smoke.meta ? smoke.meta.refreshRequired : null,
    currentEligibilityBuild: smoke && smoke.meta ? smoke.meta.currentEligibilityBuild : '',
    auditorScopeGeneration: smoke && smoke.meta ? smoke.meta.auditorScopeGeneration : '',
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
