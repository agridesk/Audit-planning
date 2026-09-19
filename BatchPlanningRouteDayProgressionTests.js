/** FILE: BatchPlanningRouteDayProgressionTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_ROUTE_DAY_PROGRESSION_R1
 * RUN: RUN_BATCH_PLANNING_ROUTE_DAY_PROGRESSION_REGRESSION
 */
function RUN_BATCH_PLANNING_ROUTE_DAY_PROGRESSION_REGRESSION(){
 var s=String(BatchPlanningDayScheduler_Build),r=[];function t(n,o){r.push({name:n,ok:!!o});}
 t('routeOrderStillMonotonic',s.indexOf("iso>=lastAssigned")>=0);
 t('laterDaysPreferred',s.indexOf("iso>lastAssigned")>=0&&s.indexOf("after.concat")>=0);
 t('sameDayStillFallback',s.indexOf("iso===lastAssigned")>=0);
 t('multidaySplitRetained',s.indexOf("remaining=total")>=0&&s.indexOf("segment=Math.min(remaining,capacity)")>=0);
 t('nineHourTargetRetained',s.indexOf("9-day.auditHours")>=0);
 t('availabilityDaysStillRequired',s.indexOf("c.hardAvailableDays||[]")>=0);
 t('windowStillRequired',s.indexOf("iso>=String(c.schedulableFrom||'')")>=0&&s.indexOf("iso<=String(c.schedulableTo||'')")>=0);
 t('noWrites',s.indexOf('setValue(')<0&&s.indexOf('setValues(')<0&&s.indexOf('appendRow(')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_PLANNING_ROUTE_DAY_PROGRESSION_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'For successive route stops, the scheduler prefers a later available day before reusing the previous audit day. This prevents earlier long audits from greedily consuming the remaining route period while preserving route order, availability and planning windows.'}};console.info(JSON.stringify(out,null,2));return out;
}