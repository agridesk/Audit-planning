/***********************************************************************
 * PlanningWorkspaceSelfPlanningTests.js
 * BUILD: 2026-09-10_PLANNING_WORKSPACE_SELF_PLANNING_TEST_R2_SHARED_UI
 * Non-destructive contract regression. No live writes.
 ***********************************************************************/
var PLANNING_WORKSPACE_SELF_PLANNING_TEST_BUILD='2026-09-10_PLANNING_WORKSPACE_SELF_PLANNING_TEST_R2_SHARED_UI';
function RUN_PLANNING_WORKSPACE_SELF_PLANNING_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceSelfPlanningService_contract(),rpc=PlanningWorkspaceRpc_contract(),svc=PlanningWorkspaceService_contract();
  var client=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceSelfPlanningClient.js').getContent();
  var core=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceClient.js').getContent();
  var shell=HtmlService.createHtmlOutputFromFile('PlanningWorkspace').getContent();
  t('identityOwner',c.identityOwner==='ACTIVE_SESSION');
  t('entitlementOwner',c.entitlementOwner==='AuditorV5B_GetAuditorGrid_U20409.canPlan');
  t('canonicalCommitOwner',c.commitOwner==='PlanningCanonicalCommitService');
  t('actorRoleAuditor',c.actorRole==='AUDITOR');
  t('pendingPlanningToPendingApproval',c.statusRule==='PENDING_PLANNING_TO_PENDING_APPROVAL');
  t('browserCannotChooseAuditor',c.browserMayChooseAuditor===false);
  t('serverFiltersDemand',c.serverFiltersDemand===true&&rpc.meta.selfPlanningServerFilteredDemand===true&&svc.meta.selfPlanningServerFiltered===true);
  t('existingAuditorPortalPreserved',c.existingAuditorPortalPreserved===true);
  t('noNewSsot',c.newSsot===false);
  t('rpcContextEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningContext')>=0);
  t('rpcPreflightEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningPreflight')>=0);
  t('rpcCommitEndpoint',rpc.endpoints.indexOf('PlanningWorkspaceRpc_selfPlanningCommit')>=0);
  t('rpcIdentityPinned',rpc.meta.selfPlanningIdentityPinnedToSession===true);
  t('rpcCanonicalCommit',rpc.meta.selfPlanningUsesCanonicalCommit===true);
  t('rpcDevOnly',rpc.meta.selfPlanningDevOnly===true);
  t('rpcExplicitConfirmation',rpc.meta.selfPlanningExplicitConfirmation===true);
  t('serviceAdvisoryOwner',svc.endpoints.selfPlanningAdvisory==='PlanningWorkspaceSelfPlanningService_getAdvisory');
  t('serviceContextOwner',svc.endpoints.selfPlanningContext==='PlanningWorkspaceSelfPlanningService_context');
  t('serviceEvaluateOwner',svc.endpoints.selfPlanningEvaluate==='PlanningWorkspaceSelfPlanningService_evaluate');
  t('serviceCommitOwner',svc.endpoints.selfPlanningCommit==='PlanningWorkspaceSelfPlanningService_commit');
  t('rolePassedToAdvisory',core.indexOf('actorRole:String(state.ctx.role')>=0);
  t('auditorClientBuild',client.indexOf('PLANNING_WORKSPACE_SELF_PLANNING_CLIENT_R1')>=0);
  t('auditorSelectorLocked',client.indexOf('sel.disabled=true')>=0);
  t('auditorUsesDedicatedCommit',client.indexOf('PlanningWorkspaceRpc_selfPlanningCommit')>=0);
  t('managerApprovalMessage',client.indexOf('Pending Approval')>=0);
  t('shellIncludesAuditorClient',shell.indexOf('PlanningWorkspaceSelfPlanningClient.js')>=0);
  t('legacyPlanningPreserved',rpc.meta.legacyPlanningEntrypointsPreserved===true&&svc.meta.legacyPlanningEntrypointsPreserved===true);
  t('auditorPortalPreserved',rpc.meta.existingAuditorPortalPreserved===true&&svc.meta.existingAuditorPortalPreserved===true);
  var f=r.filter(function(x){return!x.ok;}).length,out={ok:f===0,build:PLANNING_WORKSPACE_SELF_PLANNING_TEST_BUILD,total:r.length,passed:r.length-f,failed:f,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,existingFunctionalityRemoved:false,sharedWorkspaceAuditorUi:true,serverFilteredDemand:true}};
  Logger.log(JSON.stringify(out,null,2));return out;
}
