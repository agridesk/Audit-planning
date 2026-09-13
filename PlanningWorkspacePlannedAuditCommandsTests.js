/***********************************************************************
 * PlanningWorkspacePlannedAuditCommandsTests.js
 * BUILD: 2026-09-13_WORKSPACE_PLANNED_AUDIT_COMMANDS_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_PLANNED_AUDIT_COMMANDS_TEST_BUILD='2026-09-13_WORKSPACE_PLANNED_AUDIT_COMMANDS_TESTS_R1';
function RUN_PLANNING_WORKSPACE_PLANNED_AUDIT_COMMANDS_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var rpc=PlanningWorkspaceRpc_contract(),svc=PlanningWorkspaceService_contract();
  var cancelSrc=String(PlanningCanonicalCancelService_cancel);
  var modifySrc=String(PlanningCanonicalModifyService_modify);

  t('rpcModifyEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_modifyPlanned')>=0);
  t('rpcCancelEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_cancelPlanned')>=0);
  t('serviceModifyOwner',svc.endpoints.modifyPlanned==='PlanningCanonicalModifyService_modify',svc.endpoints.modifyPlanned);
  t('serviceCancelOwner',svc.endpoints.cancelPlanned==='PlanningCanonicalCancelService_cancel',svc.endpoints.cancelPlanned);
  t('commandRevisionHydration',rpc.meta.plannedCommandRevisionHydration===true);

  t('cancelRequiresReason',cancelSrc.indexOf("reason is required")>=0);
  t('cancelRevisionGuard',cancelSrc.indexOf('PlanningRevisionTokenService_get')>=0&&cancelSrc.indexOf('PlanningOptimisticRevisionGuard_evaluate')>=0);
  t('cancelUsesStatusMachine',cancelSrc.indexOf("Status_applyAction('MANAGER','CANCEL'")>=0);
  t('cancelReturnsPendingPlanningContract',cancelSrc.indexOf("canonicalTargetStatus:'Pending Planning'")>=0);
  t('cancelDoesNotDirectlyWriteSheets',cancelSrc.indexOf('setValue(')<0&&cancelSrc.indexOf('setValues(')<0);

  t('modifyCanonicalPreflight',modifySrc.indexOf('PlanningCommitGateService_evaluateLocked_')>=0);
  t('modifySameAuditorR1',modifySrc.indexOf('AUDITOR_CHANGE_NOT_SUPPORTED_R1')>=0);
  t('modifyApprovedAllowed',modifySrc.indexOf("status!=='APPROVED'&&status!=='PENDING_APPROVAL'")>=0);
  t('modifyAcceptedBlockedPendingPolicy',modifySrc.indexOf('ACCEPTED_MODIFY_REQUIRES_REACCEPTANCE_POLICY')>=0);
  t('modifyReleasesOldAvailability',modifySrc.indexOf('PlanningCanonicalAvailabilityAdapter_release')>=0);
  t('modifyReservesNewAvailability',modifySrc.indexOf('PlanningCanonicalAvailabilityAdapter_reserve')>=0);
  t('modifyRestoresOldOnReserveFailure',modifySrc.indexOf('restoreAfterReserveFail=PCMOD_restore_')>=0);
  t('modifyRestoresOldOnWriteFailure',modifySrc.indexOf('restoreAfterWriteFail=PCMOD_restore_')>=0);
  t('modifyUsesCanonicalRowWriter',modifySrc.indexOf('PlanningCanonicalRowWriter_execute')>=0);
  t('modifyPreservesStatus',modifySrc.indexOf('PCMOD_transition_(rowInfo.status)')>=0&&modifySrc.indexOf('statusPreserved:true')>=0);
  t('modifyMarksNotificationGap',modifySrc.indexOf('notificationRequired:')>=0&&modifySrc.indexOf('notificationDispatched:false')>=0);
  t('modifyNoNewSsot',modifySrc.indexOf('newSsot:false')>=0);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_WORKSPACE_PLANNED_AUDIT_COMMANDS_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,liveReadsPerformed:false,liveWritesPerformed:false,cancel:'Manager CANCEL uses StatusMachine, releases Availability and returns the audit to Pending Planning.',modifyR1:'Date/time blocks only; same auditor; Pending Approval and Approved only. Accepted is intentionally blocked until re-acceptance/notification policy is implemented.',next:'After regression passes, wire safe Workspace UI actions and then define Accepted re-acceptance behavior before enabling modify for Accepted.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
