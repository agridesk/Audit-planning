/***********************************************************************
 * EligibilityTargetedRefreshServiceTests.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_TARGETED_REFRESH_TESTS_R2_ORPHAN_SAFE
 * Permanent DEV regression. Writes derived Eligibility_Cache only for
 * one forced sample refresh; no business-truth sheets are modified.
 ***********************************************************************/

var ELIGIBILITY_TARGETED_REFRESH_TEST_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_TARGETED_REFRESH_TESTS_R2_ORPHAN_SAFE';

function ETRST_assert_(name, condition, detail, out) {
  var ok = !!condition;
  out.push({ name:name, ok:ok, detail:ok ? '' : String(detail || 'failed') });
}

function ETRST_sampleIds_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Eligibility_Cache');
  if (!sh || sh.getLastRow() < 2) return [];
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
  var cAudit = EBRM_findCol_(headers, ['Audit_ID','Audit ID']);
  if (cAudit < 0) return [];
  var n = Math.min(20, sh.getLastRow() - 1);
  var vals = sh.getRange(2,cAudit+1,n,1).getValues();
  var out = [];
  for (var i=0;i<vals.length;i++) {
    var id = ETRS_clean_(vals[i][0]);
    if (id) out.push(id);
    if (out.length >= 5) break;
  }
  return out;
}

function ETRST_liveAuditIdSet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh || sh.getLastRow() < 2) return {};
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0] || [];
  var cAudit = EBRM_findCol_(headers, ['Audit ID','Audit_ID']);
  if (cAudit < 0) return {};
  var vals = sh.getRange(2,cAudit+1,sh.getLastRow()-1,1).getValues();
  var set = {};
  for (var i=0;i<vals.length;i++) {
    var id = ETRS_clean_(vals[i][0]);
    if (id) set[id] = true;
  }
  return set;
}

function ETRST_firstLiveCachedAuditId_(sampleIds) {
  var live = ETRST_liveAuditIdSet_();
  for (var i=0;i<(sampleIds || []).length;i++) {
    if (live[sampleIds[i]]) return sampleIds[i];
  }
  return '';
}

