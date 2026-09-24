/***********************************************************************
 * AMS03_Planning2FocusedBootstrapRcaAcceptance.js
 * BUILD: 2026-09-24_AMS03_PLANNING2_FOCUSED_BOOTSTRAP_RCA_R3
 * Read-only acceptance for the focused Plan(auditId) hot path.
 ***********************************************************************/
var AMS03_P2_FOCUSED_RCA_BUILD='2026-09-24_AMS03_PLANNING2_FOCUSED_BOOTSTRAP_RCA_R3';
function A3F_src_(fn){try{return String(fn||'');}catch(e){return'';}}
function A3F_has_(s,x){return String(s||'').indexOf(x)>=0;}
function A3F_test_(name,ok,detail){return{name:name,ok:!!ok,detail:detail||''};}
function RUN_AMS03_PLANNING2_FOCUSED_BOOTSTRAP_RCA_ACCEPTANCE(){
 var auditId='AUD_TEST_AcceptedDelta_HQ_1777979469906_101',results=[],
 pds=A3F_src_(PlanningDemandService_get),decision=A3F_src_(PlanningWorkspaceDecisionReadModel_get),
 concept=A3F_src_(ConceptPlanningService_get),scope=A3F_src_(m5t_upsertScopes),rpc=A3F_src_(PlanningWorkspaceRpc_bootstrap);
 results.push(A3F_test_('focusedPeriodOwnedByAuditPlanning',A3F_has_(pds,'PDS_focusPeriod_')&&A3F_has_(pds,"owner:'Audit planning row'"),'Focused period is derived from the target Audit planning row.'));
 results.push(A3F_test_('modifyReadRemovedFromBootstrap',!A3F_has_(decision,'PlanningWorkspacePlannedAuditReadService_get'),'Focused bootstrap no longer depends on Modify/Cancel read service.'));
 results.push(A3F_test_('focusedEligibilityUsesCanonicalFacade',A3F_has_(A3F_src_(CPS_focusedEligibility_),'elig_getOrCompute_'),'Single-audit eligibility uses EligibilityService cache facade.'));
 results.push(A3F_test_('scopeSaveInvalidatesEligibility',A3F_has_(scope,'eligService_cacheInvalidate_')&&A3F_has_(scope,'EligibilityTargetedRefreshService_refresh'),'Scope save invalidates and synchronously refreshes derived eligibility.'));
 results.push(A3F_test_('singleBootstrapRpcPreserved',A3F_has_(rpc,'PlanningWorkspaceService_getDecision')&&A3F_has_(rpc,'PlanningWorkspaceService_getOverlays'),'One browser bootstrap RPC remains.'));
 var t=Date.now(),env=PlanningWorkspaceRpc_bootstrap({auditId:auditId,from:'2026-09-01',to:'2026-12-31',actorRole:'MANAGER',includeCompanyMeta:false}),wall=Date.now()-t,
 data=env&&env.data||{},a=data.advisory||{},m=data.meta||{},rows=Array.isArray(a.rows)?a.rows:[],am=a.meta||{};
 results.push(A3F_test_('runtimeEnvelopeOk',env&&env.ok===true,'Focused bootstrap RPC completed.'));
 results.push(A3F_test_('runtimeCardinalityOne',rows.length===1&&String(rows[0].auditId||'')===auditId,'Focused bootstrap returns exactly the requested audit.'));
 results.push(A3F_test_('runtimeFocusedSourceBounded',am.focusedLaunch===true&&am.focusedSourceBounded===true,'Focused source path is active.'));
 results.push(A3F_test_('runtimeFocusedEligibility',am.focusedEligibilityRead===true,'Focused EligibilityService facade path is active.'));results.push(A3F_test_('runtimeEligibilityResolved',rows.length===1&&rows[0].requiresCanonicalRefresh!==true,'Focused launch resolves missing eligibility instead of returning a dead-end refresh-required card.'));
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:AMS03_P2_FOCUSED_RCA_BUILD,passed:passed,total:results.length,writesPerformed:false,results:results,runtime:{auditId:auditId,wallMs:wall,rpcDurationMs:Number(env&&env.durationMs||0),stageMs:m.stageMs||{},period:a.period||null,rows:rows.length,candidateAuditors:Number(m.candidateAuditors||0),advisoryMeta:{focusedLaunch:am.focusedLaunch,focusedSourceBounded:am.focusedSourceBounded,focusedEligibilityCardinality:am.focusedEligibilityCardinality,focusedEligibilityRead:am.focusedEligibilityRead,focusedEligibilityReadStrategy:am.focusedEligibilityReadStrategy}},meta:{priority:'P0_SPEED',readOnly:true,noBusinessWrites:true,roadmapDecisionReadyTargetMs:2000}};
 Logger.log(JSON.stringify(out,null,2));return out;
}
