/**
 * FILE: BatchPlanningConceptEngine.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_CONCEPT_ENGINE_R1_ROUTE_CHAIN
 *
 * Read-only first concept-plan engine.
 * Generates ONE advisory route-ordered concept from the canonical candidate engine.
 * Travel time is leading; formal planning windows / Availability remain candidate gates.
 * No planning writes. Planner retains drag/drop and final confirmation control.
 */
var BATCH_PLANNING_CONCEPT_ENGINE_BUILD='2026-09-17_BATCH_PLANNING_CONCEPT_ENGINE_R1_ROUTE_CHAIN';

function BatchPlanningConceptEngine_Generate(input){
 input=input||{};
 var collected=BatchPlanningCandidateEngine_Collect(input);
 if(!collected||!collected.ok)return collected||{ok:false,error:'CANDIDATE_COLLECTION_FAILED'};
 var boundaries=BatchPlanningConceptEngine_boundaries_(input,collected.auditor||{});
 if(!boundaries.inbound.ok||!boundaries.outbound.ok)return{ok:false,error:'BOUNDARY_POINT_REQUIRED',boundaries:boundaries,candidates:collected.candidates||[],writesPerformed:false};
 var unresolved=[],pool=[];
 (collected.candidates||[]).forEach(function(c){
   var destination=BatchPlanning_getCompanyLocation_(c.company,c.location);
   if(!destination||!destination.ok){unresolved.push({auditId:c.auditId,company:c.company,reason:'AUDIT_LOCATION_UNRESOLVED',destination:destination||null});return;}
   var copy={};Object.keys(c).forEach(function(k){copy[k]=c[k];});copy.destination=destination;copy.routePending=false;pool.push(copy);
 });
 var ordered=[],legs=[],origin=boundaries.inbound,remaining=pool.slice();
 while(remaining.length){
   var bestIndex=-1,bestRoute=null;
   for(var i=0;i<remaining.length;i++){
     var route=BatchPlanningRouteMatrix_Get(origin,remaining[i].destination.point,{noApiCall:input.noApiCall===true,forceFresh:input.forceFreshRoutes===true});
     if(!route||!route.ok)continue;
     if(!bestRoute||Number(route.durationSeconds)<Number(bestRoute.durationSeconds)||(Number(route.durationSeconds)===Number(bestRoute.durationSeconds)&&Number(route.distanceMeters)<Number(bestRoute.distanceMeters))){bestIndex=i;bestRoute=route;}
   }
   if(bestIndex<0){remaining.forEach(function(c){unresolved.push({auditId:c.auditId,company:c.company,reason:'ROUTE_UNRESOLVED'});});break;}
   var selected=remaining.splice(bestIndex,1)[0];
   selected.routeFromPrevious={durationSeconds:bestRoute.durationSeconds,distanceMeters:bestRoute.distanceMeters,cacheHit:!!bestRoute.cacheHit,travelTimeLeading:true};
   ordered.push(selected);legs.push({from:origin,to:selected.destination.point,auditId:selected.auditId,durationSeconds:bestRoute.durationSeconds,distanceMeters:bestRoute.distanceMeters,cacheHit:!!bestRoute.cacheHit});
   origin=selected.destination.point;
 }
 var outboundLeg=null;
 if(ordered.length){var outRoute=BatchPlanningRouteMatrix_Get(origin,boundaries.outbound,{noApiCall:input.noApiCall===true,forceFresh:input.forceFreshRoutes===true});if(outRoute&&outRoute.ok)outboundLeg={from:origin,to:boundaries.outbound,durationSeconds:outRoute.durationSeconds,distanceMeters:outRoute.distanceMeters,cacheHit:!!outRoute.cacheHit};else unresolved.push({reason:'OUTBOUND_ROUTE_UNRESOLVED'});}
 return{ok:true,build:BATCH_PLANNING_CONCEPT_ENGINE_BUILD,advisoryOnly:true,oneIdealConceptPlan:true,plannerControlsFinalSelection:true,manualDragDropAfterGeneration:true,noAutomaticReoptimisationAfterPlannerMove:true,auditor:collected.auditor,period:collected.period,boundaries:boundaries,candidateCount:collected.candidateCount,conceptCount:ordered.length,concept:ordered,routeLegs:legs,outboundLeg:outboundLeg,unresolved:unresolved,rejected:collected.rejected||[],travelTimeLeading:true,distanceInformational:true,writesPerformed:false};
}
function BatchPlanningConceptEngine_boundaries_(input,auditor){
 var homeRaw=input.home||input.auditorDeparturePoint||auditor.defaultDepartureFrom||'';
 var home=BatchPlanning_normalizePoint_(homeRaw);
 var inbound=BatchPlanning_normalizePoint_(input.inboundPoint||input.previousPlannedStop||homeRaw);
 var outbound=BatchPlanning_normalizePoint_(input.outboundPoint||input.nextPlannedStop||homeRaw);
 return{home:home,inbound:inbound,outbound:outbound,inboundSource:input.inboundPoint?'PLANNER_OVERRIDE':(input.previousPlannedStop?'PREVIOUS_PLANNED_STOP':'HOME'),outboundSource:input.outboundPoint?'PLANNER_OVERRIDE':(input.nextPlannedStop?'NEXT_PLANNED_STOP':'HOME')};
}
function RUN_BATCH_PLANNING_CONCEPT_ENGINE_DIAGNOSTICS(){
 var directory=AuditorsIndex_GetDirectory(false),list=directory&&directory.list?directory.list:[],auditor=list.length?list[0].email:'',today=new Date(),to=new Date(today.getTime());to.setDate(to.getDate()+90);
 var out=BatchPlanningConceptEngine_Generate({auditorEmail:auditor,periodFrom:today,periodTo:to,noApiCall:true});
 Logger.log(JSON.stringify({ok:out.ok,build:out.build,auditorEmail:auditor,candidateCount:out.candidateCount,conceptCount:out.conceptCount,unresolved:(out.unresolved||[]).length,writesPerformed:false},null,2));return out;
}
