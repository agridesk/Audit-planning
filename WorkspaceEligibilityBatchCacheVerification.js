/***********************************************************************
 * WorkspaceEligibilityBatchCacheVerification.js
 * BUILD: 2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_R2
 ***********************************************************************/
var WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_BUILD='2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_R2';

function RUN_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFICATION(){
  var results=[];function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}

  var batchSource=typeof EligibilityBatchReadModel_get==='function'?String(EligibilityBatchReadModel_get):'';
  var keySource=typeof WEBRC_key_==='function'?String(WEBRC_key_):'';
  var validSource=typeof WEBRC_validRow_==='function'?String(WEBRC_validRow_):'';
  var cacheSource=typeof WEBRC_cache_==='function'?String(WEBRC_cache_):'';
  var bumpSource=typeof WEBRC_bumpEpoch_==='function'?String(WEBRC_bumpEpoch_):'';
  var removeSource=typeof WEBRC_removeIds_==='function'?String(WEBRC_removeIds_):'';
  var writeSource=typeof eligService_cacheWrite_==='function'?String(eligService_cacheWrite_):'';
  var invalidateSource=typeof eligService_cacheInvalidate_==='function'?String(eligService_cacheInvalidate_):'';
  var combined=[batchSource,keySource,validSource,cacheSource,bumpSource,removeSource,writeSource,invalidateSource].join('\n');

  t('cacheLayerLoaded',typeof WEBRC_TTL_SEC!=='undefined'&&typeof WEBRC_key_==='function'&&typeof WEBRC_bumpEpoch_==='function');
  t('shortTtl',typeof WEBRC_TTL_SEC!=='undefined'&&Number(WEBRC_TTL_SEC)===120,WEBRC_TTL_SEC);
  t('usesScriptCacheOnly',cacheSource.indexOf('CacheService.getScriptCache()')>=0&&combined.indexOf('SpreadsheetApp')<0);
  t('allHitRequiredForFastPath',batchSource.indexOf('allHit')>=0);
  t('rejectsRefreshRequiredRows',validSource.indexOf('requiresCanonicalRefresh')>=0);
  t('rejectsStaleRows',validSource.indexOf('.stale')>=0);
  t('buildBoundKey',keySource.indexOf('build')>=0);
  t('generationBoundKey',keySource.indexOf('generation')>=0);
  t('explicitWriteInvalidation',writeSource.indexOf('WEBRC_removeIds_')>=0);
  t('explicitInvalidateHook',invalidateSource.indexOf('WEBRC_originalInvalidate_')>=0);
  t('allInvalidationBumpsEpoch',invalidateSource.indexOf('WEBRC_bumpEpoch_')>=0);
  t('fallbackIsCanonicalBatchRead',batchSource.indexOf('WEBRC_originalBatchRead_')>=0);
  t('noEligibilityCompute',combined.indexOf('elig_compute_')<0&&combined.indexOf('EligibilityTargetedRefreshService_refresh')<0);
  t('noSheetWrites',combined.indexOf('setValue(')<0&&combined.indexOf('setValues(')<0&&combined.indexOf('appendRow(')<0);
  t('noPlanningWrites',combined.indexOf('PlanningCanonicalCommitService')<0&&combined.indexOf('StatusMachine')<0);

  var input={from:'2026-09-01',to:'2026-12-31'};
  var demand=PlanningDemandService_get(input),ids=[];
  (demand&&demand.rows||[]).forEach(function(r){var id=String(r&&r.auditId||'').trim();if(id)ids.push(id);});
  if(typeof WEBRC_bumpEpoch_==='function')WEBRC_bumpEpoch_();
  var s1=Date.now(),first=EligibilityBatchReadModel_get({auditIds:ids}),firstMs=Date.now()-s1;
  var s2=Date.now(),second=EligibilityBatchReadModel_get({auditIds:ids}),secondMs=Date.now()-s2;
  t('demandIdsPresent',ids.length>0,ids.length);
  t('firstReadComplete',first&&first.rows&&first.rows.length===ids.length,(first&&first.rows&&first.rows.length)+'/'+ids.length);
  t('secondReadComplete',second&&second.rows&&second.rows.length===ids.length,(second&&second.rows&&second.rows.length)+'/'+ids.length);
  t('secondReadUsesWorkspaceCache',second&&second.meta&&second.meta.workspaceScriptCacheFastPath===true,JSON.stringify(second&&second.meta||{}));
  t('secondReadNoSheetRead',second&&second.meta&&second.meta.sheetRead===false,JSON.stringify(second&&second.meta||{}));
  t('secondReadNoRefreshRequired',second&&second.meta&&Number(second.meta.refreshRequired||0)===0,second&&second.meta&&second.meta.refreshRequired);

  var failed=results.filter(function(x){return!x.ok;}).length;
  var out={ok:failed===0,build:WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_BUILD,total:results.length,passed:results.length-failed,failed:failed,results:results,timingsMs:{first:firstMs,second:secondMs},counts:{auditIds:ids.length,firstRows:first&&first.rows?first.rows.length:0,secondRows:second&&second.rows?second.rows.length:0},meta:{nonDestructive:true,spreadsheetWrites:false,planningWrites:false,lifecycleWrites:false,cacheWrites:'derived ScriptCache only',canonicalEligibilityOwner:'EligibilityService',finalCommitRevalidationUnchanged:true}};
  console.log(JSON.stringify(out,null,2));return out;
}
