/**
 * FILE: AMS01_CoreStatusInvalidationDiagnostic.js
 * BUILD: AMS01_CORE_STATUS_INVALIDATION_DIAG_20260908_R1
 * Read-only cache invalidation timing diagnostic for the exact CoreStatusMachine sequence.
 */
var AMS01_CORE_STATUS_INVALIDATION_DIAG_BUILD='AMS01_CORE_STATUS_INVALIDATION_DIAG_20260908_R1';

function AMS01_RunCoreStatusInvalidationDiagnostic(){
  var auditId='AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var out={build:AMS01_CORE_STATUS_INVALIDATION_DIAG_BUILD,auditId:auditId,probes:[],totalMs:0};
  var total0=Date.now();

  function probe_(label,fn){
    var t0=Date.now(),p={label:label,wallMs:0,ok:true,error:'',result:null};
    try{p.result=fn();}catch(e){p.ok=false;p.error=String(e&&e.message?e.message:e);}
    p.wallMs=Date.now()-t0;out.probes.push(p);return p;
  }

  probe_('Lifecycle invalidation as CoreStatusMachine',function(){
    return Lifecycle_invalidateAfterLifecycleChange_({
      auditId:auditId,
      source:'CoreStatusMachine.Status_applySimpleStatusWrite_'
    });
  });

  probe_('Core canonical Status_invalidateAuditPlanningPack_',function(){
    if(typeof Status_invalidateAuditPlanningPack_==='function') return Status_invalidateAuditPlanningPack_();
    return {skipped:true,reason:'Status_invalidateAuditPlanningPack_ unavailable'};
  });

  out.totalMs=Date.now()-total0;
  try{Logger.log('[AMS01_CORE_STATUS_INVALIDATION_DIAG] '+JSON.stringify(out));}catch(eLog){}
  return out;
}
