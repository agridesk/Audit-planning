/**
 * FILE: BatchPlanningRouteMatrixTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_ROUTE_MATRIX_TESTS_R1
 * RUN: RUN_BATCH_PLANNING_ROUTE_MATRIX_REGRESSION
 */
var BATCH_PLANNING_ROUTE_MATRIX_TEST_BUILD='2026-09-17_BATCH_PLANNING_ROUTE_MATRIX_TESTS_R1';
function RUN_BATCH_PLANNING_ROUTE_MATRIX_REGRESSION(){
 var results=[];function test(name,fn){try{var ok=!!fn();results.push({name:name,ok:ok,detail:ok?'':'Contract failed'});}catch(e){results.push({name:name,ok:false,detail:String(e&&e.message||e)});}}
 var src=String(BatchPlanningRouteMatrix_Get)+String(BatchPlanningRouteMatrix_cacheGet_)+String(BatchPlanningRouteMatrix_cachePut_);
 test('adapterAvailable',function(){return typeof BatchPlanningRouteMatrix_Get==='function';});
 test('googleRoutesProvider',function(){return src.indexOf('routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')>=0;});
 test('existingMapsKeyReused',function(){return src.indexOf('GOOGLE_MAPS_API_KEY')>=0;});
 test('routeCacheRequired',function(){return src.indexOf('BatchPlanningRouteMatrix_cacheGet_')>=0&&src.indexOf('BatchPlanningRouteMatrix_cachePut_')>=0;});
 test('auditCachePreferred',function(){return src.indexOf('AUDIT_CACHE')>=0;});
 test('scriptCacheFallback',function(){return src.indexOf('CacheService.getScriptCache')>=0;});
 test('travelTimeLeading',function(){return src.indexOf('travelTimeLeading:true')>=0;});
 test('distanceInformational',function(){return src.indexOf('distanceInformational:true')>=0;});
 test('noPlanningWrites',function(){return src.indexOf('setValue(')<0&&src.indexOf('setValues(')<0&&src.indexOf('appendRow(')<0;});
 test('invalidPointRejected',function(){var x=BatchPlanningRouteMatrix_Get({},{} ,{noApiCall:true});return x.ok===false&&x.error==='ROUTE_POINT_INVALID';});
 test('cacheMissCanBeNonBillable',function(){var x=BatchPlanningRouteMatrix_Get({label:'Valencia'},{label:'Lisbon'},{noApiCall:true,forceFresh:true});return x.ok===false&&x.error==='ROUTE_CACHE_MISS_API_DISABLED';});
 var cfg=BatchPlanningRouteMatrix_GetConfig();
 test('configReadable',function(){return cfg&&cfg.ok===true;});
 test('configReportsApiKeyState',function(){return typeof cfg.apiKeyConfigured==='boolean';});
 var passed=results.filter(function(x){return x.ok;}).length,out={ok:passed===results.length,build:BATCH_PLANNING_ROUTE_MATRIX_TEST_BUILD,total:results.length,passed:passed,failed:results.length-passed,results:results,meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,externalApiCallsPerformed:false,apiKeyConfigured:cfg.apiKeyConfigured,contract:'Cached Google Routes Compute Route Matrix adapter is installed. Regression is deliberately non-billable; it validates configuration and contracts without making an external route call.'}};Logger.log(JSON.stringify(out,null,2));return out;
}
