/**
 * FILE: AMS01_CoreStatusInvalidationDiagnostic.js
 * BUILD: AMS01_CORE_STATUS_INVALIDATION_DIAG_20260908_R2
 * Read-only cache invalidation timing diagnostic for the exact CoreStatusMachine sequence.
 */
var AMS01_CORE_STATUS_INVALIDATION_DIAG_BUILD='AMS01_CORE_STATUS_INVALIDATION_DIAG_20260908_R2';

function AMS01_RunCoreStatusInvalidationDiagnostic(){
  var auditId='AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var out={build:AMS01_CORE_STATUS_INVALIDATION_DIAG_BUILD,auditId:auditId,probes:[],totalMs:0,nested:{}};
  var total0=Date.now();

  function probe_(label,fn){
    var t0=Date.now(),p={label:label,wallMs:0,ok:true,error:'',result:null};
    try{p.result=fn();}catch(e){p.ok=false;p.error=String(e&&e.message?e.message:e);}
    p.wallMs=Date.now()-t0;out.probes.push(p);return p;
  }

  var origSheetInvalidate=(typeof MP_OPEN_SHEET_INVALIDATE==='function')?MP_OPEN_SHEET_INVALIDATE:null;
  if(origSheetInvalidate){
    MP_OPEN_SHEET_INVALIDATE=function(id){
      var t0=Date.now();
      try{return origSheetInvalidate(id);}finally{out.nested.MP_OPEN_SHEET_INVALIDATE=(out.nested.MP_OPEN_SHEET_INVALIDATE||0)+(Date.now()-t0);}
    };
  }
  probe_('_mp_open_cacheInvalidate_ total',function(){
    if(typeof _mp_open_cacheInvalidate_==='function') return _mp_open_cacheInvalidate_(auditId);
    return {skipped:true};
  });
  if(origSheetInvalidate) MP_OPEN_SHEET_INVALIDATE=origSheetInvalidate;

  var origPack=(typeof __mp_invalidateAuditPlanningPack_==='function')?__mp_invalidateAuditPlanningPack_:null;
  var origPersist=(typeof __mp_invalidatePersistCaches_==='function')?__mp_invalidatePersistCaches_:null;
  if(origPack){
    __mp_invalidateAuditPlanningPack_=function(){
      var t0=Date.now();
      try{return origPack.apply(this,arguments);}finally{out.nested.__mp_invalidateAuditPlanningPack_=(out.nested.__mp_invalidateAuditPlanningPack_||0)+(Date.now()-t0);}
    };
  }
  if(origPersist){
    __mp_invalidatePersistCaches_=function(){
      var t0=Date.now();
      try{return origPersist.apply(this,arguments);}finally{out.nested.__mp_invalidatePersistCaches_=(out.nested.__mp_invalidatePersistCaches_||0)+(Date.now()-t0);}
    };
  }
  probe_('Status_invalidateAuditPlanningPack_ total',function(){
    if(typeof Status_invalidateAuditPlanningPack_==='function') return Status_invalidateAuditPlanningPack_();
    return {skipped:true};
  });
  if(origPack) __mp_invalidateAuditPlanningPack_=origPack;
  if(origPersist) __mp_invalidatePersistCaches_=origPersist;

  probe_('Lifecycle invalidation as CoreStatusMachine',function(){
    return Lifecycle_invalidateAfterLifecycleChange_({
      auditId:auditId,
      source:'CoreStatusMachine.Status_applySimpleStatusWrite_'
    });
  });

  out.totalMs=Date.now()-total0;
  try{Logger.log('[AMS01_CORE_STATUS_INVALIDATION_DIAG] '+JSON.stringify(out));}catch(eLog){}
  return out;
}
