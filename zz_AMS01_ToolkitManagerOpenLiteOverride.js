/**
 * FILE: zz_AMS01_ToolkitManagerOpenLiteOverride.js
 * BUILD: AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R8_FRESH_TARGET_ROW
 * DEV-only routing optimization.
 *
 * Manager Toolkit open keeps canonical getToolkitOpenLiteV5 business logic,
 * uses the canonical Audit-ID row index but verifies/reads that concrete row
 * fresh before building context, reuses only the safe volatile ScriptCache tier,
 * reuses the canonical per-audit planning-window cache, and seeds the canonical
 * fast qualification cache consumed later by Save.
 *
 * Tier-2 sheet-persistent open cache is deliberately NOT used here because the
 * Save hot path performs lite invalidation and that tier can lag current
 * status/planning truth.
 *
 * Locked AUDITOR/self-planning remains on canonical Fast unchanged.
 */
var AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD='AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R8_FRESH_TARGET_ROW';

(function(){
  if(typeof getToolkitOpenFastV5!=='function' || typeof getToolkitOpenLiteV5!=='function') return;

  var canonicalFast_=getToolkitOpenFastV5;
  var canonicalLite_=getToolkitOpenLiteV5;

  function findAuditIdCol_(hdr){
    for(var i=0;i<(hdr||[]).length;i++){
      var h=String(hdr[i]||'').trim().toLowerCase();
      if(h==='audit id'||h==='audit_id'||h==='auditid') return i;
    }
    return -1;
  }

  function freshenPack_(pack,auditId){
    try{
      if(!pack||!pack.sh||!pack.hdr||!pack.rowNumber) return null;
      var physicalRow=Number(pack.rowNumber||0);
      var hdr=(pack.hdr||[]).slice();
      if(physicalRow<2||!hdr.length) return null;
      var row=pack.sh.getRange(physicalRow,1,1,hdr.length).getValues()[0]||[];
      var idCol=findAuditIdCol_(hdr);
      if(idCol<0||String(row[idCol]||'').trim()!==String(auditId||'').trim()) return null;
      return {sh:pack.sh,hdr:hdr,row:row,rowNumber:physicalRow,indexFromCache:!!pack.indexFromCache,execRowHit:!!pack.execRowHit};
    }catch(e){return null;}
  }

  function buildAuditPlanningSeed_(pack){
    if(!pack||!pack.sh||!pack.hdr||!pack.row||!pack.rowNumber) return null;
    var physicalRow=Number(pack.rowNumber||0);
    if(physicalRow<2) return null;
    var hdr=(pack.hdr||[]).slice();
    var row=(pack.row||[]).slice();
    var data=new Array(physicalRow);
    data[0]=hdr;
    for(var i=1;i<physicalRow-1;i++) data[i]=[];
    data[physicalRow-1]=row;
    return { sh:pack.sh, hdr:hdr, data:data, __ams01TargetRowOnly:true, __ams01RowNumber:physicalRow };
  }

  function seedQualificationCache_(res){
    try{
      if(!res||!Array.isArray(res.auditors)||typeof _mp_fastOpenQualifiedCachePut_!=='function') return false;
      var scopes=[];
      var rawScopes=res.audit&&Array.isArray(res.audit.scopes)?res.audit.scopes:[];
      for(var i=0;i<rawScopes.length;i++){
        var s=rawScopes[i]||{};
        var v=(s&&typeof s==='object')?String(s.name||s.code||s.slot||'').trim():String(s||'').trim();
        if(v) scopes.push(v);
      }
      var pre=String((res.audit&&res.audit.preassignedAuditor)||'').trim();
      var ok=_mp_fastOpenQualifiedCachePut_(scopes,pre,res.auditors);
      if(ok){res.__ams01QualificationCacheSeeded=true;res.__ams01QualificationCacheScopes=scopes;}
      return !!ok;
    }catch(e){ return false; }
  }

  function managerCacheGet_(auditId){
    try{
      if(typeof _mp_open_cacheGet_!=='function') return null;
      var hit=_mp_open_cacheGet_(auditId,{cacheKey:auditId,auditId:auditId,routeLabel:'MANAGER_LITE_AMS01',allowTier2:false});
      if(hit&&hit.success===true){
        hit.__ams01LiteContext=true;
        hit.__ams01ManagerPrimaryRoute='LITE_VIA_FAST_COMPAT_SCRIPT_CACHE';
        hit.__ams01ManagerPrimaryRouteBuild=AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD;
        seedQualificationCache_(hit);
        return hit;
      }
    }catch(e){}
    return null;
  }

  function managerCachePut_(auditId,res){
    try{
      if(!res||res.success!==true) return false;
      seedQualificationCache_(res);
      if(typeof _mp_open_cachePut_!=='function') return false;
      return !!_mp_open_cachePut_(auditId,res,{cacheKey:auditId,auditId:auditId,routeLabel:'MANAGER_LITE_AMS01',allowTier2:false});
    }catch(e){ return false; }
  }

  function callLiteWithTargetRowSeed_(auditId){
    var id=String(auditId||'').trim();
    var cached=managerCacheGet_(id);
    if(cached){cached.__ams01TargetRowSeed={used:false,source:'OPEN_SCRIPT_CACHE',seedMs:0};return cached;}

    var seed=null,pack=null,seedSource='NONE',seedMs=0,precomputedWindow=null,windowCacheMs=0;
    try{
      if(id && typeof __mp_getAuditPlanningRow_==='function'){
        var s0=Date.now();
        var indexedPack=__mp_getAuditPlanningRow_(SpreadsheetApp.getActive(),id);
        pack=freshenPack_(indexedPack,id);
        seedMs=Date.now()-s0;
        seed=buildAuditPlanningSeed_(pack);
        if(pack) seedSource=indexedPack&&indexedPack.execRowHit?'EXEC_INDEX_FRESH_ROW':(indexedPack&&indexedPack.indexFromCache?'ROW_INDEX_CACHE_FRESH_ROW':'TARGETED_INDEX_FRESH_ROW');
      }
    }catch(eSeed){
      seed=null;pack=null;
      try{Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_SEED_FAIL] '+String(eSeed&&eSeed.message?eSeed.message:eSeed));}catch(_e0){}
    }

    try{
      if(pack&&pack.hdr&&pack.row&&typeof _mp_resolvePlanningWindowCached_==='function'){
        var w0=Date.now();
        precomputedWindow=_mp_resolvePlanningWindowCached_(SpreadsheetApp.getActive(),pack.hdr,pack.row,id);
        windowCacheMs=Date.now()-w0;
      }
    }catch(eWin){precomputedWindow=null;}

    var res=null;
    var canonicalReset_=(typeof __mp_resetExecCache_==='function')?__mp_resetExecCache_:null;
    var canonicalWindow_=(typeof _mp_resolvePlanningWindow_==='function')?_mp_resolvePlanningWindow_:null;
    try{
      if(seed&&canonicalReset_){
        __mp_resetExecCache_=function(){
          canonicalReset_();
          try{if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE)__MP_EXEC_CACHE['SHEET:Audit planning']=seed;}catch(_e1){}
        };
      }
      if(precomputedWindow&&canonicalWindow_) _mp_resolvePlanningWindow_=function(){return precomputedWindow;};
      res=canonicalLite_(id);
      if(res&&typeof res==='object'){
        res.__ams01TargetRowSeed={used:!!seed,source:seedSource,seedMs:seedMs,rowNumber:seed?Number(seed.__ams01RowNumber||0):0,freshRowRead:!!seed};
        res.__ams01PlanningWindowCache={used:!!precomputedWindow,ms:windowCacheMs,cacheHit:!!(precomputedWindow&&precomputedWindow.__cacheHit)};
      }
      managerCachePut_(id,res);
      return res;
    }finally{
      if(canonicalReset_) __mp_resetExecCache_=canonicalReset_;
      if(canonicalWindow_) _mp_resolvePlanningWindow_=canonicalWindow_;
    }
  }

  getToolkitOpenFastV5=function(auditId,monthKey,opts){
    opts=opts||{};
    var role=String(opts.role||'').trim().toUpperCase();
    var locked=String(opts.lockedAuditorEmail||'').trim();
    var isLockedAuditor=(role==='AUDITOR'&&!!locked);
    if(!isLockedAuditor){
      var t0=Date.now();
      var res=callLiteWithTargetRowSeed_(auditId)||{};
      res.__ams01LiteContext=true;
      if(!res.__ams01ManagerPrimaryRoute) res.__ams01ManagerPrimaryRoute='LITE_VIA_FAST_COMPAT_TARGET_ROW';
      res.__ams01ManagerPrimaryRouteBuild=AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD;
      if(typeof res.__serverMs==='undefined'||res.__cacheHit) res.__serverMs=Date.now()-t0;
      if(!res.auditorsBundle&&Array.isArray(res.auditors)){
        res.auditorsBundle={success:true,auditors:res.auditors,auditorEligibilityMeta:res.auditorEligibilityMeta||{qualifiedFast:true,rotationPending:true},reusedFromLiteOpen:true,__serverMs:0,__ams01Build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD};
        res.auditorsBundle.auditorEligibilityMeta=res.auditorsBundle.auditorEligibilityMeta||{};
        res.auditorsBundle.auditorEligibilityMeta.rotationPending=true;
        res.auditorsBundle.auditorEligibilityMeta.reusedFromLiteOpen=true;
      }
      try{Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_LITE] '+JSON.stringify({build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,auditId:String(auditId||'').trim(),role:role||'MANAGER',ms:Date.now()-t0,success:!!(res&&res.success!==false),cacheHit:!!res.__cacheHit,cacheTier:res.__cacheTier||'',qualificationCacheSeeded:!!res.__ams01QualificationCacheSeeded,planningWindowCache:res.__ams01PlanningWindowCache||null,auditors:Array.isArray(res.auditors)?res.auditors.length:0,targetRowSeed:res.__ams01TargetRowSeed||null,auditorsBundleReused:!!(res.auditorsBundle&&res.auditorsBundle.reusedFromLiteOpen)}));}catch(eLog){}
      return res;
    }
    return canonicalFast_.apply(this,arguments);
  };
})();

function AMS01_ToolkitManagerOpenLiteStatus(){return {success:true,active:true,build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,openCacheTier:'SCRIPT_ONLY',freshTargetRow:true,planningWindowCache:true,saveQualificationCacheSeed:true};}
