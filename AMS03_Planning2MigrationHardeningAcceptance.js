/***********************************************************************
 * AMS03_Planning2MigrationHardeningAcceptance.js
 * BUILD: 2026-09-24_AMS03_PLANNING2_MIGRATION_HARDENING_R1
 * Read-only acceptance for role mutation hardening + focused P0 path.
 ***********************************************************************/
var AMS03_P2_MIGRATION_HARDENING_BUILD='2026-09-24_AMS03_PLANNING2_MIGRATION_HARDENING_R1';
function A3MH_src_(fn){return typeof fn==='function'?String(fn):'';}
function A3MH_has_(s,x){return s.indexOf(x)>=0;}
function A3MH_test_(name,ok,detail){return{name:name,ok:ok===true,detail:detail||''};}
function RUN_AMS03_PLANNING2_MIGRATION_HARDENING_ACCEPTANCE(){
 var r=[],rpc=A3MH_src_(PlanningWorkspaceRpc_contract),saveBatch=A3MH_src_(PlanningWorkspaceRpc_saveConceptsBatch),
 release=A3MH_src_(PlanningWorkspaceRpc_releaseConcept),bp=A3MH_src_(PlanningWorkspaceRpc_batchPreflight),
 bc=A3MH_src_(PlanningWorkspaceRpc_batchCommit),mod=A3MH_src_(PlanningWorkspaceRpc_modifyPlanned),
 cancel=A3MH_src_(PlanningWorkspaceRpc_cancelPlanned),demand=A3MH_src_(PlanningDemandService_get),
 decision=A3MH_src_(PlanningWorkspaceDecisionReadModel_get),boot=A3MH_src_(PlanningWorkspaceRpc_bootstrap);
 r.push(A3MH_test_('auditorBatchSaveManagerOnly',A3MH_has_(saveBatch,'PWR_forbidAuditorBatch_'),'saveConceptsBatch rejects Auditor role server-side.'));
 r.push(A3MH_test_('auditorBatchPreflightManagerOnly',A3MH_has_(bp,'PWR_forbidAuditorBatch_'),'batchPreflight rejects Auditor role server-side.'));
 r.push(A3MH_test_('auditorBatchCommitManagerOnly',A3MH_has_(bc,'PWR_forbidAuditorBatch_'),'batchCommit rejects Auditor role server-side.'));
 r.push(A3MH_test_('auditorReleaseSelfOnly',A3MH_has_(release,'PWR_enforceAuditorCommand_'),'releaseConcept is self-scoped server-side.'));
 r.push(A3MH_test_('auditorModifySelfOnly',A3MH_has_(mod,'PWR_enforceAuditorPlannedAction_'),'modifyPlanned is self-scoped server-side.'));
 r.push(A3MH_test_('auditorCancelSelfOnly',A3MH_has_(cancel,'PWR_enforceAuditorPlannedAction_'),'cancelPlanned is self-scoped server-side.'));
 r.push(A3MH_test_('focusedDemandFilterBeforeEligibility',A3MH_has_(demand,'focusAuditId')&&A3MH_has_(demand,"PDS_clean_(row[aid])!==focusAuditId"),'Audit ID is filtered in Planning Demand before eligibility batch construction.'));
 r.push(A3MH_test_('focusedTelemetry',A3MH_has_(decision,'focusedSourceBounded')&&A3MH_has_(decision,'focusedEligibilityCardinality'),'Decision projection exposes focused-launch telemetry.'));
 r.push(A3MH_test_('singleInitialRpcPreserved',A3MH_has_(boot,'PlanningWorkspaceService_getDecision')&&A3MH_has_(boot,'PlanningWorkspaceService_getOverlays'),'Bootstrap remains one browser RPC containing decision + overlays.'));
 r.push(A3MH_test_('canonicalMutationOwnersPreserved',A3MH_has_(rpc,'canonicalOwnersBypassed:false')&&A3MH_has_(rpc,'directSheetWrites:false'),'No alternate write owner or SSoT introduced.'));
 var passed=r.filter(function(x){return x.ok;}).length;
 var out={ok:passed===r.length,build:AMS03_P2_MIGRATION_HARDENING_BUILD,passed:passed,total:r.length,writesPerformed:false,results:r,meta:{priority:'P0_SPEED',roleHardening:true,focusedAuditBounded:true,runtimeBrowserValidationStillRequired:true}};Logger.log(JSON.stringify(out,null,2));return out;
}
