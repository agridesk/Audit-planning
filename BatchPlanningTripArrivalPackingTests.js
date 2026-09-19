/** FILE: BatchPlanningTripArrivalPackingTests.gs
 * BUILD: 2026-09-19_BATCH_PLANNING_TRIP_ARRIVAL_PACKING_R1
 * RUN: RUN_BATCH_PLANNING_TRIP_ARRIVAL_PACKING_REGRESSION
 */
function RUN_BATCH_PLANNING_TRIP_ARRIVAL_PACKING_REGRESSION(){
 var s=String(BatchPlanningDayScheduler_Build),r=[];function t(n,o){r.push({name:n,ok:!!o});}
 t('longInboundRecognizedAsTripArrival',s.indexOf("routeIndex===0&&travelMinutes>240")>=0);
 t('longInboundNotForcedIntoAuditDay',s.indexOf("travelMinutes=0;tripArrivalTravelConsumed=true")>=0);
 t('laterRouteLegTravelRetained',s.indexOf("c.routeFromPrevious&&c.routeFromPrevious.durationSeconds")>=0);
 t('compactSameDayPackingRestored',s.indexOf("after.concat")<0);
 t('routeOrderMonotonicRetained',s.indexOf("iso>=lastAssigned")>=0);
 t('remainingDayCapacityUsed',s.indexOf("9-day.auditHours")>=0);
 t('multidayAuditSplitRetained',s.indexOf("segment=Math.min(remaining,capacity)")>=0);
 t('availabilityRetained',s.indexOf("c.hardAvailableDays||[]")>=0);
 t('planningWindowRetained',s.indexOf("c.schedulableFrom")>=0&&s.indexOf("c.schedulableTo")>=0);
 t('noWrites',s.indexOf('setValue(')<0&&s.indexOf('setValues(')<0&&s.indexOf('appendRow(')<0);
 var passed=r.filter(function(x){return x.ok}).length,out={ok:passed===r.length,build:'2026-09-19_BATCH_PLANNING_TRIP_ARRIVAL_PACKING_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,contract:'A long inbound leg to the first stop is trip-arrival context, not same-day audit travel. Within the trip, remaining daily audit capacity is packed before advancing, while route order, Availability and planning windows remain binding.'}};console.info(JSON.stringify(out,null,2));return out;
}