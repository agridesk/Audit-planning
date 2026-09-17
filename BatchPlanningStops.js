/**
 * FILE: BatchPlanningStops.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_STOPS_R1
 *
 * Read-only adapter over canonical Companies.Locations_JSON.
 * Backwards compatible: absent separatePlanningStop => false.
 * defaultPlanningHours is optional distribution metadata only.
 * Hours to be planned remains canonical total and allocation must sum exactly.
 */
var BATCH_PLANNING_STOPS_BUILD='2026-09-17_BATCH_PLANNING_STOPS_R1';
function BatchPlanningStops_GetCompany(companyUid,companyName){
 var rec=CompaniesIndex_GetCompanyCoreByUidOrName(companyUid,companyName);if(!rec)return{ok:false,error:'COMPANY_NOT_FOUND',stops:[]};
 var locs=rec.locationsSummary&&Array.isArray(rec.locationsSummary.locations)?rec.locationsSummary.locations:[];
 return{ok:true,build:BATCH_PLANNING_STOPS_BUILD,companyUid:rec.companyUid||companyUid||'',companyName:rec.companyName||companyName||'',owner:'Companies.Locations_JSON',stops:locs.map(BatchPlanningStops_normalizeLocation_)};
}
function BatchPlanningStops_normalizeLocation_(loc){loc=loc||{};var h=loc.defaultPlanningHours;h=(h==null||h==='')?null:Number(h);if(h!=null&&!isFinite(h))h=null;return{code:String(loc.code||'').trim(),label:String(loc.label||'').trim(),gps:String(loc.gps||'').trim(),comment:String(loc.comment||'').trim(),separatePlanningStop:loc.separatePlanningStop===true,defaultPlanningHours:h};}
function BatchPlanningStops_ValidateAllocation(hoursToBePlanned,allocations){
 var total=Number(hoursToBePlanned),list=Array.isArray(allocations)?allocations:[];if(!isFinite(total)||total<0)return{ok:false,error:'CANONICAL_HOURS_INVALID'};
 var sum=0,invalid=[];list.forEach(function(a,i){var h=Number(a&&a.hours);if(!isFinite(h)||h<0)invalid.push(i);else sum+=h;});
 var exact=Math.abs(sum-total)<0.000001;return{ok:invalid.length===0&&exact,canonicalHoursToBePlanned:total,allocatedHours:sum,exactSum:exact,invalidAllocationIndexes:invalid,error:invalid.length?'STOP_HOURS_INVALID':(exact?'':'STOP_HOURS_SUM_MISMATCH')};
}
function BatchPlanningStops_BuildDefaultAllocation(hoursToBePlanned,stops){
 var list=(stops||[]).filter(function(s){return s&&s.separatePlanningStop===true;});if(!list.length)return{ok:true,allocations:[],validation:BatchPlanningStops_ValidateAllocation(Number(hoursToBePlanned),[{hours:Number(hoursToBePlanned)}]),requiresPlannerAllocation:false};
 var allocations=list.map(function(s){return{code:s.code,label:s.label,hours:s.defaultPlanningHours};});var complete=allocations.every(function(a){return a.hours!=null&&isFinite(Number(a.hours));});
 var validation=complete?BatchPlanningStops_ValidateAllocation(hoursToBePlanned,allocations):{ok:false,error:'STOP_HOURS_ALLOCATION_REQUIRED',canonicalHoursToBePlanned:Number(hoursToBePlanned)};
 return{ok:validation.ok,allocations:allocations,validation:validation,requiresPlannerAllocation:!validation.ok};
}
