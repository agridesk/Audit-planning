/***********************************************************************
 * PlanningWorkspaceEditorContractTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_CONTRACT_TESTS_R2_CANONICAL_COMMIT
 ***********************************************************************/
var PLANNING_WORKSPACE_EDITOR_CONTRACT_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_EDITOR_CONTRACT_TESTS_R2_CANONICAL_COMMIT';
function RUN_PLANNING_WORKSPACE_EDITOR_CONTRACT_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningWorkspaceRpc_contract();
  t('rpcBuild',String(c.build||'').indexOf('RPC_R6_STATUS_AWARE_PREFLIGHT')>=0,c.build);
  t('revisionEndpoint',c.endpoints.indexOf('PlanningWorkspaceRpc_getRevision')>=0);t('preflightEndpoint',c.endpoints.indexOf('PlanningWorkspaceRpc_commitPreflight')>=0);t('commitEndpoint',c.endpoints.indexOf('PlanningWorkspaceRpc_commit')>=0);
  t('revisionOwner',c.meta.revisionOwner==='PlanningRevisionTokenService');t('commitPreflightOwner',c.meta.commitPreflightOwner==='PlanningCommitGateService');t('commitOwner',String(c.meta.commitOwner||'').indexOf('PlanningCanonicalCommitService')>=0);
  t('browserFacing',c.meta.browserFacing===true);t('noDirectSheetReads',c.meta.directSheetReads===false);t('noDirectSheetWrites',c.meta.directSheetWrites===false);t('noNewSsot',c.meta.newSsot===false);t('canonicalOwnersPreserved',c.meta.canonicalOwnersBypassed===false);
  t('devOnlyCommit',c.meta.canonicalCommitDevOnly===true);t('explicitConfirmationRequired',c.meta.canonicalCommitExplicitConfirmation===true);t('statusAwarePreflight',c.meta.statusAwarePreflight===true);
  var missing=PlanningWorkspaceRpc_getRevision({});t('missingAuditContained',missing&&missing.ok===false&&missing.action==='getRevision',missing&&missing.error&&missing.error.message);t('missingAuditNoThrow',!!missing);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_EDITOR_CONTRACT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contractOnly:true,canonicalCommitDevOnly:true}};console.log(JSON.stringify(out,null,2));return out;
}
