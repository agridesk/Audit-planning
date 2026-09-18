/**
 * FILE: BatchPlanningRouteMatrix.gs
 * BUILD: 2026-09-18_BATCH_PLANNING_ROUTE_MATRIX_R3_BATCH_DESTINATIONS
 *
 * Canonical Batch Planning route adapter.
 * - Google Routes API / Compute Route Matrix
 * - GOOGLE_ROUTES_API_KEY from Script Properties (dedicated server-side key)
 * - travel time is leading; distance informational
 * - cache required; no planning writes
 */
var BATCH_PLANNING_ROUTE_MATRIX_BUILD='2026-09-18_BATCH_PLANNING_ROUTE_MATRIX_R3_BATCH_DESTINATIONS';
var BATCH_PLANNING_ROUTE_CACHE_NS='batch_planning_routes';
var BATCH_PLANNING_ROUTE_CACHE_TTL=21600;
var BATCH_PLANNING_ROUTE_API_KEY_PROPERTY='GOOGLE_ROUTES_API_KEY';

function BatchPlanningRouteMatrix_Get(origin,destination,options){
 options=options||{};var o=BatchPlanning_normalizePoint_(origin),d=BatchPlanning_normalizePoint_(destination);
 if(!o.ok||!d.ok)return{ok:false,error:'ROUTE_POINT_INVALID',origin:o,destination:d};
 var key=BatchPlanningRouteMatrix_key_(o,d),cached=!options.forceFresh?BatchPlanningRouteMatrix_cacheGet_(key):null;
 if(cached&&cached.ok){cached.cacheHit=true;return cached;}
 if(options.noApiCall===true)return{ok:false,error:'ROUTE_CACHE_MISS_API_DISABLED',cacheHit:false,origin:o,destination:d};
 var apiKey=BatchPlanningRouteMatrix_apiKey_();
 if(!apiKey)return{ok:false,error:'GOOGLE_ROUTES_API_KEY_MISSING',cacheHit:false};
 var payload={origins:[{waypoint:BatchPlanningRouteMatrix_waypoint_(o)}],destinations:[{waypoint:BatchPlanningRouteMatrix_waypoint_(d)}],travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'};
 var resp=UrlFetchApp.fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{method:'post',contentType:'application/json',headers:{'X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'originIndex,destinationIndex,duration,distanceMeters,status,condition'},payload:JSON.stringify(payload),muteHttpExceptions:true});
 var code=resp.getResponseCode(),text=resp.getContentText();
 if(code<200||code>=300)return{ok:false,error:'ROUTES_API_HTTP_'+code,httpCode:code,detail:String(text||'').slice(0,1000),cacheHit:false};
 var data=JSON.parse(text||'[]'),item=Array.isArray(data)&&data.length?data[0]:null,metric=BatchPlanning_normalizeRouteMetric_(item||{});
 if(!item||!metric.ok)return{ok:false,error:'ROUTE_METRIC_UNAVAILABLE',detail:item||null,cacheHit:false};
 var out={ok:true,build:BATCH_PLANNING_ROUTE_MATRIX_BUILD,provider:'Google Routes API / Compute Route Matrix',cacheHit:false,origin:o,destination:d,durationSeconds:metric.durationSeconds,distanceMeters:metric.distanceMeters,travelTimeLeading:true,distanceInformational:true};
 BatchPlanningRouteMatrix_cachePut_(key,out);return out;
}
function BatchPlanningRouteMatrix_GetMany(origin,destinations,options){
 options=options||{};destinations=Array.isArray(destinations)?destinations:[];var o=BatchPlanning_normalizePoint_(origin),out=new Array(destinations.length),misses=[];
 if(!o.ok)return destinations.map(function(d){return{ok:false,error:'ROUTE_POINT_INVALID',origin:o,destination:BatchPlanning_normalizePoint_(d)};});
 destinations.forEach(function(destination,i){var d=BatchPlanning_normalizePoint_(destination);if(!d.ok){out[i]={ok:false,error:'ROUTE_POINT_INVALID',origin:o,destination:d};return;}var key=BatchPlanningRouteMatrix_key_(o,d),cached=!options.forceFresh?BatchPlanningRouteMatrix_cacheGet_(key):null;if(cached&&cached.ok){cached.cacheHit=true;out[i]=cached;}else misses.push({index:i,destination:d,key:key});});
 if(!misses.length)return out;
 if(options.noApiCall===true){misses.forEach(function(m){out[m.index]={ok:false,error:'ROUTE_CACHE_MISS_API_DISABLED',cacheHit:false,origin:o,destination:m.destination};});return out;}
 var apiKey=BatchPlanningRouteMatrix_apiKey_();if(!apiKey){misses.forEach(function(m){out[m.index]={ok:false,error:'GOOGLE_ROUTES_API_KEY_MISSING',cacheHit:false};});return out;}
 for(var start=0;start<misses.length;start+=625){var chunk=misses.slice(start,start+625),payload={origins:[{waypoint:BatchPlanningRouteMatrix_waypoint_(o)}],destinations:chunk.map(function(m){return{waypoint:BatchPlanningRouteMatrix_waypoint_(m.destination)};}),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE'},resp=UrlFetchApp.fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix',{method:'post',contentType:'application/json',headers:{'X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'originIndex,destinationIndex,duration,distanceMeters,status,condition'},payload:JSON.stringify(payload),muteHttpExceptions:true}),code=resp.getResponseCode(),text=resp.getContentText();
  if(code<200||code>=300){chunk.forEach(function(m){out[m.index]={ok:false,error:'ROUTES_API_HTTP_'+code,httpCode:code,detail:String(text||'').slice(0,1000),cacheHit:false};});continue;}
  var data=JSON.parse(text||'[]'),byDestination={};(Array.isArray(data)?data:[]).forEach(function(item){byDestination[Number(item.destinationIndex)]=item;});
  chunk.forEach(function(m,j){var item=byDestination[j],metric=BatchPlanning_normalizeRouteMetric_(item||{});if(!item||!metric.ok){out[m.index]={ok:false,error:'ROUTE_METRIC_UNAVAILABLE',detail:item||null,cacheHit:false};return;}var route={ok:true,build:BATCH_PLANNING_ROUTE_MATRIX_BUILD,provider:'Google Routes API / Compute Route Matrix',cacheHit:false,batched:true,origin:o,destination:m.destination,durationSeconds:metric.durationSeconds,distanceMeters:metric.distanceMeters,travelTimeLeading:true,distanceInformational:true};BatchPlanningRouteMatrix_cachePut_(m.key,route);out[m.index]=route;});
 }
 return out;
}
function BatchPlanningRouteMatrix_apiKey_(){return String(PropertiesService.getScriptProperties().getProperty(BATCH_PLANNING_ROUTE_API_KEY_PROPERTY)||'').trim();}
function BatchPlanningRouteMatrix_waypoint_(p){if(p.lat!=null&&p.lng!=null)return{location:{latLng:{latitude:Number(p.lat),longitude:Number(p.lng)}}};return{address:String(p.label||p.gps||'')};}
function BatchPlanningRouteMatrix_key_(o,d){function p(x){return x.lat!=null&&x.lng!=null?(Number(x.lat).toFixed(5)+','+Number(x.lng).toFixed(5)):String(x.label||x.gps||'').trim().toLowerCase();}return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,p(o)+'|'+p(d))).replace(/=+$/,'');}
function BatchPlanningRouteMatrix_cacheGet_(key){try{if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.get==='function')return AUDIT_CACHE.get(BATCH_PLANNING_ROUTE_CACHE_NS,key);}catch(e){}try{var s=CacheService.getScriptCache().get(BATCH_PLANNING_ROUTE_CACHE_NS+'|'+key);return s?JSON.parse(s):null;}catch(e2){return null;}}
function BatchPlanningRouteMatrix_cachePut_(key,value){try{if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.put==='function'){AUDIT_CACHE.put(BATCH_PLANNING_ROUTE_CACHE_NS,key,value,BATCH_PLANNING_ROUTE_CACHE_TTL);return;}}catch(e){}try{CacheService.getScriptCache().put(BATCH_PLANNING_ROUTE_CACHE_NS+'|'+key,JSON.stringify(value),BATCH_PLANNING_ROUTE_CACHE_TTL);}catch(e2){}}
function BatchPlanningRouteMatrix_GetConfig(){var key=BatchPlanningRouteMatrix_apiKey_();return{ok:true,build:BATCH_PLANNING_ROUTE_MATRIX_BUILD,provider:'Google Routes API / Compute Route Matrix',apiKeyProperty:BATCH_PLANNING_ROUTE_API_KEY_PROPERTY,apiKeyConfigured:!!key,cacheRequired:true,travelTimeLeading:true,distanceInformational:true};}
function RUN_BATCH_PLANNING_ROUTE_MATRIX_DIAGNOSTICS(){var cfg=BatchPlanningRouteMatrix_GetConfig();Logger.log(JSON.stringify(cfg,null,2));return cfg;}
