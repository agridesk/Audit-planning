/**
 * FILE: BatchPlanningStops.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_STOPS_R2_CANONICAL_METADATA
 *
 * Read-only adapter over canonical Companies.Locations_JSON.
 * Batch-specific metadata is read through CompaniesIndexBatchPlanning so the
 * CompaniesIndexService V4 AMS01 hot path remains unchanged.
 */
var BATCH_PLANNING_STOPS_BUILD='2026-09-17_BATCH_PLANNING_STOPS_R2_CANONICAL_METADATA';
function BatchPlanningStops_GetCompany(companyUid,companyName){
 var raw=CompaniesIndexBatchPlanning_GetLocations(companyUid,companyName);if(!raw||!raw.ok)return{ok:false,error:raw&&raw.error||'COMPANY_NOT_FOUND',stops:[]};
 return{ok:true,build:BATCH_PLANNING_STOPS_BUILD,companyUid:raw.companyUid||companyUid||'',companyName:raw.companyName||companyName||'',owner:'Companies.Locations_JSON',stops:(raw.locations||[]).map(BatchPlanningStops_normalizeLocation_)};
}
function BatchPlanningStops_normalizeLocation_(loc){loc=loc||{};var h=loc.defaultPlanningHours;h=(h==null||h==='')?null:Number(h);if(h!=null&&!isFinite(h))h=null;return{code:String(loc.code||'').trim(),label:String(loc.label||'').trim(),gps:String(loc.gps||'').trim(),comment:String(loc.comment||'').trim(),separatePlanningStop:loc.separatePlanningStop===true,defaultPlanningHours:h};}
function BatchPlanningStops_ValidateAllocation(hoursToBePlanned,allocations){var total=Number(hoursToBePlanned),list=Array.isArray(allocations)?allocations:[];if(!isFinite(total)||total<0)return{ok:false,error:'CANONICAL_HOURS_INVALID'};var sum=0,invalid=[];list.forEach(function(a,i){var h=Number(a&&a.hours);if(!isFinite(h)||h<0)invalid.push(i);else sum+=h;});var exact=Math.abs(sum-total)<0.000001;return{ok:invalid.length===0&&exact,canonicalHoursToBePlanned:total,allocatedHours:sum,exactSum:exact,invalidAllocationIndexes:invalid,error:invalid.length?'STOP_HOURS_INVALID':(exact?'':'STOP_HOURS_SUM_MISMATCH')};}
function BatchPlanningStops_BuildDefaultAllocation(hoursToBePlanned,stops){var list=(stops||[]).filter(function(s){return s&&s.separatePlanningStop===true;});if(!list.length)return{ok:true,allocations:[],validation:BatchPlanningStops_ValidateAllocation(Number(hoursToBePlanned),[{hours:Number(hoursToBePlanned)}]),requiresPlannerAllocation:false};var allocations=list.map(function(s){return{code:s.code,label:s.label,hours:s.defaultPlanningHours};}),complete=allocations.every(function(a){return a.hours!=null&&isFinite(Number(a.hours));});var validation=complete?BatchPlanningStops_ValidateAllocation(hoursToBePlanned,allocations):{ok:false,error:'STOP_HOURS_ALLOCATION_REQUIRED',canonicalHoursToBePlanned:Number(hoursToBePlanned)};return{ok:validation.ok,allocations:allocations,validation:validation,requiresPlannerAllocation:!validation.ok};}
