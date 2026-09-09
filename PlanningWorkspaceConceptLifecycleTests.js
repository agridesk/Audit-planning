/***********************************************************************
 * PlanningWorkspaceConceptLifecycleTests.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_LIFECYCLE_TESTS_R1
 *
 * Controlled DEV write regression: creates one concept reservation and
 * releases the same reservation in the same run. No canonical planning,
 * Availability or lifecycle/status write is performed.
 ***********************************************************************/
var PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_TEST_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_CONCEPT_LIFECYCLE_TESTS_R1';
function RUN_PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_REGRESSION(){
  if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)throw new Error('DEV_ONLY');
  var r=[];function t(n,o,d){r.push({name:n,ok:!!o,detail:o?'':String(d||'failed')});}
  var from='2026-09-01',to='2026-11-30',ad=PlanningWorkspaceService_getAdvisory({from:from,to:to}),rows=ad&&ad.rows||[],row=null,aud=null;
  for(var i=0;i<rows.length&&!row;i++){var cs=rows[i].candidateAuditors||[];if(String(rows[i].advisoryState||'').toUpperCase()==='READY'&&cs.length){row=rows[i];aud=cs[0];}}
  t('readyAuditFound',!!row,'No READY audit with candidate auditor');
  if(!row){var out0={ok:false,build:PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_TEST_BUILD,total:r.length,passed:0,failed:1,results:r};console.log(JSON.stringify(out0,null,2));return out0;}
  var rev=PlanningWorkspaceRpc_getRevision({auditId:row.auditId}),revision=rev&&rev.ok&&rev.data&&rev.data.revision||'';t('revisionPresent',!!revision,'revision missing');
  var date=row.planningWindowFrom||from,start='09:00',hours=Math.max(1,Math.min(8,Number(row.hoursToPlan||4)||4)),endHour=Math.min(17,9+Math.ceil(hours)),end=(endHour<10?'0':'')+endHour+':00';
  var payload={auditId:row.auditId,auditorEmail:aud.email,auditorName:aud.name||'',blocks:[{date:date,start:start,end:end,hours:hours}],sourceRevision:revision,createdBy:'planning-workspace-lifecycle-test',note:'CONTROLLED_DEV_LIFECYCLE_TEST'};
  var save=PlanningWorkspaceRpc_saveConcept(payload);t('saveRpcOk',save&&save.ok===true,save&&save.error&&save.error.message);t('saved',save&&save.data&&save.data.saved===true,save&&save.data&&save.data.reason);t('preliminaryOnly',save&&save.data&&save.data.meta&&save.data.meta.preliminaryOnly===true);t('finalPlanningWritesFalse',save&&save.data&&save.data.meta&&save.data.meta.finalPlanningWrites===false);t('availabilityWritesFalse',save&&save.data&&save.data.meta&&save.data.meta.availabilityWrites===false);t('statusWritesFalse',save&&save.data&&save.data.meta&&save.data.meta.statusWrites===false);
  var rel=PlanningWorkspaceRpc_releaseConcept({auditId:row.auditId,releasedBy:'planning-workspace-lifecycle-test',reason:'CONTROLLED_DEV_TEST_CLEANUP'});t('releaseRpcOk',rel&&rel.ok===true,rel&&rel.error&&rel.error.message);t('released',rel&&rel.data&&rel.data.released===true,rel&&rel.data&&rel.data.reason);t('releasePreliminaryOnly',rel&&rel.data&&rel.data.meta&&rel.data.meta.preliminaryOnly===true);t('releaseFinalPlanningWritesFalse',rel&&rel.data&&rel.data.meta&&rel.data.meta.finalPlanningWrites===false);t('releaseAvailabilityWritesFalse',rel&&rel.data&&rel.data.meta&&rel.data.meta.availabilityWrites===false);t('releaseStatusWritesFalse',rel&&rel.data&&rel.data.meta&&rel.data.meta.statusWrites===false);
  var failed=r.filter(function(x){return!x.ok;}).length,out={ok:failed===0,build:PLANNING_WORKSPACE_CONCEPT_LIFECYCLE_TEST_BUILD,total:r.length,passed:r.length-failed,failed:failed,results:r,meta:{controlledDevWrite:true,conceptReservationWrite:true,conceptReservationReleasedSameRun:true,canonicalPlanningWrites:false,availabilityWrites:false,statusWrites:false,auditId:row.auditId,auditorEmail:aud.email,nextStep:'After green, harden canonical Save planning payload and run preflight/dry-run only before any canonical live write.'}};console.log(JSON.stringify(out,null,2));return out;
}
