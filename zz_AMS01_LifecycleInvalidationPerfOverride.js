/**
 * FILE: zz_AMS01_LifecycleInvalidationPerfOverride.js
 * BUILD: AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R1
 * DEV-only late-load override. Removes duplicate V5_clearManagerOpenCache_ call
 * from lifecycle invalidation because lifecycle already performs the two
 * invalidations nested inside that function: AuditPlanningPack + open cache.
 */
var AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD='AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R1';

function Lifecycle_invalidateAfterLifecycleChange_(ctx) {
  ctx = ctx || {};
  var auditId = lifecycle_clean_(ctx.auditId);
  var out = { success:true, auditId:auditId, events:[], errors:[], build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD };

  function run_(name, fn) {
    var t0=Date.now();
    try {
      fn();
      out.events.push(name);
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:true})); } catch(eLog) {}
    } catch (e) {
      out.errors.push(name + ': ' + lifecycle_err_(e));
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:false,error:lifecycle_err_(e)})); } catch(eLog2) {}
    }
  }

  run_('__mp_invalidateAuditPlanningPack_', function(){
    if (typeof __mp_invalidateAuditPlanningPack_ === 'function') __mp_invalidateAuditPlanningPack_();
  });

  run_('__mp_invalidatePersistCaches_:Audit planning', function(){
    if (typeof __mp_invalidatePersistCaches_ === 'function') __mp_invalidatePersistCaches_(['Audit planning']);
  });

  if (auditId) {
    run_('_mp_open_cacheInvalidate_', function(){
      if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId);
    });

    run_('_mp_aud_cacheInvalidate_', function(){
      if (typeof _mp_aud_cacheInvalidate_ === 'function') _mp_aud_cacheInvalidate_(auditId);
    });
  }

  // Intentionally omitted here in DEV perf route:
  // V5_clearManagerOpenCache_() only repeats __mp_invalidateAuditPlanningPack_
  // and _mp_open_cacheInvalidate_, already executed above.

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
  return {success:true,active:(typeof Lifecycle_invalidateAfterLifecycleChange_==='function'),build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,duplicateV5ClearRemoved:true};
}
