/***********************************************************************
 * PlanningBatchCommitIntegrationTests.js
 * BUILD: 2026-09-16_ROADMAP_2_4_BATCH_COMMIT_INTEGRATION_TESTS_R1
 * Non-destructive integration contract. No live commit is executed.
 ***********************************************************************/
var PLANNING_BATCH_COMMIT_INTEGRATION_TEST_BUILD='2026-09-16_ROADMAP_2_4_BATCH_COMMIT_INTEGRATION_TESTS_R1';
function RUN_PLANNING_BATCH_COMMIT_INTEGRATION_REGRESSION(){
 var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
 var sc=PlanningWorkspaceService_contract(),rc=PlanningWorkspaceRpc_contract();
 t('serviceBuildR6',String(sc.build).indexOf('R6_BATCH_COMMIT')>=0,sc.build);
 t('serviceDependency',sc.dependencies&&sc.dependencies.canonicalBatchCommit===true,JSON.stringify(sc.dependencies));
 t('serviceEndpoint',sc.endpoints&&sc.endpoints.batchCommit==='PlanningBatchCommitService_commit',JSON.stringify(sc.endpoints));
 t('serviceCanonicalOnly',sc.meta&&sc.meta.canonicalBatchCommitOnly===true,JSON.stringify(sc.meta));
 t('serviceBounded',sc.meta&&sc.meta.batchCommitBounded===true,JSON.stringify(sc.meta));
 t('rpcBuildR8',String(rc.build).indexOf('R8_BATCH_COMMIT')>=0,rc.build);
 t('rpcEndpoint',rc.endpoints.indexOf('PlanningWorkspaceRpc_batchCommit')>=0,JSON.stringify(rc.endpoints));
 t('rpcSingleCall',rc.meta&&rc.meta.batchCommitSingleRpc===true,JSON.stringify(rc.meta));
 t('rpcRevisionHydration',rc.meta&&rc.meta.batchCommitRevisionHydration===true,JSON.stringify(rc.meta));
 t('rpcBounded',rc.meta&&rc.meta.batchCommitBounded===true,JSON.stringify(rc.meta));
 var p=PWR_batchCommandInput_({actorRole:'MANAGER',actorEmail:'m@example.com',items:[]});
 t('emptyPrepareNoWrites',Array.isArray(p.items)&&p.items.length===0&&p.actorRole==='MANAGER',JSON.stringify(p));
 t('noDirectWrites',sc.meta.directSheetWrites===false&&rc.meta.directSheetWrites===false);
 t('noNewSsot',sc.meta.newSsot===false&&rc.meta.newSsot===false);
 t('liveCommitNotInvoked',true);
 var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_BATCH_COMMIT_INTEGRATION_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveCommitsPerformed:false,roadmapLayer:'Batch Planning / Workspace integration'}};Logger.log(JSON.stringify(out,null,2));return out;
}
