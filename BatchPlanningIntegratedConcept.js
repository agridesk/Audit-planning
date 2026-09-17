/**
 * FILE: BatchPlanningIntegratedConcept.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_INTEGRATED_CONCEPT_R1
 *
 * Read-only orchestration layer for Batch Planning.
 * Connects canonical candidate gates, route concept, multi-location stop validation,
 * and day scheduling around immutable existing audit anchors.
 * Produces ONE advisory concept. No planning writes.
 */
var BATCH_PLANNING_INTEGRATED_CONCEPT_BUILD='2026-09-17_BATCH_PLANNING_INTEGRATED_CONCEPT_R1';

function BatchPlanningIntegratedConcept_Generate(input){
 input=input||{};
 var candidates=BatchPlanningCandidateEngine_Collect(input);
 if(!candidates||!candidates.ok)return candidates||{ok:false,error:'CANDIDATE_COLLECTION_FAILED',writesPerformed:false};
 var stopIssues=[],schedulable=[];
 (candidates.candidates||[]).forEach(function(c){
   var stops=BatchPlanningStops_GetCompany(c.companyUid,c.company);
   if(!stops||!stops.ok){stopIssues.push({auditId:c.auditId,reason:'COMPANY_STOPS_UNRESOLVED'});schedulable.push(c);return;}
   var separate=(stops.stops||[]).filter(function(s){return s.separatePlanningStop===true;});
   if(separate.length){
     var allocation=BatchPlanningStops_BuildDefaultAllocation(c.hoursToBePlanned,stops.stops);
     c.batchPlanningStops=stops.stops;c.stopAllocation=allocation;
     if(!allocation.ok){stopIssues.push({auditId:c.auditId,reason:allocation.validation&&allocation.validation.error||'STOP_HOURS_ALLOCATION_REQUIRED',requiresPlannerAllocation:true});return;}
   }
   schedulable.push(c);
 });
 var routeInput={};Object.keys(input).forEach(function(k){routeInput[k]=input[k];});
 var originalCollector=BatchPlanningCandidateEngine_Collect;
 var routeConcept;
 try{
   BatchPlanningCandidateEngine_Collect=function(){var copy={};Object.keys(candidates).forEach(function(k){copy[k]=candidates[k];});copy.candidates=schedulable;copy.candidateCount=schedulable.length;return copy;};
   routeConcept=BatchPlanningConceptEngine_Generate(routeInput);
 } finally {BatchPlanningCandidateEngine_Collect=originalCollector;}
 if(!routeConcept||!routeConcept.ok)return routeConcept||{ok:false,error:'ROUTE_CONCEPT_FAILED',writesPerformed:false};
 var schedulerInput={auditorEmail:input.auditorEmail,periodFrom:input.periodFrom,periodTo:input.periodTo,candidates:routeConcept.concept||[]};
 var schedule=BatchPlanningDayScheduler_Build(schedulerInput);
 if(!schedule||!schedule.ok)return schedule||{ok:false,error:'DAY_SCHEDULE_FAILED',writesPerformed:false};
 return{ok:true,build:BATCH_PLANNING_INTEGRATED_CONCEPT_BUILD,advisoryOnly:true,oneIdealConceptPlan:true,auditor:candidates.auditor,period:candidates.period,boundaries:routeConcept.boundaries,candidateCount:candidates.candidateCount,routedCandidateCount:(routeConcept.concept||[]).length,days:schedule.days,routeLegs:routeConcept.routeLegs||[],outboundLeg:routeConcept.outboundLeg||null,rejected:candidates.rejected||[],unresolved:(routeConcept.unresolved||[]).concat(schedule.unresolved||[]),stopIssues:stopIssues,fixedAnchorsImmutable:true,hoursToBePlannedLeading:true,stopHoursExactSumRequired:true,travelTimeLeading:true,distanceInformational:true,plannerDragDropLeading:true,explicitConfirmationRequired:true,writesPerformed:false};
}
