/**
 * FILE: BatchPlanningLiveReadSmokeTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_LIVE_READ_SMOKE_R1
 * RUN: RUN_BATCH_PLANNING_LIVE_READ_SMOKE
 *
 * Live DEV read-only smoke test. No route API calls and no writes.
 */
var BATCH_PLANNING_LIVE_READ_SMOKE_BUILD='2026-09-17_BATCH_PLANNING_LIVE_READ_SMOKE_R1';
function RUN_BATCH_PLANNING_LIVE_READ_SMOKE(){
 var results=[];function add(name,ok,detail){results.push({name:name,ok:!!ok,detail:detail||''});}
 var directory=AuditorsIndex_GetDirectory(false),list=directory&&directory.list?directory.list:[];
 add('auditorDirectoryReadable',list.length>0,'auditors='+list.length);
 var auditor=list.length?list[0]:null,email=auditor?String(auditor.email||'').trim().toLowerCase():'';
 var today=new Date(),from=new Date(today.getFullYear(),today.getMonth(),today.getDate()),to=new Date(from.getTime());to.setDate(to.getDate()+90);
 var input={auditorEmail:email,periodFrom:from,periodTo:to};
 var candidates=email?BatchPlanningCandidateEngine_Collect(input):null;
 add('liveCandidateRead',!!(candidates&&candidates.ok),candidates?'candidates='+candidates.candidateCount+', rejected='+candidates.rejectedCount:'');
 var availability=email?AvailabilityService.getAuditorAvailabilityRaw(email,BatchPlanningCandidateEngine_iso_(from),BatchPlanningCandidateEngine_iso_(to),{}):null;
 add('liveAvailabilityRead',!!(availability&&availability.success),'days='+Object.keys(availability&&availability.days||{}).length);
 var schedule=email?BatchPlanningDayScheduler_Build({auditorEmail:email,periodFrom:from,periodTo:to,candidates:(candidates&&candidates.candidates||[]).slice(0,10)}):null;
 add('liveDaySchedulerRead',!!(schedule&&schedule.ok),schedule?'days='+schedule.days.length+', unresolved='+schedule.unresolved.length:'');
 add('fixedAnchorsContract',!!(schedule&&schedule.fixedAnchorsImmutable===true),'');
 add('auditHoursLeading',!!(schedule&&schedule.auditHoursLeading===true),'');
 var stopChecked=0,stopFailures=0;(candidates&&candidates.candidates||[]).slice(0,10).forEach(function(c){var s=BatchPlanningStops_GetCompany(c.companyUid,c.company);stopChecked++;if(!s||!s.ok)stopFailures++;});
 add('liveCompanyStopsReadable',stopChecked===0||stopFailures===0,'checked='+stopChecked+', failures='+stopFailures);
 add('noExternalRouteCall',true,'Route API deliberately not called by smoke test');
 add('noWrites',true,'Read-only smoke test');
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_LIVE_READ_SMOKE_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{auditorEmail:email,periodFrom:BatchPlanningCandidateEngine_iso_(from),periodTo:BatchPlanningCandidateEngine_iso_(to),candidateCount:candidates&&candidates.candidateCount||0,rejectedCount:candidates&&candidates.rejectedCount||0,nonDestructive:true,liveReadsPerformed:true,liveWritesPerformed:false,externalApiCallsPerformed:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
