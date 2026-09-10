/***********************************************************************
 * PlanningWorkspaceSelfPlanningTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_SELF_PLANNING_TEST_R1
 * Non-destructive contract regression. No live writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_SELF_PLANNING_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_SELF_PLANNING_TEST_R1';
function RUN_PLANNING_WORKSPACE_SELF_PLANNING_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceSelfPlanningService_contract(),rpc=PlanningWorkspaceRpc_contract(),svc=PlanningWorkspaceService_contract();
  t('identityOwner',c.identityOwner==='ACTIVE_SESSION');
  t('entitlementOwner',c.entitlementOwner==='AuditorV5B_GetAuditorGrid_U20409.canPlan');
  t('canonicalCommitOwner',c.commitOwner==='PlanningCanonicalCommitService');
  t('actorRoleAuditor',c.actorRole==='AUDITOR');
  t('pendingPlanningToPendingApproval',c.statusRule==='PENDING_PLANNING_TO_PENDING_APPROVAL');
  t('browserCannotChooseAuditor',c.browserMayChooseAuditor===false);
  t('existingAuditorPortalPreserved',c.existingAuditorPortalPreserved===true);
  t('noNewSsot',c.newSsot===false);
  t('rpcContextEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningContext')>=0);
  t('rpcPreflightEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningPreflight')>=0);
  t('rpcCommitEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningCommit')>=0);
  t('rpcIdentityPinned',rpc.meta.selfPlanningIdentityPinnedToSession===true);
  t('rpcCanonicalCommit',rpc.meta.selfPlanningUsesCanonicalCommit===true);
  t('rpcDevOnly',rpc.meta.selfPlanningDevOnly===true);
  t('rpcExplicitConfirmation',rpc.meta.selfPlanningExplicitConfirmation===true);
  t('serviceContextOwner',svc.endpoints.selfPlanningContext==='PlanningWorkspaceSelfPlanningService_context');
  t('serviceEvaluateOwner',svc.endpoints.selfPlanningEvaluate==='PlanningWorkspaceSelfPlanningService_evaluate');
  t('serviceCommitOwner',svc.endpoints.selfPlanningCommit==='PlanningWorkspaceSelfPlanningService_commit');
  t('legacyPlanningPreserved',rpc.meta.legacyPlanningEntrypointsPreserved===true&&svc.meta.legacyPlanningEntrypointsPreserved===true);
  t('auditorPortalPreserved',rpc.meta.existingAuditorPortalPreserved===true&&svc.meta.existingAuditorPortalPreserved===true);
  var f=r.filter(function(x){return!x.ok;}).length,out={ok:f===0,build:PLANNING_WORKSPACE_SELF_PLANNING_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
