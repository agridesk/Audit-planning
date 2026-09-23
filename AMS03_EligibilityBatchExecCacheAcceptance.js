/***********************************************************************
 * AMS03_EligibilityBatchExecCacheAcceptance.js
 * BUILD: 2026-09-23_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE_R1
 * Static acceptance: execution-local reuse only; no persistent SSoT/cache.
 ***********************************************************************/
function RUN_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE(){
 var r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('execCacheDeclared',typeof EBRM_EXEC_WINDOW_CACHE==='object');
 q('readWindowHelper',typeof EBRM_readWindow_==='function');
 q('buildR5',String(ELIGIBILITY_BATCH_READ_BUILD).indexOf('R5_EXEC_CACHE')>=0);
 var src=String(EligibilityBatchReadModel_get);
 q('usesReadWindowHelper',src.indexOf('EBRM_readWindow_')>=0);
 q('telemetryUsesReadPack',src.indexOf('readStrategy:readPack.readStrategy')>=0);
 q('canonicalOwnerPreserved',src.indexOf("canonicalOwner: 'EligibilityService'")>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_ELIGIBILITY_BATCH_EXEC_CACHE_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{writes:false,newSsot:false,persistentCache:false}};Logger.log(JSON.stringify(o,null,2));return o;
}
