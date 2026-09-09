/***********************************************************************
 * EligibilityCacheMigrationWarmerTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_CACHE_MIGRATION_WARMER_TESTS_R1
 * Permanent, non-destructive regression.
 ***********************************************************************/

var ELIGIBILITY_CACHE_MIGRATION_WARMER_TEST_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_CACHE_MIGRATION_WARMER_TESTS_R1';

function ECMWT_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name: name, ok: ok, detail: ok ? '' : String(detail || 'failed') });
}

function RUN_ELIGIBILITY_CACHE_MIGRATION_WARMER_REGRESSION() {
  var results = [];

  var dedup = ECMW_uniqueIds_(['A','A','','B',' B ','C']);
  ECMWT_assert_('dedupesAuditIds', dedup.length === 3 && dedup[0] === 'A' && dedup[1] === 'B' && dedup[2] === 'C', 'dedupe', results);

  var seg = ECMW_segment_(['A','B','C','D'], 3, 3);
  ECMWT_assert_('segmentBounded', seg.ids.length === 3, 'segment len', results);
  ECMWT_assert_('segmentWraps', seg.ids[0] === 'D' && seg.ids[1] === 'A' && seg.ids[2] === 'B' && seg.wrapped === true && seg.next === 2, 'wrap', results);

  var loaded = ECMW_loadAuditIds_();
  ECMWT_assert_('auditPlanningIdsAvailable', loaded && Array.isArray(loaded.ids) && loaded.ids.length > 0, 'ids available', results);
  ECMWT_assert_('singleBulkReadShape', loaded.rowsRead > 0 && loaded.colsRead > 0, 'bulk shape', results);

  var probeIds = loaded.ids.slice(0, Math.min(10, loaded.ids.length));
  var t0 = Date.now();
  var smoke = EligibilityCacheMigrationWarmer_run({ auditIds: probeIds, dryRun: true, maxScan: 10, maxRefresh: 2 });
  var smokeMs = Date.now() - t0;

  ECMWT_assert_('serviceSuccess', smoke && smoke.success === true, 'service success', results);
  ECMWT_assert_('dryRun', smoke && smoke.dryRun === true, 'dry run', results);
  ECMWT_assert_('suppliedIdsAvoidSecondPlanningRead', smoke && smoke.source === 'suppliedAuditIds', 'source supplied', results);
  ECMWT_assert_('backgroundOnly', smoke && smoke.meta && smoke.meta.backgroundOnly === true, 'background only', results);
  ECMWT_assert_('hotPathForbidden', smoke && smoke.meta && smoke.meta.hotPathForbidden === true, 'hot path forbidden', results);
  ECMWT_assert_('bounded', smoke && smoke.meta && smoke.meta.bounded === true, 'bounded', results);
  ECMWT_assert_('maxRefreshBounded', smoke && smoke.meta && smoke.meta.maxRefresh === 2, 'max refresh', results);
  ECMWT_assert_('noBusinessTruthWrites', smoke && smoke.meta && smoke.meta.writesBusinessTruth === false && smoke.meta.lifecycleWrites === false && smoke.meta.planningWrites === false && smoke.meta.availabilityWrites === false && smoke.meta.statusWrites === false, 'no business writes', results);
  ECMWT_assert_('canonicalDelegation', smoke && smoke.meta && String(smoke.meta.canonicalOwner || '').indexOf('EligibilityTargetedRefreshService_refresh') >= 0, 'delegation', results);
  ECMWT_assert_('conceptRefreshIdsReusable', smoke && smoke.meta && smoke.meta.callerCanReuseConceptRefreshIds === true, 'reuse ids', results);
  ECMWT_assert_('targetedRefreshDryRun', smoke && smoke.refresh && smoke.refresh.dryRun === true, 'delegate dry-run', results);
  ECMWT_assert_('selectedAtMostTwo', smoke && smoke.refresh && smoke.refresh.selected <= 2, 'selected bound', results);
  ECMWT_assert_('noRefreshWritesDuringRegression', smoke && smoke.refresh && smoke.refresh.refreshed === 0, 'no writes', results);

  var passed = results.filter(function(x) { return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: ELIGIBILITY_CACHE_MIGRATION_WARMER_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    smokeServerMs: smokeMs,
    auditPlanningRowsRead: loaded.rowsRead,
    auditPlanningColsRead: loaded.colsRead,
    probeAuditIds: probeIds.length,
    selected: smoke && smoke.refresh ? smoke.refresh.selected : null,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
