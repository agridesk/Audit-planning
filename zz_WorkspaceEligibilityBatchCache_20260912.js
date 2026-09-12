/***********************************************************************
 * zz_WorkspaceEligibilityBatchCache_20260912.js
 * BUILD: 2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_R1
 *
 * Workspace-only acceleration layer in front of EligibilityBatchReadModel.
 * Canonical eligibility ownership is unchanged. The cache stores only rows
 * already accepted by the canonical/scope-aware batch read model, has a
 * short TTL, and is invalidated by EligibilityService writes/invalidation.
 * Final planning still revalidates through PlanningCommitGateService.
 ***********************************************************************/
var WORKSPACE_ELIGIBILITY_BATCH_CACHE_BUILD='2026-09-12_WORKSPACE_ELIGIBILITY_BATCH_CACHE_R1';
var WEBRC_TTL_SEC=120;
var WEBRC_PREFIX='PW_EBRM_R1::';
var WEBRC_EPOCH_KEY='PW_EBRM_R1_EPOCH';

function WEBRC_clean_(v){return String(v==null?'':v).trim();}
function WEBRC_cache_(){try{return CacheService.getScriptCache();}catch(e){return null;}}
function WEBRC_build_(){return typeof EBRM_currentEligibilityBuild_==='function'?WEBRC_clean_(EBRM_currentEligibilityBuild_()):(typeof ELIG_BUILD!=='undefined'?WEBRC_clean_(ELIG_BUILD):'');}
function WEBRC_generation_(){return typeof EBRM_currentAuditorScopeGeneration_==='function'?WEBRC_clean_(EBRM_currentAuditorScopeGeneration_()):'GEN_LEGACY';}
function WEBRC_epoch_(cache){if(!cache)return'0';var e='';try{e=WEBRC_clean_(cache.get(WEBRC_EPOCH_KEY));}catch(x){}if(e)return e;e='E1';try{cache.put(WEBRC_EPOCH_KEY,e,21600);}catch(x2){}return e;}
function WEBRC_key_(auditId,build,generation,epoch){return WEBRC_PREFIX+WEBRC_clean_(auditId)+'::'+WEBRC_clean_(build)+'::'+WEBRC_clean_(generation)+'::'+WEBRC_clean_(epoch);}
function WEBRC_requestedIds_(input){var set=typeof EBRM_requestedSet_==='function'?EBRM_requestedSet_(input||{}):null;return set?Object.keys(set):[];}
function WEBRC_parse_(raw){if(!raw)return null;try{return JSON.parse(String(raw));}catch(e){return null;}}
function WEBRC_validRow_(rec,build,generation){if(!rec||!WEBRC_clean_(rec.auditId))return false;if(rec.requiresCanonicalRefresh===true||rec.stale===true)return false;if(WEBRC_clean_(rec.currentEligibilityBuild)!==WEBRC_clean_(build))return false;if(WEBRC_clean_(rec.auditorScopeGeneration)!==WEBRC_clean_(generation))return false;return true;}
function WEBRC_resultBuild_(){if(typeof ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD!=='undefined')return ELIGIBILITY_BATCH_SCOPE_AWARE_BUILD;if(typeof ELIGIBILITY_BATCH_READ_BUILD!=='undefined')return ELIGIBILITY_BATCH_READ_BUILD;return WORKSPACE_ELIGIBILITY_BATCH_CACHE_BUILD;}
function WEBRC_fastResult_(ids,rows,build,generation,elapsed){var byAuditId={},legacyEquivalent=0;for(var i=0;i<rows.length;i++){var r=rows[i];byAuditId[r.auditId]=r;if(WEBRC_clean_(r.computedBuild)!==WEBRC_clean_(build)&&r.cacheValidity&&r.cacheValidity.buildEquivalent===true)legacyEquivalent++;}return{success:true,build:WEBRC_resultBuild_(),rows:rows,byAuditId:byAuditId,missingAuditIds:[],meta:{sourceRows:0,returned:rows.length,requested:ids.length,missing:0,stale:0,parseErrors:0,buildMismatch:0,generationMismatch:0,refreshRequired:0,legacyEquivalent:legacyEquivalent,currentEligibilityBuild:build,auditorScopeGeneration:generation,columnsRead:0,writes:false,canonicalOwner:'EligibilityService',cacheRole:'derived acceleration only',cacheValidityContract:'EligibilityService accepted rows only',scopeAwareBuildCompatibility:true,workspaceScriptCacheFastPath:true,workspaceScriptCacheTtlSec:WEBRC_TTL_SEC,sheetRead:false,cacheReadMs:elapsed}};}
function WEBRC_removeIds_(ids){var cache=WEBRC_cache_();if(!cache||!ids||!ids.length)return;var build=WEBRC_build_(),generation=WEBRC_generation_(),epoch=WEBRC_epoch_(cache),keys=[],seen={};for(var i=0;i<ids.length;i++){var id=WEBRC_clean_(ids[i]);if(id&&!seen[id]){seen[id]=1;keys.push(WEBRC_key_(id,build,generation,epoch));}}if(keys.length)try{cache.removeAll(keys);}catch(e){}}
function WEBRC_bumpEpoch_(){var cache=WEBRC_cache_();if(!cache)return;try{cache.put(WEBRC_EPOCH_KEY,'E'+Date.now(),21600);}catch(e){}}