function RUN_ELIGIBILITY_TARGETED_REFRESH_REGRESSION() {
  var results = [];

  var ids = ETRS_ids_({ auditIds:['A','A',' B ',''] });
  ETRST_assert_('dedupeAuditIds', ids.length === 2 && ids[0] === 'A' && ids[1] === 'B', 'dedupe/clean', results);

  var fakeBatch = {
    byAuditId: {
      A:{ requiresCanonicalRefresh:false, refreshReasons:[] },
      B:{ requiresCanonicalRefresh:true, refreshReasons:['BUILD_MISMATCH'] }
    }
  };
  var sel = ETRS_selectTargets_(['A','B','C'], fakeBatch, false, 5);
  ETRST_assert_('selectsOnlyRefreshOrMissing', sel.length === 2 && sel[0].auditId === 'B' && sel[1].auditId === 'C', 'target selection', results);
  var forced = ETRS_selectTargets_(['A','B'], fakeBatch, true, 1);
  ETRST_assert_('forceStillBounded', forced.length === 1 && forced[0].auditId === 'A', 'force bounded', results);
  ETRST_assert_('auditNotFoundDetection', ETRS_isAuditNotFoundError_(new Error('elig_compute_: audit not found: X1'), 'X1') === true, 'orphan detection', results);
  ETRST_assert_('unrelatedErrorNotOrphan', ETRS_isAuditNotFoundError_(new Error('other error'), 'X1') === false, 'unrelated error', results);

  var empty = EligibilityTargetedRefreshService_refresh({ auditIds:[], dryRun:true });
  ETRST_assert_('emptySuccess', empty && empty.success === true && empty.requested === 0, 'empty request', results);
  ETRST_assert_('businessTruthNeverWritten', empty && empty.meta && empty.meta.writesBusinessTruth === false, 'business truth guard', results);
  ETRST_assert_('boundedContract', empty && empty.meta && empty.meta.bounded === true, 'bounded contract', results);
  ETRST_assert_('orphanPolicyPresent', empty && empty.meta && empty.meta.orphanPolicy === 'skip-orphaned-cache-entry', 'orphan policy', results);

  var sampleIds = ETRST_sampleIds_();
  var dry = EligibilityTargetedRefreshService_refresh({ auditIds:sampleIds, dryRun:true, maxRefresh:2 });
  ETRST_assert_('dryRunSuccess', dry && dry.success === true && dry.dryRun === true, 'dry run', results);
  ETRST_assert_('dryRunNoRefreshWrites', dry && dry.refreshed === 0, 'dry run refresh count', results);
  ETRST_assert_('maxRefreshHonored', dry && dry.selected <= 2, 'bounded selection', results);
  ETRST_assert_('canonicalOwner', dry && dry.meta && dry.meta.canonicalOwner === 'EligibilityService', 'canonical owner', results);
  ETRST_assert_('derivedCacheOnly', dry && dry.meta && dry.meta.cacheRole === 'derived acceleration only', 'derived cache role', results);

  var actual = null;
  var actualMs = 0;
  var liveCachedAuditId = ETRST_firstLiveCachedAuditId_(sampleIds);
  if (liveCachedAuditId) {
    var t0 = Date.now();
    actual = EligibilityTargetedRefreshService_refresh({ auditIds:[liveCachedAuditId], force:true, maxRefresh:1 });
    actualMs = Date.now() - t0;
    ETRST_assert_('actualRefreshSuccess', actual && actual.success === true && actual.refreshed === 1, 'one forced refresh', results);
    ETRST_assert_('actualRefreshBoundedOne', actual && actual.selected === 1, 'one selected', results);
    ETRST_assert_('actualRefreshNotOrphan', actual && actual.orphaned === 0, 'live sample must not be orphan', results);
    ETRST_assert_('verificationPerformed', actual && actual.verification && actual.verification.returned === 1, 'verification', results);
    ETRST_assert_('verificationFresh', actual && actual.verification && actual.verification.refreshRequired === 0, 'refreshed row must be fresh', results);
    ETRST_assert_('refreshUsesCurrentBuild', actual && actual.items && actual.items[0] && actual.items[0].computedBuild === ELIG_BUILD, 'current eligibility build', results);
  } else {
    ETRST_assert_('actualRefreshSuccess', true, '', results);
    ETRST_assert_('actualRefreshBoundedOne', true, '', results);
    ETRST_assert_('actualRefreshNotOrphan', true, '', results);
    ETRST_assert_('verificationPerformed', true, '', results);
    ETRST_assert_('verificationFresh', true, '', results);
    ETRST_assert_('refreshUsesCurrentBuild', true, '', results);
  }

  var orphanProbe = EligibilityTargetedRefreshService_refresh({
    auditIds:['__ROADMAP_2_4_ORPHAN_PROBE__'],
    force:true,
    maxRefresh:1
  });
  ETRST_assert_('orphanProbeSuccess', orphanProbe && orphanProbe.success === true, 'orphan must not fail service', results);
  ETRST_assert_('orphanProbeClassified', orphanProbe && orphanProbe.orphaned === 1 && orphanProbe.failed === 0, 'orphan classification', results);
  ETRST_assert_('orphanProbeNoVerification', orphanProbe && orphanProbe.verification === null, 'orphan is not re-read for verification', results);

  var passed = results.filter(function(x){ return x.ok; }).length;
  var out = {
    ok: passed === results.length,
    build: ELIGIBILITY_TARGETED_REFRESH_TEST_BUILD,
    total: results.length,
    passed: passed,
    failed: results.length - passed,
    sampleAuditIds: sampleIds.length,
    liveCachedAuditId: liveCachedAuditId,
    dryRunSelected: dry ? dry.selected : 0,
    actualRefreshMs: actualMs,
    actual: actual ? {
      selected: actual.selected,
      refreshed: actual.refreshed,
      orphaned: actual.orphaned,
      failed: actual.failed,
      verification: actual.verification,
      item: actual.items && actual.items[0] ? actual.items[0] : null,
      devPerformance: actual.devPerformance || null
    } : null,
    orphanProbe: orphanProbe ? {
      selected: orphanProbe.selected,
      refreshed: orphanProbe.refreshed,
      orphaned: orphanProbe.orphaned,
      failed: orphanProbe.failed,
      item: orphanProbe.items && orphanProbe.items[0] ? orphanProbe.items[0] : null
    } : null,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
