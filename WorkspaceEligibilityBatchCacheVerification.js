/***********************************************************************
 * WorkspaceEligibilityBatchCacheVerification.js
 * BUILD: 2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_R1
 ***********************************************************************/
var WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_BUILD='2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFY_R1';

function RUN_WORKSPACE_ELIGIBILITY_BATCH_CACHE_VERIFICATION(){
  var results=[];function t(name,ok,detail){results.push({name:name,ok:!!ok,detail:ok?'':String(detail||'failed')});}
  var source=HtmlService.createHtmlOutputFromFile('zz_WorkspaceEligibilityBatchCache_20260912.js').getContent();
  t('shortTtl',source.indexOf('WEBRC_TTL_SEC=120')>=0);
  t('usesScriptCacheOnly',source.indexOf('CacheService.getScriptCache()')>=0&&source.indexOf('SpreadsheetApp')<0);
  t('allHitRequiredForFastPath',source.indexOf('if(allHit)')>=0);
  t('rejectsRefreshRequiredRows',source.indexOf('rec.requiresCanonicalRefresh===true')>=0);
  t('rejectsStaleRows',source.indexOf('rec.stale===true')>=0);
  t('buildBoundKey',source.indexOf("+'::'+WEBRC_clean_(build)")>=0);
  t('generationBoundKey',source.indexOf("+'::'+WEBRC_clean_(generation)")>=0);
  t('explicitWriteInvalidation',source.indexOf("eligService_cacheWrite_=function")>=0&&source.indexOf('WEBRC_removeIds_([auditId])')>=0);
  t('explicitInvalidateHook',source.indexOf("eligService_cacheInvalidate_=function")>=0);
  t('allInvalidationBumpsEpoch',source.indexOf('if(scope.all){WEBRC_bumpEpoch_()')>=0);
  t('fallbackIsCanonicalBatchRead',source.indexOf('WEBRC_originalBatchRead_(input)')>=0);
  t('noEligibilityCompute',source.indexOf('elig_compute_')<0&&source.indexOf('EligibilityTargetedRefreshService_refresh')<0);
  t('noSheetWrites',source.indexOf('setValue(')<0&&source.indexOf('setValues(')<0&&source.indexOf('appendRow(')<0);
  t('noPlanningWrites',source.indexOf('PlanningCanonicalCommitService')<0&&source.indexOf('StatusMachine')<0);

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