if(typeof EligibilityBatchReadModel_get==='function'){
  var WEBRC_originalBatchRead_=EligibilityBatchReadModel_get;
  EligibilityBatchReadModel_get=function(input){
    input=input||{};
    var ids=WEBRC_requestedIds_(input);
    if(!ids.length)return WEBRC_originalBatchRead_(input);
    var cache=WEBRC_cache_();
    if(!cache)return WEBRC_originalBatchRead_(input);
    var build=WEBRC_build_(),generation=WEBRC_generation_(),epoch=WEBRC_epoch_(cache),keys=[],keyToId={};
    for(var i=0;i<ids.length;i++){var k=WEBRC_key_(ids[i],build,generation,epoch);keys.push(k);keyToId[k]=ids[i];}
    var t0=Date.now(),raw={};try{raw=cache.getAll(keys)||{};}catch(e){raw={};}
    var cachedById={},allHit=true;
    for(var j=0;j<keys.length;j++){var key=keys[j],rec=WEBRC_parse_(raw[key]);if(!WEBRC_validRow_(rec,build,generation)){allHit=false;break;}cachedById[keyToId[key]]=rec;}
    if(allHit){var ordered=[];for(var q=0;q<ids.length;q++)ordered.push(cachedById[ids[q]]);var fast=WEBRC_fastResult_(ids,ordered,build,generation,Date.now()-t0);if(typeof DPL_start_==='function'&&typeof DPL_end_==='function'){var perf=DPL_start_('EligibilityBatchReadModel_get',{requestedAuditIds:ids.length,workspaceCache:true});if(typeof DPL_mark_==='function')DPL_mark_(perf,'workspaceScriptCacheBulkRead',{returned:ordered.length});fast.devPerformance=DPL_end_(perf,{returned:ordered.length,missing:0,stale:0,parseErrors:0,buildMismatch:0,generationMismatch:0,refreshRequired:0,legacyEquivalent:fast.meta.legacyEquivalent,workspaceScriptCacheFastPath:true});}return fast;}
    var result=WEBRC_originalBatchRead_(input);
    if(result&&result.success===true&&Array.isArray(result.rows)){
      var puts={};for(var r=0;r<result.rows.length;r++){var row=result.rows[r];if(!WEBRC_validRow_(row,build,generation))continue;var s='';try{s=JSON.stringify(row);}catch(x){s='';}if(!s||s.length>=90000)continue;puts[WEBRC_key_(row.auditId,build,generation,epoch)]=s;}
      if(Object.keys(puts).length)try{cache.putAll(puts,WEBRC_TTL_SEC);}catch(ignore){}
      result.meta=result.meta||{};result.meta.workspaceScriptCacheFastPath=false;result.meta.workspaceScriptCacheSeeded=Object.keys(puts).length;result.meta.workspaceScriptCacheTtlSec=WEBRC_TTL_SEC;
    }
    return result;
  };
}

if(typeof eligService_cacheWrite_==='function'){
  var WEBRC_originalCacheWrite_=eligService_cacheWrite_;
  eligService_cacheWrite_=function(auditId,payload){var out=WEBRC_originalCacheWrite_(auditId,payload);WEBRC_removeIds_([auditId]);return out;};
}
if(typeof eligService_cacheInvalidate_==='function'){
  var WEBRC_originalInvalidate_=eligService_cacheInvalidate_;
  eligService_cacheInvalidate_=function(scope){scope=scope||{};var out=WEBRC_originalInvalidate_(scope);if(scope.all){WEBRC_bumpEpoch_();return out;}var ids=[];if(scope.auditId)ids.push(scope.auditId);var fromSheet=out&&out.sheet&&Array.isArray(out.sheet.auditIds)?out.sheet.auditIds:[];for(var i=0;i<fromSheet.length;i++)ids.push(fromSheet[i]);WEBRC_removeIds_(ids);return out;};
}
