/***********************************************************************
 * FILE: AcceptedNotificationReliabilityFallbackTests.js
 * BUILD: 2026-09-17_ACCEPTED_NOTIFICATION_RELIABILITY_FALLBACK_TESTS_R1
 ***********************************************************************/
var ANRF_TEST_BUILD='2026-09-17_ACCEPTED_NOTIFICATION_RELIABILITY_FALLBACK_TESTS_R1';
function RUN_ACCEPTED_NOTIFICATION_RELIABILITY_FALLBACK_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var run=String(AcceptedNotificationReliability_FallbackRun_);
  var load=String(AcceptedNotificationReliability_LoadEvidence_);
  var trigger=String(AcceptedNotificationReliability_Trigger1M);
  var install=String(RUN_INSTALL_ACCEPTED_NOTIFICATION_RELIABILITY_1M);
  t('durableStatusEvidenceRequired',load.indexOf("ANRF_norm_(row[c.status])!=='accepted'")>=0);
  t('durableDecisionEvidenceRequired',load.indexOf("ANRF_norm_(row[c.decision])!=='accept'")>=0);
  t('durableTimestampEvidenceRequired',load.indexOf('stamp.getTime()<cutoff')>=0);
  t('futureTimestampRejected',load.indexOf('Date.now()+300000')>=0);
  t('queueStateCheckedBeforeRepair',run.indexOf('AcceptedNotificationReconciler_GetRequiredEventState_')>=0);
  t('alreadyCompleteSkipped',run.indexOf("action:'SKIP_COMPLETE'")>=0);
  t('canonicalAuditContextUsed',run.indexOf('AcceptedNotificationReconciler_LoadAuditContext_')>=0);
  t('canonicalNotificationBridgeUsed',run.indexOf("StatusNotificationBridge_Dispatch_('ACCEPT','AUDITOR'")>=0);
  t('freshQueueProofAfterDispatch',run.indexOf('queue=AcceptedNotificationReconciler_LoadQueue_(q)')>=0&&run.indexOf("action:'REPAIRED'")>=0);
  t('dryRunHasNoDispatch',run.indexOf("if(dry){out.items.push")>=0&&run.indexOf("action:'DRYRUN_REPAIR_NEEDED'")>=0);
  t('combinedTriggerRunsPrimary',trigger.indexOf('AcceptedNotificationReconciler_Run_')>=0);
  t('combinedTriggerRunsFallback',trigger.indexOf('AcceptedNotificationReliability_FallbackRun_')>=0);
  t('installerRemovesOldPrimaryTrigger',install.indexOf('ANRF_PRIMARY_HANDLER')>=0&&install.indexOf('ScriptApp.deleteTrigger')>=0);
  t('installerRemovesLegacyTrigger',install.indexOf('ANRF_LEGACY_HANDLER')>=0);
  t('installerCreatesOneMinuteCombinedTrigger',install.indexOf("newTrigger(ANRF_TRIGGER_HANDLER).timeBased().everyMinutes(1).create()")>=0);
  t('noLifecycleWrite',run.indexOf('AuditLifecycleService')<0&&run.indexOf('setValue')<0&&run.indexOf('setValues')<0);
  t('noPlanningWrite',run.indexOf('PlanningCanonical')<0&&run.indexOf('ManagerPlanning')<0);
  t('noAvailabilityWrite',run.indexOf('AvailabilityService')<0&&run.indexOf('AvailabilityCommand')<0);
  var failed=r.filter(function(x){return!x.ok}).length;
  var out={ok:failed===0,build:ANRF_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReads:false,liveWrites:false,primaryRecoverySource:'LIFECYCLE_STATUS_CHANGED ACCEPT trail',fallbackRecoverySource:'Audit planning Last auditor decision + timestamp',requiredEvents:['AUDIT_ACCEPTED','ECAS_AUDIT_APPROVAL_DIGEST'],triggerTarget:'single combined 1-minute reliability trigger'}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
