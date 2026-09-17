/** FILE: BatchPlanningStopsTests.gs | BUILD: 2026-09-17_BATCH_PLANNING_STOPS_TESTS_R1 | RUN: RUN_BATCH_PLANNING_STOPS_REGRESSION */
function RUN_BATCH_PLANNING_STOPS_REGRESSION(){var r=[];function t(n,f){try{var o=!!f();r.push({name:n,ok:o,detail:o?'':'Contract failed'});}catch(e){r.push({name:n,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningStops_GetCompany)+String(BatchPlanningStops_normalizeLocation_)+String(BatchPlanningStops_ValidateAllocation)+String(BatchPlanningStops_BuildDefaultAllocation);
 t('canonicalLocationOwner',function(){return src.indexOf("owner:'Companies.Locations_JSON'")>=0;});
 t('separateStopDefaultFalse',function(){return BatchPlanningStops_normalizeLocation_({code:'HQ'}).separatePlanningStop===false;});
 t('separateStopTruePreserved',function(){return BatchPlanningStops_normalizeLocation_({separatePlanningStop:true}).separatePlanningStop===true;});
 t('defaultHoursOptional',function(){return BatchPlanningStops_normalizeLocation_({}).defaultPlanningHours===null;});
 t('canonicalHoursLeading',function(){var x=BatchPlanningStops_ValidateAllocation(8,[{hours:4},{hours:4}]);return x.ok&&x.canonicalHoursToBePlanned===8&&x.allocatedHours===8;});
 t('sumMismatchBlocked',function(){var x=BatchPlanningStops_ValidateAllocation(8,[{hours:3},{hours:4}]);return !x.ok&&x.error==='STOP_HOURS_SUM_MISMATCH';});
 t('overAllocationBlocked',function(){return BatchPlanningStops_ValidateAllocation(8,[{hours:5},{hours:4}]).ok===false;});
 t('negativeHoursBlocked',function(){return BatchPlanningStops_ValidateAllocation(8,[{hours:-1},{hours:9}]).error==='STOP_HOURS_INVALID';});
 t('defaultsCanResolveExactAllocation',function(){var x=BatchPlanningStops_BuildDefaultAllocation(8,[{code:'A',separatePlanningStop:true,defaultPlanningHours:4},{code:'B',separatePlanningStop:true,defaultPlanningHours:4}]);return x.ok&&x.requiresPlannerAllocation===false;});
 t('missingDefaultsRequirePlanner',function(){var x=BatchPlanningStops_BuildDefaultAllocation(8,[{code:'A',separatePlanningStop:true,defaultPlanningHours:null},{code:'B',separatePlanningStop:true,defaultPlanningHours:4}]);return !x.ok&&x.requiresPlannerAllocation===true;});
 t('noSilentNormalisation',function(){var x=BatchPlanningStops_BuildDefaultAllocation(8,[{code:'A',separatePlanningStop:true,defaultPlanningHours:3},{code:'B',separatePlanningStop:true,defaultPlanningHours:4}]);return !x.ok&&x.validation.allocatedHours===7;});
 t('readOnly',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 var passed=r.filter(function(x){return x.ok;}).length,out={ok:passed===r.length,build:'2026-09-17_BATCH_PLANNING_STOPS_TESTS_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,contract:'Locations_JSON may expose separatePlanningStop and optional defaultPlanningHours. Hours to be planned remains canonical total; stop allocations must sum exactly and are never silently normalized.'}};Logger.log(JSON.stringify(out,null,2));return out;}
