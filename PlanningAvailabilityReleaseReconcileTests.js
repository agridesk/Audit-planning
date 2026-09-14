/***********************************************************************
 * PlanningAvailabilityReleaseReconcileTests.js
 * BUILD: 2026-09-14_AVAILABILITY_RELEASE_RECONCILE_TESTS_R1
 ***********************************************************************/
var PLANNING_AVAILABILITY_RELEASE_RECONCILE_TEST_BUILD='2026-09-14_AVAILABILITY_RELEASE_RECONCILE_TESTS_R1';
function RUN_PLANNING_AVAILABILITY_RELEASE_RECONCILE_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var rec=String(AvailabilityServiceReleaseReconciler_reconcile),adapter=String(PlanningCanonicalAvailabilityAdapter_release),modify=String(PlanningCanonicalModifyService_modify),guard=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceModifyWindowGuard.js').getContent();
  t('reconcilerTargetedByAuditor',rec.indexOf('createTextFinder(email)')>=0);
  t('reconcilerLimitedToOldDates',rec.indexOf('wanted[date]')>=0&&rec.indexOf('blocks.forEach')>=0);
  t('reconcilerOnlyAnonymousNo',rec.indexOf("avail!=='NO'||id1||id2||st1||st2||s1||e1||s2||e2")>=0);
  t('reconcilerSetsAvailableYes',rec.indexOf("row[cAvail]='YES'")>=0);
  t('reconcilerPreservesExplicitBlocks',rec.indexOf('preservesExplicitBlocks:true')>=0);
  t('adapterCallsReconcilerAfterClear',adapter.indexOf('AvailabilityService.clearAuditId')>=0&&adapter.indexOf('AvailabilityServiceReleaseReconciler_reconcile')>adapter.indexOf('AvailabilityService.clearAuditId'));
  t('modifyPassesOldCanonicalContext',modify.indexOf('auditorEmail:old.auditorEmail||old.assigned,blocks:old.blocks')>=0);
  t('rollbackReleasePassesNewContext',modify.indexOf('auditorEmail:email||old.assigned,blocks:blocks')>=0);
  t('provisionalCurrentAuditLabelsPresent',guard.indexOf('applyProvisionalCurrentLabels')>=0&&guard.indexOf('provisionalCurrentDateSet')>=0);
  t('noNewSsot',rec.indexOf('newSsot:false')>=0);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_AVAILABILITY_RELEASE_RECONCILE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Canonical Modify release reconciles only anonymous legacy NO rows on the old canonical planning dates; explicit/manual/default blocks and remaining audits are preserved.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
