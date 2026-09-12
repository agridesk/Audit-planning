/***********************************************************************
 * WorkspacePlannerContextRegressionTests.js
 * BUILD: 2026-09-12_WORKSPACE_PLANNER_CONTEXT_TESTS_R2
 ***********************************************************************/
var WORKSPACE_PLANNER_CONTEXT_TEST_BUILD='2026-09-12_WORKSPACE_PLANNER_CONTEXT_TESTS_R2';
function RUN_WORKSPACE_PLANNER_CONTEXT_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var compat=TRACECERT_QUALIFICATION_COMPAT_contract();
  var ctx=PlanningWorkspaceAvailabilityContextOverride_contract();
  var ui=PlanningWorkspaceUi_contract();
  var canonSource=String(ConfigScopes_CanonicalName);
  var overlaySource=String(PWOB_availabilityIndex_);
  var enhancer=HtmlService.createHtmlOutputFromFile('PlanningWorkspaceContextEnhancer.js').getContent();
  var refreshSource=String(RUN_WORKSPACE_TRACECERT_ELIGIBILITY_REFRESH)+'\n'+String(WTER_tracecertAuditIds_);

  t('tracecetLegacyHeaderRecognized',canonSource.indexOf("florimarktracecet")>=0);
  t('tracecertCanonicalTarget',canonSource.indexOf("Florimark Tracecert")>=0);
  t('configScopesRemainsOwner',compat.canonicalOwner==='Config_Scopes');
  t('eligibilityBuildBumped',String(compat.eligibilityBuild).indexOf('TRACECERT_HEADER_COMPAT')>=0,compat.eligibilityBuild);
  t('tecVersionBumped',String(compat.tecVersion).indexOf('TRACECERT_HEADER_COMPAT')>=0,compat.tecVersion);
  t('internalAuditRefPreserved',overlaySource.indexOf('auditRef:PWOB_clean_(s.auditId)')>=0);
  t('auditIdUsedOnlyAsJoin',enhancer.indexOf('map[clean(slot.auditRef)]')>=0&&enhancer.indexOf("p.push('Audit '")<0);
  t('companyContextRendered',enhancer.indexOf('r.company')>=0);
  t('scopeContextRendered',enhancer.indexOf('r.scopes.join')>=0);
  t('managerPlannedHumanized',enhancer.indexOf("return'Planned audit'")>=0);
  t('weekendHumanized',enhancer.indexOf("return'Weekend'")>=0);
  t('contextNoServerRpc',enhancer.indexOf('google.script.run')<0);
  t('contextNoSheetRead',enhancer.indexOf('SpreadsheetApp')<0);
  t('contextExtraReadsZero',ctx.extraReads===0&&ui.contextExtraReads===0);
  t('contextExtraRpcsZero',ctx.extraRpcs===0&&ui.contextExtraRpcs===0);
  t('contextEnhancerInjected',ui.contextEnhancerInclude==='PlanningWorkspaceContextEnhancer.js'&&ui.contextEnhancerClientOnly===true);
  t('refreshUsesCanonicalService',refreshSource.indexOf('EligibilityTargetedRefreshService_refresh')>=0);
  t('refreshBounded20',refreshSource.indexOf('maxRefresh:20')>=0);
  t('refreshDerivedOnly',refreshSource.indexOf('planningWrites:false')>=0&&refreshSource.indexOf('statusWrites:false')>=0&&refreshSource.indexOf('availabilityWrites:false')>=0);
  t('noNewSsot',compat.newSsot===false&&ctx.newSsot===false&&ui.newSsot===false);

  var failed=r.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:WORKSPACE_PLANNER_CONTEXT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,contractOnly:true,liveReadsPerformed:false,liveWritesPerformed:false,tracecertFix:'legacy Auditors header Florimark Tracecet -> canonical Florimark Tracecert',availabilityContext:'time + company + scopes from already-loaded Workspace data; no extra RPC/read'}};
  console.log(JSON.stringify(out,null,2));return out;
}
