/**
 * FILE: zz_AMS01_ToolkitManagerOpenLiteOverride.js
 * BUILD: AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R4_CACHE_RESTORED
 * DEV-only routing optimization.
 *
 * Manager Toolkit open keeps canonical getToolkitOpenLiteV5 business logic,
 * seeds only the target Audit planning row, and now also reuses the canonical
 * route-aware open cache that the previous override accidentally bypassed.
 *
 * Locked AUDITOR/self-planning remains on canonical Fast unchanged.
 */
var AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD='AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R4_CACHE_RESTORED';

(function(){
  if(typeof getToolkitOpenFastV5!=='function' || typeof getToolkitOpenLiteV5!=='function') return;

  var canonicalFast_=getToolkitOpenFastV5;
  var canonicalLite_=getToolkitOpenLiteV5;

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

  function managerCacheGet_(auditId){
    try{
      if(typeof _mp_open_cacheGet_!=='function') return null;
      var hit=_mp_open_cacheGet_(auditId,{cacheKey:auditId,auditId:auditId,routeLabel:'MANAGER_LITE_AMS01',allowTier2:true});
      if(hit&&hit.success===true){
        hit.__ams01LiteContext=true;
        hit.__ams01ManagerPrimaryRoute='LITE_VIA_FAST_COMPAT_OPEN_CACHE';
        hit.__ams01ManagerPrimaryRouteBuild=AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD;
        return hit;
      }
    }catch(e){}
    return null;
  }

  function managerCachePut_(auditId,res){
    try{
      if(typeof _mp_open_cachePut_!=='function'||!res||res.success!==true) return false;
      return !!_mp_open_cachePut_(auditId,res,{cacheKey:auditId,auditId:auditId,routeLabel:'MANAGER_LITE_AMS01',allowTier2:true});
    }catch(e){ return false; }
  }

  function callLiteWithTargetRowSeed_(auditId){
    var id=String(auditId||'').trim();
    var cached=managerCacheGet_(id);
    if(cached){
      cached.__ams01TargetRowSeed={used:false,source:'OPEN_CACHE',seedMs:0};
      return cached;
    }

    var seed=null;
    var seedSource='NONE';
    var seedMs=0;
    try{
      if(id && typeof __mp_getAuditPlanningRow_==='function'){
        var s0=Date.now();
        var pack=__mp_getAuditPlanningRow_(SpreadsheetApp.getActive(),id);
        seedMs=Date.now()-s0;
        seed=buildAuditPlanningSeed_(pack);
        if(pack) seedSource=pack.execRowHit?'EXEC_ROW':(pack.indexFromCache?'ROW_OR_INDEX_CACHE':'COLD');
      }
    }catch(eSeed){
      seed=null;
      try{Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_SEED_FAIL] '+String(eSeed&&eSeed.message?eSeed.message:eSeed));}catch(_e0){}
    }

    var res=null;
    if(!seed || typeof __mp_resetExecCache_!=='function'){
      res=canonicalLite_(id);
      if(res&&typeof res==='object') res.__ams01TargetRowSeed={used:false,source:seedSource,seedMs:seedMs};
      managerCachePut_(id,res);
      return res;
    }

    var canonicalReset_=__mp_resetExecCache_;
    try{
      __mp_resetExecCache_=function(){
        canonicalReset_();
        try{ if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE) __MP_EXEC_CACHE['SHEET:Audit planning']=seed; }catch(_e1){}
      };
      res=canonicalLite_(id);
      if(res&&typeof res==='object') res.__ams01TargetRowSeed={used:true,source:seedSource,seedMs:seedMs,rowNumber:Number(seed.__ams01RowNumber||0)};
      managerCachePut_(id,res);
      return res;
    }finally{
      __mp_resetExecCache_=canonicalReset_;
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

      try{Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_LITE] '+JSON.stringify({build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,auditId:String(auditId||'').trim(),role:role||'MANAGER',ms:Date.now()-t0,success:!!(res&&res.success!==false),cacheHit:!!res.__cacheHit,cacheTier:res.__cacheTier||'',auditors:Array.isArray(res.auditors)?res.auditors.length:0,targetRowSeed:res.__ams01TargetRowSeed||null,auditorsBundleReused:!!(res.auditorsBundle&&res.auditorsBundle.reusedFromLiteOpen)}));}catch(eLog){}
      return res;
    }

    return canonicalFast_.apply(this,arguments);
  };
})();

function AMS01_ToolkitManagerOpenLiteStatus(){ return {success:true,active:true,build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,openCacheRestored:true}; }
