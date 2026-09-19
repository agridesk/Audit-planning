/** FILE: BatchPlanningTwoAuditTravelPackingTests.gs
 * BUILD: 2026-09-19_BATCH_TWO_AUDIT_TRAVEL_PACKING_R1
 * RUN: RUN_BATCH_TWO_AUDIT_TRAVEL_PACKING_REGRESSION
 */
function RUN_BATCH_TWO_AUDIT_TRAVEL_PACKING_REGRESSION(){
 var r=[];function t(n,v,d){r.push({name:n,ok:!!v,detail:d||''});}
 function fakeRaw(){return{days:{'2026-10-12':{meta:{}}}};}
 var old=AvailabilityService.getAuditorAvailabilityRaw;
 try{
  AvailabilityService.getAuditorAvailabilityRaw=function(){return fakeRaw();};
  function c(id,travel){return{auditId:id,company:id,hoursToBePlanned:5,schedulingHours:4,schedulingHoursSource:'Config_Scopes.Scheduling_hours',hardAvailableDays:['2026-10-12'],schedulableFrom:'2026-10-12',schedulableTo:'2026-10-12',routeFromPrevious:{durationSeconds:travel*60}};}
  var ok=BatchPlanningDayScheduler_Build({auditorEmail:'test@example.com',periodFrom:'2026-10-12',periodTo:'2026-10-12',candidates:[c('ABC-1',0),c('ABC-2',30)]});
  var parts=ok.days[0].conceptAudits||[];
  t('twoAuditsFitWith30MinTravel',ok.unresolved.length===0&&parts.length===2,JSON.stringify({parts:parts,unresolved:ok.unresolved}));
  t('firstAuditUses4SchedulingHours',parts[0]&&Number(parts[0].hours)===4);
  t('secondAuditUses4SchedulingHours',parts[1]&&Number(parts[1].hours)===4);
  t('formalFiveHoursPreserved',parts.length===2&&parts.every(function(x){return Number(x.totalAuditHours)===5;}));
  t('interAuditTravelPreserved',parts[1]&&Number(parts[1].travelMinutesFromPrevious)===30);
  t('secondStartsAfterTravel',parts[1]&&parts[1].startTime==='12:30',parts[1]?parts[1].startTime:'');
  var no=BatchPlanningDayScheduler_Build({auditorEmail:'test@example.com',periodFrom:'2026-10-12',periodTo:'2026-10-12',candidates:[c('ABC-1',0),c('ABC-2',90)]});
  t('twoAuditsRejectedWhenTravelMakesDayTooLong',no.unresolved.some(function(x){return x.auditId==='ABC-2';}),JSON.stringify(no.unresolved));
  t('failedSecondAuditNotLeftPartiallyScheduled',(no.days[0].conceptAudits||[]).filter(function(x){return x.auditId==='ABC-2';}).length===0);
 }finally{AvailabilityService.getAuditorAvailabilityRaw=old;}
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_TWO_AUDIT_TRAVEL_PACKING_R1',total:r.length,passed:passed,failed:r.length-passed,results:r};console.info(JSON.stringify(out,null,2));return out;
}