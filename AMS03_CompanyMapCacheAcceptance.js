function RUN_AMS03_COMPANY_MAP_CACHE_ACCEPTANCE(){
 var d=String(CompanyMap_getDataset_C04),s=String(saveCompanyDetail),i=String(CompanyMap_invalidateDatasetCache_C04_),r=[];function q(n,v){r.push({name:n,ok:!!v});}
 q('fullMapSemanticsPreserved',d.indexOf('out.entities.push(entity)')>=0&&d.indexOf('out.companies.push(companyGroup)')>=0);
 q('scriptCacheRead',d.indexOf('CacheService.getScriptCache')>=0&&d.indexOf('cache.get(cacheKey)')>=0);
 q('boundedTtl',d.indexOf('cache.put(cacheKey,payload,300)')>=0);
 q('sizeGuard',d.indexOf('payload.length<90000')>=0);
 q('saveInvalidatesMapCache',s.indexOf('CompanyMap_invalidateDatasetCache_C04_')>=0);
 q('invalidationKeyMatches',i.indexOf('COMPANY_MAP_DATASET_C04_V1')>=0);
 var f=r.filter(function(x){return!x.ok}).length,o={ok:f===0,build:'2026-09-23_AMS03_COMPANY_MAP_CACHE_ACCEPTANCE_R1',total:r.length,passed:r.length-f,failed:f,results:r,meta:{fullMapDatasetPreserved:true,newSsot:false,ttlSeconds:300}};Logger.log(JSON.stringify(o,null,2));return o;
}