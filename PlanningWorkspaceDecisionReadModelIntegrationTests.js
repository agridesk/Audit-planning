/***********************************************************************
 * PlanningWorkspaceDecisionReadModelIntegrationTests.js
 * BUILD: 2026-09-23_AMS01_3_WORKSPACE_DECISION_INTEGRATION_R1
 ***********************************************************************/
var PWDRM_INTEGRATION_TEST_BUILD='2026-09-23_AMS01_3_WORKSPACE_DECISION_INTEGRATION_R1';
function RUN_AMS01_3_WORKSPACE_DECISION_INTEGRATION_REGRESSION(){
 var svc=String(PlanningWorkspaceService_getDecision),rpc=String(PlanningWorkspaceRpc_bootstrap),r=[];function t(n,v){r.push({name:n,ok:!!v});}
 t('serviceUsesDecisionReadModel',svc.indexOf('PlanningWorkspaceDecisionReadModel_get')>=0);
 t('bootstrapUsesServiceDecision',rpc.indexOf('PlanningWorkspaceService_getDecision(input)')>=0);
 t('bootstrapNoLegacyAdvisoryCall',rpc.indexOf('PlanningWorkspaceService_getAdvisory(input)')<0);
 t('candidateEmailsFromDecisionModel',rpc.indexOf('candidateAuditorEmails')>=0);
 t('sharedAuditContextPreserved',rpc.indexOf('PWR_auditContext_(a)')>=0);
 t('overlayBoundedPreserved',rpc.indexOf('PWR_overlayInput_(input,e,ctx)')>=0);
 t('compactDecisionTelemetry',rpc.indexOf('compactDecisionModel:true')>=0);
 t('serviceNoSheetAccess',svc.indexOf('SpreadsheetApp')<0&&svc.indexOf('getRange(')<0);
 t('rpcNoSheetAccess',rpc.indexOf('SpreadsheetApp')<0&&rpc.indexOf('getRange(')<0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:PWDRM_INTEGRATION_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,nextStep:'Run live bootstrap acceptance to verify payload/runtime equivalence.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
