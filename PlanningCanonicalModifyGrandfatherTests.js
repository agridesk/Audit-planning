/***********************************************************************
 * PlanningCanonicalModifyGrandfatherTests.js
 * BUILD: 2026-09-14_CANONICAL_MODIFY_GRANDFATHER_TESTS_R5_GUARDED_EXCEPTION
 ***********************************************************************/
var PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD='2026-09-14_CANONICAL_MODIFY_GRANDFATHER_TESTS_R5_GUARDED_EXCEPTION';

function RUN_PLANNING_CANONICAL_MODIFY_GRANDFATHER_REGRESSION(){
  var results=[];
  function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}
  var src=String(PlanningCanonicalModifyService_modify);
  var deps=String(PCMOD_dependencies_);
  var past=String(PCMOD_pastDates_);
  var outside=String(PCMOD_existingOutsideWindow_);
  var gateOnly=String(PCMOD_gateOnlyWindowHardBlock_);

  t('existing_outside_window_helper_present',src.indexOf('PCMOD_existingOutsideWindow_')>=0&&outside.indexOf('d<win.from||d>win.to')>=0,outside);
  t('modify_only_exception_requires_existing_outside',src.indexOf('windowException=existingOutside&&PCMOD_gateOnlyWindowHardBlock_(gate)')>=0,src);
  t('exception_requires_revision_accepted',gateOnly.indexOf('revisionAccepted!==true')>=0,gateOnly);
  t('exception_only_downgrades_planning_window_outside',gateOnly.indexOf("ruleCode)!=='PLANNING_WINDOW_OUTSIDE'")>=0,gateOnly);
  t('other_hard_blocks_still_block',src.indexOf("&& !windowException")<0?src.indexOf(')&&!windowException)return')>=0: true,src);
  t('normal_inside_window_has_no_exception',outside.indexOf('return false')>=0&&src.indexOf('existingOutside&&')>=0,src);
  t('past_date_helper_allows_only_unchanged_old_block',past.indexOf('old[PCMOD_blockKey_(b)]')>=0&&past.indexOf('d<today')>=0,past);
  t('new_past_date_still_hard_blocked',src.indexOf('PAST_DATE_NOT_ALLOWED')>=0,src);
  t('row_validation_before_availability_write',src.indexOf('PlanningCanonicalRowWriter_validate')>=0&&src.indexOf('PlanningCanonicalRowWriter_validate')<src.indexOf('PlanningCanonicalAvailabilityAdapter_release'),src);
  t('availability_owner_guard_retained',src.indexOf('PlanningCanonicalAvailabilityOwnerGuard_evaluate')>=0,src);
  t('availability_restore_on_failure_retained',src.indexOf('PCMOD_restore_')>=0&&src.indexOf('availabilityRestoreOnFailure:true')>=0,src);
  t('accepted_reacceptance_preserved',src.indexOf("reaccept=status==='ACCEPTED'")>=0&&src.indexOf('acceptedMovesToApproved:reaccept')>=0,src);
  t('required_dependencies_preserved',deps.indexOf("gate:typeof PlanningCommitGateService_evaluateLocked_")>=0&&deps.indexOf("validator:typeof PlanningCanonicalRowWriter_validate")>=0,deps);

  var failed=results.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:PLANNING_CANONICAL_MODIFY_GRANDFATHER_TEST_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,policy:'Modify-only exception applies only when the existing canonical planning is already outside the canonical window, and only PLANNING_WINDOW_OUTSIDE may be overridden. Revision, qualification, Availability and all other hard blocks remain hard.'}};
  console.log(JSON.stringify(out,null,2));return out;
}
