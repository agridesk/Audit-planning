/***********************************************************************
 * PlanningCanonicalModifyGrandfatherTests.js
 * BUILD: 2026-09-14_CANONICAL_MODIFY_WINDOW_STRICT_TESTS_R6
 * Historical file/runner name retained for continuity.
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD='2026-09-14_CANONICAL_MODIFY_WINDOW_STRICT_TESTS_R6';

function RUN_PLANNING_CANONICAL_MODIFY_GRANDFATHER_REGRESSION(){
  var results=[];
  function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}
  var src=String(PlanningCanonicalModifyService_modify);
  var deps=String(PCMOD_dependencies_);
  var past=String(PCMOD_pastDates_);

  t('planning_window_gate_is_strict',src.indexOf("if(!gate||gate.canCommit!==true)return")>=0,src);
  t('no_existing_outside_window_bypass',src.indexOf('windowException')<0&&src.indexOf('PCMOD_existingOutsideWindow_')<0,src);
  t('no_planning_window_hard_block_downgrade',src.indexOf('PCMOD_gateOnlyWindowHardBlock_')<0&&src.indexOf('EXISTING_OUTSIDE_WINDOW_MODIFY_ONLY')<0,src);
  t('planning_window_leading_meta_present',src.indexOf('planningWindowLeading:true')>=0,src);
  t('past_date_helper_allows_only_unchanged_old_block',past.indexOf('old[PCMOD_blockKey_(b)]')>=0&&past.indexOf('d<today')>=0,past);
  t('new_past_date_still_hard_blocked',src.indexOf('PAST_DATE_NOT_ALLOWED')>=0,src);
  t('row_validation_before_availability_write',src.indexOf('PlanningCanonicalRowWriter_validate')>=0&&src.indexOf('PlanningCanonicalRowWriter_validate')<src.indexOf('PlanningCanonicalAvailabilityAdapter_release'),src);
  t('planned_hours_returned_on_validation_failure',src.indexOf('plannedHours:validation&&validation.plannedHours')>=0&&src.indexOf('requiredHours:validation&&validation.requiredHours')>=0,src);
  t('availability_owner_guard_retained',src.indexOf('PlanningCanonicalAvailabilityOwnerGuard_evaluate')>=0,src);
  t('availability_restore_on_failure_retained',src.indexOf('PCMOD_restore_')>=0&&src.indexOf('availabilityRestoreOnFailure:true')>=0,src);
  t('accepted_reacceptance_preserved',src.indexOf("reaccept=status==='ACCEPTED'")>=0&&src.indexOf('acceptedMovesToApproved:reaccept')>=0,src);
  t('same_auditor_only_retained',src.indexOf('AUDITOR_CHANGE_NOT_SUPPORTED_R10')>=0,src);
  t('required_dependencies_preserved',deps.indexOf("gate:typeof PlanningCommitGateService_evaluateLocked_")>=0&&deps.indexOf("validator:typeof PlanningCanonicalRowWriter_validate")>=0,deps);

  var failed=results.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Modify obeys the canonical planning window with no grandfather bypass. New past dates remain blocked; unchanged historical blocks may remain. Planned-hours validation remains explicit before Availability mutation.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
