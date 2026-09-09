/***********************************************************************
 * PlanningWorkspaceCommitPreflightTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_COMMIT_PREFLIGHT_TESTS_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_COMMIT_PREFLIGHT_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_COMMIT_PREFLIGHT_TESTS_R1';
function RUN_PLANNING_WORKSPACE_COMMIT_PREFLIGHT_REGRESSION(){
  if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)throw new Error('DEV_ONLY');
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var ad=PlanningWorkspaceService_getAdvisory({from:'2026-09-01',to:'2026-11-30'}),rows=ad&&ad.rows||[],row=null,aud=null;
  for(var i=0;i<rows.length&&!row;i++){var cs=rows[i].candidateAuditors||[];if(String(rows[i].advisoryState||'').toUpperCase()==='READY'&&cs.length){row=rows[i];aud=cs[0];}}
  t('readyAuditFound',!!row,'No READY audit with candidate auditor');
  if(!row){var z={ok:false,build:PLANNING_WORKSPACE_COMMIT_PREFLIGHT_TEST_BUILD,total:r.length,passed:0,failed:1,results:r};console.log(JSON.stringify(z,null,2));return z;}
  var rr=PlanningWorkspaceRpc_getRevision({auditId:row.auditId}),revision=rr&&rr.ok&&rr.data&&rr.data.revision||'';t('revisionPresent',!!revision);
  var date=row.planningWindowFrom||'2026-09-01',hours=Math.max(1,Math.min(8,Number(row.hoursToPlan||4)||4)),endHour=Math.min(17,9+Math.ceil(hours)),blocks=[{date:date,start:'09:00',end:(endHour<10?'0':'')+endHour+':00',hours:hours}];
  var out=PlanningWorkspaceRpc_commitPreflight({auditId:row.auditId,expectedRevision:revision,auditorEmail:aud.email,auditorName:aud.name||'',blocks:blocks,waiverAccepted:false});
  t('rpcOk',out&&out.ok===true,out&&out.error&&out.error.message);var g=out&&out.data||{};
  t('gateReturned',g&&g.success===true,g&&g.reason);t('revisionAccepted',g&&g.revisionAccepted===true,g&&g.reason);t('preflightPerformed',g&&g.meta&&g.meta.canonicalPreflightPerformed===true);t('readOnly',g&&g.meta&&g.meta.readOnly===true);t('writesFalse',g&&g.meta&&g.meta.writes===false);t('canonicalOwner',g&&g.meta&&g.meta.canonicalPlanningOwner==='Audit planning');t('lockUsed',g&&g.meta&&g.meta.lockUsed===true);t('decisionPresent',typeof g.canCommit==='boolean');
  var failed=r.filter(function(x){return!x.ok;}).length,res={ok:failed===0,build:PLANNING_WORKSPACE_COMMIT_PREFLIGHT_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,canonicalPreflightOnly:true,auditId:row.auditId,auditorEmail:aud.email,canCommit:g.canCommit===true,decisionReason:g.reason||'',nextStep:'If green, bind Commit button to preflight-first browser flow; do not execute canonical live write yet.'}};console.log(JSON.stringify(res,null,2));return res;
}
