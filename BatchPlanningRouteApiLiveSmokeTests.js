/** FILE: BatchPlanningRouteApiLiveSmokeTests.gs
 * BUILD: 2026-09-17_BATCH_PLANNING_ROUTE_API_LIVE_SMOKE_R1
 * RUN: RUN_BATCH_PLANNING_ROUTE_API_LIVE_SMOKE
 * Non-destructive provider smoke. No planning/status/availability writes.
 */
function RUN_BATCH_PLANNING_ROUTE_API_LIVE_SMOKE(){
 var r=[];function t(n,ok,detail){r.push({name:n,ok:!!ok,detail:ok?'':String(detail||'')});}
 var cfg=BatchPlanningRouteMatrix_GetConfig();t('configReadable',!!(cfg&&cfg.ok),cfg&&cfg.error);t('apiKeyConfigured',!!(cfg&&cfg.apiKeyConfigured),'GOOGLE_MAPS_API_KEY missing');
 var origin='Valencia, Spain',destination='Alicante, Spain',route=null;
 if(cfg&&cfg.apiKeyConfigured){route=BatchPlanningRouteMatrix_Get(origin,destination,{forceFresh:true,noApiCall:false});t('liveRouteResolved',!!(route&&route.ok),route&&route.error);t('durationAvailable',!!(route&&isFinite(Number(route.durationSeconds))&&Number(route.durationSeconds)>0),'No duration');t('distanceAvailable',!!(route&&isFinite(Number(route.distanceMeters))&&Number(route.distanceMeters)>0),'No distance');t('providerCorrect',!!(route&&route.provider==='Google Routes API / Compute Route Matrix'),'Unexpected provider');t('travelTimeLeading',!!(route&&route.travelTimeLeading===true),'Travel-time flag missing');t('distanceInformational',!!(route&&route.distanceInformational===true),'Distance flag missing');}else{t('liveRouteResolved',false,'API key unavailable');t('durationAvailable',false,'API key unavailable');t('distanceAvailable',false,'API key unavailable');t('providerCorrect',false,'API key unavailable');t('travelTimeLeading',false,'API key unavailable');t('distanceInformational',false,'API key unavailable');}
 var passed=r.filter(function(x){return x.ok;}).length,out={ok:passed===r.length,build:'2026-09-17_BATCH_PLANNING_ROUTE_API_LIVE_SMOKE_R1',total:r.length,passed:passed,failed:r.length-passed,results:r,meta:{origin:origin,destination:destination,providerCallAttempted:!!(cfg&&cfg.apiKeyConfigured),planningWritesPerformed:false,statusWritesPerformed:false,availabilityWritesPerformed:false,durationSeconds:route&&route.ok?route.durationSeconds:null,distanceMeters:route&&route.ok?route.distanceMeters:null}};Logger.log(JSON.stringify(out,null,2));return out;
}
