/** FILE: BatchPlanningValenciaPackingDiagnostics.gs
 * BUILD: 2026-09-19_VALENCIA_PACKING_DIAGNOSTICS_R1
 * RUN: RUN_VALENCIA_ABC_PACKING_DIAGNOSTICS
 * Read-only evidence diagnostic for the currently selected David Pastor / 14-15 Oct 2026 batch.
 */
function RUN_VALENCIA_ABC_PACKING_DIAGNOSTICS(){
 var input={auditorEmail:'david@agriqa.es',periodFrom:'2026-10-14',periodTo:'2026-10-15',inboundPoint:'Valencia',outboundPoint:'Valencia',forceFreshRoutes:true};
 var res=BatchPlanningIntegratedConcept_Generate(input),out={ok:!!(res&&res.ok),build:'2026-09-19_VALENCIA_PACKING_DIAGNOSTICS_R1',input:input};
 if(!res||!res.ok){out.error=res&&res.error||'CONCEPT_FAILED';console.info(JSON.stringify(out,null,2));return out;}
 out.candidates=(res.candidates||[]).map(function(c){return{auditId:c.auditId,company:c.company,scopes:c.scopes,formalHours:c.hoursToBePlanned,schedulingHours:c.schedulingHours,schedulingHoursSource:c.schedulingHoursSource,routeFromPrevious:c.routeFromPrevious&&{durationSeconds:c.routeFromPrevious.durationSeconds,distanceMeters:c.routeFromPrevious.distanceMeters,from:c.routeFromPrevious.from,to:c.routeFromPrevious.to},hardAvailableDays:c.hardAvailableDays,schedulableFrom:c.schedulableFrom,schedulableTo:c.schedulableTo};});
 out.routeLegs=(res.routeLegs||[]).map(function(x){return{from:x.from,to:x.to,durationSeconds:x.durationSeconds,distanceMeters:x.distanceMeters,status:x.status||x.routeStatus||''};});
 out.days=(res.days||[]).map(function(d){return{date:d.date,fixedAnchors:d.fixedAnchors,conceptAudits:(d.conceptAudits||[]).map(function(a){return{auditId:a.auditId,company:a.company,start:a.startTime,end:a.endTime,hours:a.hours,travelMinutesFromPrevious:a.travelMinutesFromPrevious,routeIndex:a.routeIndex,totalAuditHours:a.totalAuditHours,totalSchedulingHours:a.totalSchedulingHours};}),auditHours:d.auditHours,warnings:d.warnings};});
 out.unresolved=res.unresolved||[];out.rejected=res.rejected||[];out.pendingPlannerAllocation=res.pendingPlannerAllocation||[];
 console.info(JSON.stringify(out,null,2));return out;
}