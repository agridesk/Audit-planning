// BUILD: 2026-09-23_AMS03_PLANNING_DEMAND_EXEC_CACHE_ACCEPTANCE_R1
function RUN_AMS03_PLANNING_DEMAND_EXEC_CACHE_ACCEPTANCE(){
 var s=String(PDS_readAuditPlanning_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('executionCacheDeclared',typeof PDS_EXEC_AUDIT_CACHE==='object');
 q('cacheKeyUsesSheetWindow',s.indexOf('sh.getSheetId()')>=0&&s.indexOf('PDS_AUDIT_WINDOW_ROWS')>=0);
 q('cacheHitBeforePhysicalRead',s.indexOf('cached=PDS_EXEC_AUDIT_CACHE[cacheKey]')>=0&&s.indexOf("mode:'EXEC_CACHE'")>=0);
 q('fixedWindowPreserved',s.indexOf('getRange(1,1,PDS_AUDIT_WINDOW_ROWS,PDS_AUDIT_WINDOW_COLS).getValues()')>=0);
 q('safeFallbackPreserved',s.indexOf('getDataRange().getValues()')>=0);
 q('cacheStoresTrimmedRead',s.indexOf('PDS_EXEC_AUDIT_CACHE[cacheKey]={values:trimmed')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_PLANNING_DEMAND_EXEC_CACHE_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{scope:'SINGLE_EXECUTION',writes:false,newSsot:false}};Logger.log(JSON.stringify(o,null,2));return o;
}