/**
 * FILE: AMS01_LifecycleInvalidationDiagnostic.js
 * BUILD: AMS01_LIFECYCLE_INVALIDATION_DIAG_20260908_R1
 * DEV-only, read/write-cache diagnostic. No status/planning truth writes.
 */
var AMS01_LIFECYCLE_INVALIDATION_DIAG_BUILD='AMS01_LIFECYCLE_INVALIDATION_DIAG_20260908_R1';

function AMS01_RunLifecycleInvalidationDiagnostic(){
  var auditId='AUD_ProducciónOrnamental_HQ_1777531729474_68';
  var probes=[];
  function p(label,fn){var t0=Date.now(),r={label:label,wallMs:0,ok:true,error:''};try{fn();}catch(e){r.ok=false;r.error=String(e&&e.message?e.message:e);}r.wallMs=Date.now()-t0;probes.push(r);}

  p('__mp_invalidateAuditPlanningPack_',function(){if(typeof __mp_invalidateAuditPlanningPack_==='function')__mp_invalidateAuditPlanningPack_();});
  p('__mp_invalidatePersistCaches_:Audit planning',function(){if(typeof __mp_invalidatePersistCaches_==='function')__mp_invalidatePersistCaches_(['Audit planning']);});
  p('_mp_open_cacheInvalidate_',function(){if(typeof _mp_open_cacheInvalidate_==='function')_mp_open_cacheInvalidate_(auditId);});
  p('_mp_aud_cacheInvalidate_',function(){if(typeof _mp_aud_cacheInvalidate_==='function')_mp_aud_cacheInvalidate_(auditId);});
  p('V5_clearManagerOpenCache_',function(){if(typeof V5_clearManagerOpenCache_==='function')V5_clearManagerOpenCache_(auditId);});
  p('AUDIT_CACHE.removeNamespace(manager)',function(){if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.removeNamespace==='function')AUDIT_CACHE.removeNamespace('manager');});
  p('AUDIT_CACHE.removeNamespace(auditor_grid)',function(){if(typeof AUDIT_CACHE!=='undefined'&&AUDIT_CACHE&&typeof AUDIT_CACHE.removeNamespace==='function')AUDIT_CACHE.removeNamespace('auditor_grid');});

  var out={build:AMS01_LIFECYCLE_INVALIDATION_DIAG_BUILD,auditId:auditId,probes:probes,totalMs:probes.reduce(function(s,x){return s+Number(x.wallMs||0);},0)};
  Logger.log('[AMS01_LIFECYCLE_INVALIDATION_DIAG] '+JSON.stringify(out));
  return out;
}
