/***********************************************************************
 * PlanningWorkspaceOperationalActionsContractTests.js
 * BUILD: 2026-09-23_AMS03_PHASE5_OPERATIONAL_ACTIONS_R2_UI_CHAIN
 ***********************************************************************/
var AMS03_PHASE5_ACTIONS_BUILD='2026-09-23_AMS03_PHASE5_OPERATIONAL_ACTIONS_R2_UI_CHAIN';
function RUN_AMS03_PHASE5_OPERATIONAL_ACTIONS_CONTRACT(){
 var s=PlanningWorkspaceService_contract(),r=PlanningWorkspaceRpc_contract(),m=String(PlanningCanonicalModifyService_modify),c=String(PlanningCanonicalCancelService_cancel),b=PlanningBatchCommitService_contract(),p=String(getPlanningReAdjustModelCPolicyV5),ui=HtmlService.createTemplateFromFile('PlanningWorkspacePlannedAuditActions.js').getRawContent(),guard=HtmlService.createTemplateFromFile('PlanningWorkspaceModifyWindowGuard.js').getRawContent(),x=[];function q(n,v){x.push({name:n,ok:!!v});}
 q('plannedDetailOnDemand',s.meta.plannedDetailOnDemand===true&&r.meta.plannedDetailOnDemand===true);
 q('modifyCanonicalCommand',s.meta.canonicalModifyCommand===true&&r.meta.modifyPlannedCanonicalCommand===true);
 q('cancelCanonicalCommand',s.meta.canonicalCancelCommand===true&&r.meta.cancelPlannedCanonicalCommand===true);
 q('modifySameAuditorOnly',m.indexOf('sameAuditorOnly:true')>=0);
 q('acceptedReaccept',m.indexOf('acceptedMovesToApproved:reaccept')>=0&&m.indexOf('reacceptanceRequired:reaccept')>=0);
 q('modifyAvailabilityRollback',m.indexOf('availabilityRestoreOnFailure:true')>=0);
 q('cancelStatusMachineOwner',c.indexOf("Status_applyAction('MANAGER','CANCEL'")>=0);
 q('cancelReturnsPendingPlanning',c.indexOf("canonicalTargetStatus:'Pending Planning'")>=0);
 q('batchBounded',b.meta.bounded===true&&Number(b.maxItems)<=20);
 q('batchCanonicalWriter',b.dependency==='PlanningCanonicalCommitService_commit');
 q('readjustModelCPolicy',p.indexOf('PlanningReAdjustModelCPolicy_build_')>=0);
 q('uiModifyUsesRpc',ui.indexOf('PlanningWorkspaceRpc_modifyPlanned')>=0);q('uiCancelUsesRpc',ui.indexOf('PlanningWorkspaceRpc_cancelPlanned')>=0);q('uiPlannedDetailHydration',guard.indexOf('PlanningWorkspaceRpc_getPlannedAudit')>=0);q('uiPlanningWindowHardGuard',guard.indexOf('data-pw-window-blocked')>=0);q('noSecondSsot',s.meta.newSsot===false&&r.meta.newSsot===false&&b.meta.newSsot===false);
 var failed=x.filter(function(y){return!y.ok}).length,out={ok:failed===0,build:AMS03_PHASE5_ACTIONS_BUILD,total:x.length,passed:x.length-failed,failed:failed,results:x,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
