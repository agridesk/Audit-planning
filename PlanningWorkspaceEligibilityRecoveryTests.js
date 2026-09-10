/***********************************************************************
 * PlanningWorkspaceEligibilityRecoveryTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_ELIGIBILITY_RECOVERY_TEST_R1_BOUNDED_WAVES
 ***********************************************************************/
var PLANNING_WORKSPACE_ELIGIBILITY_RECOVERY_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_ELIGIBILITY_RECOVERY_TEST_R1_BOUNDED_WAVES';
function RUN_PLANNING_WORKSPACE_ELIGIBILITY_RECOVERY_REGRESSION(){
  var r=[];
  function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var src=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceEligibilityRecovery.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('buildR2',src.indexOf('ELIGIBILITY_RECOVERY_CLIENT_R2_BOUNDED_WAVES')>=0);
  t('batchFive',src.indexOf('BATCH_SIZE=5')>=0);
  t('waveTwenty',src.indexOf('MAX_PER_WAVE=20')>=0);
  t('pageBound',src.indexOf('MAX_PER_PAGE=100')>=0);
  t('reloadBetweenWaves',src.indexOf('reloadForNextWave')>=0&&src.indexOf('PlanningWorkspaceClient.load')>=0);
  t('waveCounterResets',src.indexOf('waveCount=0')>=0);
  t('processedNotReset',src.indexOf('processed={}')>=0&&src.indexOf('processed[id]=true')>=0);
  t('remainingContinuesWithinWave',src.indexOf('remaining.length&&waveCount<MAX_PER_WAVE')>=0);
  t('boundedContract',src.indexOf('bounded:true')>=0&&src.indexOf('processedOncePerPage:true')>=0);
  t('shellIncludesRecovery',shell.indexOf('PlanningWorkspaceEligibilityRecovery.js')>=0);
  t('existingRpcPreserved',src.indexOf('PlanningWorkspaceRpc_refreshEligibility')>=0);
  t('noCanonicalWrite',src.indexOf('PlanningCanonicalCommitService')<0);
  t('noSheetAccess',src.indexOf('SpreadsheetApp')<0);
  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_ELIGIBILITY_RECOVERY_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,boundedRecovery:true,multiWave:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
