/**
 * FILE: BatchPlanningDayScheduler.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_DAY_SCHEDULER_R1_ANCHORS
 *
 * Read-only concept day scheduler.
 * - Existing planned audits exposed by canonical AvailabilityService are FIXED anchors.
 * - Candidate audit hours lead; target 8-9 audit hours/day is advisory, not a hard cap.
 * - Travel never creates an invented 10/11-hour hard day limit.
 * - No planning / Availability / lifecycle writes.
 */
var BATCH_PLANNING_DAY_SCHEDULER_BUILD='2026-09-17_BATCH_PLANNING_DAY_SCHEDULER_R1_ANCHORS';

function BatchPlanningDayScheduler_Build(input){
 input=input||{};
 var auditorEmail=String(input.auditorEmail||'').trim().toLowerCase();
 var from=BatchPlanningCandidateEngine_date_(input.periodFrom),to=BatchPlanningCandidateEngine_date_(input.periodTo);
 if(!auditorEmail||!from||!to||to.getTime()<from.getTime())return{ok:false,error:'VALID_AUDITOR_PERIOD_REQUIRED',days:[],writesPerformed:false};
 var raw=AvailabilityService.getAuditorAvailabilityRaw(auditorEmail,BatchPlanningCandidateEngine_iso_(from),BatchPlanningCandidateEngine_iso_(to),{})||{days:{}};
 var days=[],map={},d=new Date(from.getTime());
 while(d.getTime()<=to.getTime()){
   var iso=BatchPlanningCandidateEngine_iso_(d),r=(raw.days||{})[iso]||{},anchors=BatchPlanningDayScheduler_anchors_(r),day={date:iso,fixedAnchors:anchors,conceptAudits:[],auditHours:BatchPlanningDayScheduler_anchorHours_(anchors),targetAuditHours:{min:8,max:9,hardCap:false},warnings:[]};
   days.push(day);map[iso]=day;d.setDate(d.getDate()+1);
 }
 var candidates=Array.isArray(input.candidates)?input.candidates:[],unresolved=[];
 candidates.forEach(function(c){
   var hours=Number(c.hoursToBePlanned||0);if(!isFinite(hours)||hours<=0){unresolved.push({auditId:c.auditId,reason:'AUDIT_HOURS_REQUIRED'});return;}
   var allowed=(c.hardAvailableDays||[]).filter(function(iso){return !!map[iso]&&iso>=String(c.schedulableFrom||'')&&iso<=String(c.schedulableTo||'');});
   if(!allowed.length){unresolved.push({auditId:c.auditId,reason:'NO_SCHEDULABLE_DAY'});return;}
   var best=null;
   allowed.forEach(function(iso){var day=map[iso],after=day.auditHours+hours,score=Math.abs(8.5-after);if(after>9)score+=(after-9)*2;if(!best||score<best.score)best={day:day,score:score};});
   best.day.conceptAudits.push({auditId:c.auditId,company:c.company,hours:hours,fixed:false,source:'BATCH_CONCEPT'});best.day.auditHours+=hours;
 });
 days.forEach(function(day){if(day.auditHours>9)day.warnings.push({code:'AUDIT_HOURS_ABOVE_TARGET',advisory:true,hours:day.auditHours});if(day.auditHours>0&&day.auditHours<8)day.warnings.push({code:'AUDIT_HOURS_BELOW_TARGET',advisory:true,hours:day.auditHours});});
 return{ok:true,build:BATCH_PLANNING_DAY_SCHEDULER_BUILD,advisoryOnly:true,auditorEmail:auditorEmail,days:days,unresolved:unresolved,fixedAnchorsImmutable:true,auditHoursLeading:true,targetAuditHoursPerDay:{min:8,max:9,hardCap:false},travelHardDayCap:false,writesPerformed:false};
}
function BatchPlanningDayScheduler_anchors_(rawDay){
 var meta=(rawDay&&rawDay.meta)||{},out=[],seen={};
 function add(id,start,end,status,slot){id=String(id||'').trim();if(!id||seen[id+'|'+slot])return;seen[id+'|'+slot]=true;out.push({auditId:id,startTime:String(start||''),endTime:String(end||''),status:String(status||''),slot:slot,fixed:true,source:'AvailabilityService'});}
 add(meta.auditId1,meta.slot1Start,meta.slot1End,meta.status1,'S1');add(meta.auditId2,meta.slot2Start,meta.slot2End,meta.status2,'S2');
 return out;
}
function BatchPlanningDayScheduler_anchorHours_(anchors){var mins=0;(anchors||[]).forEach(function(a){var s=BatchPlanningDayScheduler_minutes_(a.startTime),e=BatchPlanningDayScheduler_minutes_(a.endTime);if(isFinite(s)&&isFinite(e)&&e>s)mins+=e-s;});return mins/60;}
function BatchPlanningDayScheduler_minutes_(v){var m=String(v||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):NaN;}
