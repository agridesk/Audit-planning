// BUILD: 2026-09-23_AMS03_PLANNING_PROFILES_EXEC_CACHE_ACCEPTANCE_R1
function RUN_AMS03_PLANNING_PROFILES_EXEC_CACHE_ACCEPTANCE(){
 var s=String(PPS_readWindow_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('executionCacheDeclared',typeof PPS_EXEC_CACHE==='object');
 q('cacheKeyUsesSheetAndWindow',s.indexOf("sh.getSheetId()")>=0&&s.indexOf("windowRows")>=0);
 q('cacheHitBeforePhysicalRead',s.indexOf("cached=PPS_EXEC_CACHE[cacheKey]")>=0&&s.indexOf("mode:'EXEC_CACHE'")>=0);
 q('fixedWindowPreserved',s.indexOf("getRange(1,1,windowRows,PPS_WINDOW_COLS).getValues()")>=0);
 q('boundaryFallbackPreserved',s.indexOf("getDataRange().getValues()")>=0);
 q('cacheStoresReadOnlyValues',s.indexOf("PPS_EXEC_CACHE[cacheKey]={values:values")>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PLANNING_PROFILES_EXEC_CACHE_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{scope:'SINGLE_EXECUTION',writes:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}