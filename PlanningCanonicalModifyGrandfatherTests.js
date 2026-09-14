/***********************************************************************
 * PlanningCanonicalModifyGrandfatherTests.js
 * BUILD: 2026-09-14_CANONICAL_MODIFY_WINDOW_LEADING_TESTS_R3
 *
 * Non-destructive regression. Historical file/runner name retained only for
 * continuity; policy is now explicitly NO grandfather bypass.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD='2026-09-14_CANONICAL_MODIFY_WINDOW_LEADING_TESTS_R3';

function RUN_PLANNING_CANONICAL_MODIFY_GRANDFATHER_REGRESSION(){
  var results=[];
  function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}
  var src=String(PlanningCanonicalModifyService_modify);
  var deps=String(PCMOD_dependencies_);

  t('planning_window_gate_remains_leading',src.indexOf("if(!gate||gate.canCommit!==true)return")>=0,src);
  t('no_grandfather_helper_in_modify_path',src.indexOf('PCMOD_grandfatherWindow_')<0,src);
  t('no_window_hard_block_downgrade',src.indexOf('GATE_ACCEPTED_GRANDFATHERED_RESCHEDULE')<0,src);
  t('planning_window_leading_meta_present',src.indexOf('planningWindowLeading:true')>=0,src);
  t('availability_still_after_gate',src.indexOf('PlanningCanonicalAvailabilityOwnerGuard_evaluate')>src.indexOf('gate.canCommit'),src);
  t('row_validation_before_availability_write',src.indexOf('PlanningCanonicalRowWriter_validate')>=0&&src.indexOf('PlanningCanonicalRowWriter_validate')<src.indexOf('PlanningCanonicalAvailabilityAdapter_release'),src);
  t('accepted_reacceptance_preserved',src.indexOf("reaccept=status==='ACCEPTED'")>=0&&src.indexOf('acceptedMovesToApproved:reaccept')>=0,src);
  t('required_dependencies_preserved',deps.indexOf("gate:typeof PlanningCommitGateService_evaluateLocked_")>=0&&deps.indexOf("validator:typeof PlanningCanonicalRowWriter_validate")>=0,deps);

  var failed=results.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Planning window is leading for Modify. Existing/legacy planning outside the window receives no bypass; any new modified date must pass the canonical planning-window hard rule.'}};
  console.log(JSON.stringify(out,null,2));
  return out;
}
