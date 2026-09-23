/***********************************************************************
 * PlanningWorkspaceSharedPayloadContractTests.js
 * BUILD: 2026-09-23_AMS01_3_SHARED_PAYLOAD_CONTRACT_R1
 ***********************************************************************/
var PW_SHARED_PAYLOAD_TEST_BUILD='2026-09-23_AMS01_3_SHARED_PAYLOAD_CONTRACT_R1';
function RUN_AMS01_3_SHARED_PAYLOAD_CONTRACT_REGRESSION(){
 var d=String(PlanningWorkspaceDecisionReadModel_get),rpc=String(PlanningWorkspaceRpc_bootstrap),ob=String(PlanningWorkspaceOverlayBundle_get),r=[];function t(n,v){r.push({name:n,ok:!!v});}
 t('decisionOwnsCompactProjection',d.indexOf('compactDecisionProjection=true')>=0);
 t('decisionProjectsCandidateEmails',d.indexOf('candidateAuditorEmails:emails')>=0);
 t('decisionProjectsAuditContext',d.indexOf('auditContextById:auditContextById')>=0);
 t('rpcConsumesDecisionCandidateEmails',rpc.indexOf('a&&a.candidateAuditorEmails')>=0);
 t('rpcConsumesDecisionAuditContext',rpc.indexOf('a&&a.auditContextById')>=0);
 t('overlayReceivesSharedContext',rpc.indexOf('PWR_overlayInput_(input,e,ctx)')>=0);
 t('overlayTreatsFullySeededAsShared',ob.indexOf('Number(context.meta.seedHits||0)>0')>=0&&ob.indexOf('Number(context.meta.misses||0)===0')>=0);
 t('noNewSsot',d.indexOf('newSsot=false')>=0||d.indexOf('newSsot:false')>=0);
 var failed=r.filter(function(x){return!x.ok}).length,out={ok:failed===0,build:PW_SHARED_PAYLOAD_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,sharedManagerAuditorPayloadFoundation:true}};Logger.log(JSON.stringify(out,null,2));return out;
}
