/**
 * FILE: zz_AMS01_LifecycleInvalidationPerfOverride.js
 * BUILD: AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R3
 * DEV-only late-load override.
 *
 * R3:
 * - Removes duplicate V5_clearManagerOpenCache_ from lifecycle invalidation.
 * - When lifecycle is called by CoreStatusMachine, skips the two Audit planning
 *   invalidations that CoreStatusMachine immediately performs itself through
 *   Status_invalidateAuditPlanningPack_().
 * - CoreStatusMachine uses _mp_open_cacheInvalidate_(auditId,{lite:true}):
 *   ScriptCache base + route keys are still invalidated immediately, while the
 *   historical tier-2 sheet invalidation is skipped. Current d16 manager open
 *   uses getToolkitOpenLiteV5 and locked-auditor open explicitly disables tier 2.
 * - Non-CoreStatus lifecycle callers retain full open-cache invalidation.
 */
var AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD='AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R3';

function Lifecycle_invalidateAfterLifecycleChange_(ctx) {
  ctx = ctx || {};
  var auditId = lifecycle_clean_(ctx.auditId);
  var source = lifecycle_clean_(ctx.source || '');
  var coreOwnsAuditPlanningInvalidation = /^CoreStatusMachine(?:\.|$)/.test(source);
  var out = {
    success:true,
    auditId:auditId,
    source:source,
    coreOwnsAuditPlanningInvalidation:coreOwnsAuditPlanningInvalidation,
    events:[],
    skipped:[],
    errors:[],
    build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD
  };

  function run_(name, fn) {
    var t0=Date.now();
    try {
      fn();
      out.events.push(name);
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:true,source:source})); } catch(eLog) {}
    } catch (e) {
      out.errors.push(name + ': ' + lifecycle_err_(e));
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:false,error:lifecycle_err_(e),source:source})); } catch(eLog2) {}
    }
  }

  if (coreOwnsAuditPlanningInvalidation) {
    out.skipped.push('__mp_invalidateAuditPlanningPack_:owned by CoreStatusMachine.Status_invalidateAuditPlanningPack_');
    out.skipped.push('__mp_invalidatePersistCaches_:Audit planning:owned by CoreStatusMachine.Status_invalidateAuditPlanningPack_');
  } else {
    run_('__mp_invalidateAuditPlanningPack_', function(){
      if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_();
    });

    run_('__mp_invalidatePersistCaches_:Audit planning', function(){
      if (typeof __mp_invalidatePersistCaches_ === 'function') __mp_invalidatePersistCaches_(['Audit planning']);
    });
  }

  if (auditId) {
    if (coreOwnsAuditPlanningInvalidation) {
      run_('_mp_open_cacheInvalidate_:lite', function(){
        if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId, {lite:true});
      });
      out.skipped.push('MP_OPEN_SHEET_INVALIDATE:inactive on current CoreStatus d16 hot path');
    } else {
      run_('_mp_open_cacheInvalidate_', function(){
        if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId);
      });
    }

    run_('_mp_aud_cacheInvalidate_', function(){
      if (typeof _mp_aud_cacheInvalidate_ === 'function') _mp_aud_cacheInvalidate_(auditId);
    });
  }

  // Intentionally omitted: V5_clearManagerOpenCache_() repeats
  // __mp_invalidateAuditPlanningPack_ + _mp_open_cacheInvalidate_.
  out.skipped.push('V5_clearManagerOpenCache_:duplicate');

  run_('AUDIT_CACHE.removeNamespace(manager)', function(){
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace('manager');
    }
  });

  run_('AUDIT_CACHE.removeNamespace(auditor_grid)', function(){
    if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeNamespace === 'function') {
      AUDIT_CACHE.removeNamespace('auditor_grid');
    }
  });

  out.success = out.errors.length === 0;
  return out;
}

function AMS01_LifecycleInvalidationPerfStatus(){
  return {
    success:true,
    active:(typeof Lifecycle_invalidateAfterLifecycleChange_==='function'),
    build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,
    duplicateV5ClearRemoved:true,
    coreDuplicateAuditPlanningInvalidationRemoved:true,
    coreOpenCacheInvalidation:'LITE_SCRIPT_AND_ROUTE_KEYS_ONLY'
  };
}
