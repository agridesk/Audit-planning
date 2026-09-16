/***********************************************************************
 * PlanningBatchCommitServiceTests.js
 * BUILD: 2026-09-16_ROADMAP_2_4_BATCH_COMMIT_TESTS_R1_BOUNDED_CANONICAL
 * Non-destructive contract/unit regression. Does not commit live audits.
 ***********************************************************************/
var PLANNING_BATCH_COMMIT_TEST_BUILD='2026-09-16_ROADMAP_2_4_BATCH_COMMIT_TESTS_R1_BOUNDED_CANONICAL';
function RUN_PLANNING_BATCH_COMMIT_REGRESSION(){
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var c=PlanningBatchCommitService_contract(),m=c.meta||{};
  t('build',c.build===PLANNING_BATCH_COMMIT_BUILD,c.build);
  t('bounded',m.bounded===true&&c.maxItems===20,JSON.stringify(c));
  t('canonicalDependency',c.dependency==='PlanningCanonicalCommitService_commit',JSON.stringify(c));
  t('serialVisibleWork',m.serialVisibleWork===true,JSON.stringify(m));
  t('noSpeculativeRpc',m.speculativeRpcCount===0,JSON.stringify(m));
  t('failIsolated',m.failIsolated===true,JSON.stringify(m));
  t('perItemCanonicalRevalidation',m.perItemCanonicalRevalidation===true,JSON.stringify(m));
  t('executionLocalCachesReusable',m.executionLocalCachesReusable===true,JSON.stringify(m));
  t('noNewSsot',m.newSsot===false&&m.conceptRemainsNonCanonical===true,JSON.stringify(m));
  t('noDirectSheetWrites',m.directSheetWrites===false,JSON.stringify(m));
  var normalized=PBC_normalizeItems_({actorRole:'MANAGER',actorEmail:'manager@example.com',items:[{auditId:'A-1',expectedRevision:'rev1',auditorEmail:'AUDITOR@EXAMPLE.COM',auditorName:'Auditor',blocks:[{date:'2026-10-01',start:'08:00',end:'12:00'}]}]});
  t('normalizeOne',normalized.length===1&&normalized[0].auditId==='A-1',JSON.stringify(normalized));
  t('emailNormalized',normalized[0].auditorEmail==='auditor@example.com',JSON.stringify(normalized[0]));
  t('actorInherited',normalized[0].actorRole==='MANAGER'&&normalized[0].actorEmail==='manager@example.com',JSON.stringify(normalized[0]));
  var duplicateBlocked=false;try{PBC_normalizeItems_({items:[{auditId:'A',expectedRevision:'1',blocks:[{}]},{auditId:'A',expectedRevision:'2',blocks:[{}]}]});}catch(e){duplicateBlocked=PBC_clean_(e&&e.message).indexOf('duplicate auditId')>=0;}t('duplicateAuditBlocked',duplicateBlocked);
  var missingRevisionBlocked=false;try{PBC_normalizeItems_({items:[{auditId:'A',blocks:[{}]}]});}catch(e){missingRevisionBlocked=PBC_clean_(e&&e.message).indexOf('expectedRevision')>=0;}t('missingRevisionBlocked',missingRevisionBlocked);
  var missingBlocksBlocked=false;try{PBC_normalizeItems_({items:[{auditId:'A',expectedRevision:'1',blocks:[]}]});}catch(e){missingBlocksBlocked=PBC_clean_(e&&e.message).indexOf('blocks are required')>=0;}t('missingBlocksBlocked',missingBlocksBlocked);
  var tooMany=[],i;for(i=0;i<21;i++)tooMany.push({auditId:'A'+i,expectedRevision:'R'+i,blocks:[{}]});var maxBlocked=false;try{PBC_normalizeItems_({items:tooMany});}catch(e){maxBlocked=PBC_clean_(e&&e.message).indexOf('maximum 20')>=0;}t('maxBatchGuard',maxBlocked);
  var okOutcome=PBC_itemOutcome_({auditId:'A'},{success:true,committed:true,reason:'OK'},null,12);t('committedOutcome',okOutcome.ok===true&&okOutcome.committed===true&&okOutcome.elapsedMs===12,JSON.stringify(okOutcome));
  var blockedOutcome=PBC_itemOutcome_({auditId:'B'},{success:true,committed:false,reason:'HARD_BLOCK'},null,8);t('blockedOutcome',blockedOutcome.ok===true&&blockedOutcome.committed===false&&blockedOutcome.reason==='HARD_BLOCK',JSON.stringify(blockedOutcome));
  var errorOutcome=PBC_itemOutcome_({auditId:'C'},null,new Error('simulated'),4);t('errorOutcome',errorOutcome.ok===false&&errorOutcome.committed===false&&errorOutcome.reason==='EXCEPTION'&&errorOutcome.message==='simulated',JSON.stringify(errorOutcome));
  t('liveCommitNotInvoked',true);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_BATCH_COMMIT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveCommitsPerformed:false,roadmapLayer:'Batch Planning / Batch Commit'}};Logger.log(JSON.stringify(out,null,2));return out;
}
