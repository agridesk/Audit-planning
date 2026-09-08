/**
 * FILE: zz_AMS01_ToolkitManagerOpenLiteOverride.js
 * BUILD: AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R3
 * DEV-only routing optimization.
 *
 * Manager Toolkit open keeps the canonical getToolkitOpenLiteV5 business logic,
 * but prevents its legacy full Audit planning sheet read by seeding the existing
 * execution cache with header + target audit row only.
 *
 * Locked AUDITOR/self-planning remains on canonical Fast unchanged.
 * No calendar, qualification, status, planning or availability truth changes.
 */
var AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD='AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_20260908_R3';

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

    return {
      sh:pack.sh,
      hdr:hdr,
      data:data,
      __ams01TargetRowOnly:true,
      __ams01RowNumber:physicalRow
    };
  }

  function callLiteWithTargetRowSeed_(auditId){
    var id=String(auditId||'').trim();
    var seed=null;
    var seedSource='NONE';
    var seedMs=0;

    try{
      if(id && typeof __mp_getAuditPlanningRow_==='function'){
        var s0=Date.now();
        var pack=__mp_getAuditPlanningRow_(SpreadsheetApp.getActive(),id);
        seedMs=Date.now()-s0;
        seed=buildAuditPlanningSeed_(pack);
        if(pack){
          seedSource=pack.execRowHit?'EXEC_ROW':(pack.indexFromCache?'ROW_OR_INDEX_CACHE':'COLD');
        }
      }
    }catch(eSeed){
      seed=null;
      try{Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_SEED_FAIL] '+String(eSeed&&eSeed.message?eSeed.message:eSeed));}catch(_e0){}
    }

    if(!seed || typeof __mp_resetExecCache_!=='function'){
      var plain=canonicalLite_(id);
      if(plain&&typeof plain==='object'){
        plain.__ams01TargetRowSeed={used:false,source:seedSource,seedMs:seedMs};
      }
      return plain;
    }

    var canonicalReset_=__mp_resetExecCache_;
    try{
      __mp_resetExecCache_=function(){
        canonicalReset_();
        try{
          if(typeof __MP_EXEC_CACHE==='object'&&__MP_EXEC_CACHE){
            __MP_EXEC_CACHE['SHEET:Audit planning']=seed;
          }
        }catch(_e1){}
      };

      var res=canonicalLite_(id);
      if(res&&typeof res==='object'){
        res.__ams01TargetRowSeed={used:true,source:seedSource,seedMs:seedMs,rowNumber:Number(seed.__ams01RowNumber||0)};
      }
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
      var res=callLiteWithTargetRowSeed_(auditId);
      res=res||{};
      res.__ams01LiteContext=true;
      res.__ams01ManagerPrimaryRoute='LITE_VIA_FAST_COMPAT_TARGET_ROW';
      res.__ams01ManagerPrimaryRouteBuild=AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD;
      if(typeof res.__serverMs==='undefined') res.__serverMs=Date.now()-t0;

      if(!res.auditorsBundle&&Array.isArray(res.auditors)){
        res.auditorsBundle={
          success:true,
          auditors:res.auditors,
          auditorEligibilityMeta:res.auditorEligibilityMeta||{qualifiedFast:true,rotationPending:true},
          reusedFromLiteOpen:true,
          __serverMs:0,
          __ams01Build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD
        };
        res.auditorsBundle.auditorEligibilityMeta=res.auditorsBundle.auditorEligibilityMeta||{};
        res.auditorsBundle.auditorEligibilityMeta.rotationPending=true;
        res.auditorsBundle.auditorEligibilityMeta.reusedFromLiteOpen=true;
      }

      try{
        Logger.log('[AMS01_TOOLKIT_MANAGER_OPEN_LITE] '+JSON.stringify({
          build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD,
          auditId:String(auditId||'').trim(),
          role:role||'MANAGER',
          ms:Date.now()-t0,
          success:!!(res&&res.success!==false),
          auditors:Array.isArray(res.auditors)?res.auditors.length:0,
          targetRowSeed:res.__ams01TargetRowSeed||null,
          auditorsBundleReused:!!(res.auditorsBundle&&res.auditorsBundle.reusedFromLiteOpen)
        }));
      }catch(eLog){}
      return res;
    }

    return canonicalFast_.apply(this,arguments);
  };
})();

function AMS01_ToolkitManagerOpenLiteStatus(){
  return {success:true,active:true,build:AMS01_TOOLKIT_MANAGER_OPEN_LITE_ZZ_BUILD};
}
