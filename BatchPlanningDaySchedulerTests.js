/**
 * FILE: BatchPlanningDaySchedulerTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_DAY_SCHEDULER_TESTS_R1_ANCHORS
 * RUN: RUN_BATCH_PLANNING_DAY_SCHEDULER_REGRESSION
 */
var BATCH_PLANNING_DAY_SCHEDULER_TEST_BUILD='2026-09-17_BATCH_PLANNING_DAY_SCHEDULER_TESTS_R1_ANCHORS';
function RUN_BATCH_PLANNING_DAY_SCHEDULER_REGRESSION(){
 var results=[];function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningDayScheduler_Build)+String(BatchPlanningDayScheduler_anchors_);
 test('schedulerAvailable',function(){return typeof BatchPlanningDayScheduler_Build==='function';});
 test('canonicalAvailabilityOwner',function(){return src.indexOf('AvailabilityService.getAuditorAvailabilityRaw')>=0;});
 test('existingAuditsFixedAnchors',function(){return src.indexOf('fixedAnchorsImmutable:true')>=0&&src.indexOf("fixed:true,source:'AvailabilityService'")>=0;});
 test('slot1AndSlot2Anchors',function(){return src.indexOf("'S1'")>=0&&src.indexOf("'S2'")>=0;});
 test('auditHoursLeading',function(){return src.indexOf('auditHoursLeading:true')>=0;});
 test('eightNineHourTarget',function(){return src.indexOf('min:8,max:9,hardCap:false')>=0;});
 test('noTravelHardCap',function(){return src.indexOf('travelHardDayCap:false')>=0;});
 test('overTargetSoftOnly',function(){return src.indexOf('AUDIT_HOURS_ABOVE_TARGET')>=0&&src.indexOf('advisory:true')>=0;});
 test('underTargetSoftOnly',function(){return src.indexOf('AUDIT_HOURS_BELOW_TARGET')>=0;});
 test('formalCandidateDaysUsed',function(){return src.indexOf('hardAvailableDays')>=0&&src.indexOf('schedulableFrom')>=0&&src.indexOf('schedulableTo')>=0;});
 test('noPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 var anchors=BatchPlanningDayScheduler_anchors_({meta:{auditId1:'A1',slot1Start:'08:30',slot1End:'12:30',status1:'Accepted',auditId2:'A2',slot2Start:'13:30',slot2End:'17:30',status2:'Approved'}});
 test('anchorExtraction',function(){return anchors.length===2&&anchors[0].fixed===true&&anchors[1].fixed===true;});
 test('anchorHours',function(){return BatchPlanningDayScheduler_anchorHours_(anchors)===8;});
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_DAY_SCHEDULER_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contract:'Existing planned audits from canonical AvailabilityService are immutable anchors. Candidate audit hours are distributed toward 8-9 audit hours/day as a soft target; no invented total-day or travel hard cap.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
