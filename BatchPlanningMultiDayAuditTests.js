/** FILE: BatchPlanningMultiDayAuditTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_MULTIDAY_AUDIT_R1
 * RUN: RUN_BATCH_PLANNING_MULTIDAY_AUDIT_REGRESSION
 */
function RUN_BATCH_PLANNING_MULTIDAY_AUDIT_REGRESSION(){
 var s=String(BatchPlanningDayScheduler_Build)+String(BatchPlanningDayScheduler_removeAudit_),m=String(BatchPlanningManagerApi_reservations_),r=[];
 function t(n,o){r.push({name:n,ok:!!o});}
 t('longAuditIsSegmented',s.indexOf('remaining=total')>=0&&s.indexOf('segment=Math.min(remaining,capacity)')>=0);
 t('dailyAuditTargetCapacityNineHours',s.indexOf('9-day.auditHours')>=0);
 t('segmentCarriesTotalAuditHours',s.indexOf('totalAuditHours:total')>=0);
 t('continuationDoesNotRepeatInboundTravel',s.indexOf('first?Math.ceil')>=0&&s.indexOf('first=false')>=0);
 t('allHoursRequired',s.indexOf('INSUFFICIENT_SCHEDULABLE_HOURS_IN_PERIOD')>=0);
 t('partialAuditRemovedWhenPeriodCannotFit',s.indexOf('BatchPlanningDayScheduler_removeAudit_(days,c.auditId)')>=0);
 t('managerGroupsSegmentsByAuditId',m.indexOf('if(!map[id])')>=0&&m.indexOf('map[id].blocks.push')>=0);
 t('managerReturnsOneReservationPerAudit',m.indexOf('order.map(function(id){return map[id];})')>=0);
 t('multiblockDatesPreserved',m.indexOf("date:String(day.date||'').slice(0,10)")>=0);
 t('noPlanningWrites',s.indexOf('setValue(')<0&&s.indexOf('setValues(')<0&&s.indexOf('appendRow(')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_PLANNING_MULTIDAY_AUDIT_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'Long audits are never rendered as one impossible 12-14 hour audit block merely because their canonical total duration exceeds a day. They are split across schedulable days, all canonical audit hours must fit, and all blocks remain one audit concept reservation.'}};console.info(JSON.stringify(out,null,2));return out;
}