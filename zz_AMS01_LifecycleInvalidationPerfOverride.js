/**
 * FILE: zz_AMS01_LifecycleInvalidationPerfOverride.js
 * BUILD: AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R4
 * DEV-only late-load override.
 *
 * R4:
 * - Keeps CoreStatusMachine as owner of Audit planning invalidation.
 * - Keeps audit-scoped manager-open and auditor-open invalidation.
 * - PLAN no longer wipes the complete manager and auditor_grid namespaces.
 *   The changed audit is already invalidated by auditId; auditor grid is
 *   invalidated only for the assigned auditor when that targeted API exists.
 * - Non-PLAN lifecycle actions retain the conservative namespace fallback.
 */
var AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD='AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_20260908_R4';

function Lifecycle_invalidateAfterLifecycleChange_(ctx) {
  ctx = ctx || {};
  var auditId = lifecycle_clean_(ctx.auditId);
  var source = lifecycle_clean_(ctx.source || '');
  var action = lifecycle_normAction_(ctx.action || (ctx.payload && ctx.payload.action) || '');
  var coreOwnsAuditPlanningInvalidation = /^CoreStatusMachine(?:\.|$)/.test(source);
  var isPlan = action === 'PLAN';
  var auditorEmail = lifecycle_clean_((ctx.payload && (ctx.payload.auditorEmail || ctx.payload.assignedTo || ctx.payload.email)) || '');
  var out = {
    success:true,
    auditId:auditId,
    source:source,
    action:action,
    auditorEmail:auditorEmail,
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
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:true,source:source,action:action})); } catch(eLog) {}
    } catch (e) {
      out.errors.push(name + ': ' + lifecycle_err_(e));
      try { Logger.log('[AMS01_LIFECYCLE_INVALIDATE] '+JSON.stringify({build:AMS01_LIFECYCLE_INVALIDATION_PERF_ZZ_BUILD,name:name,wallMs:Date.now()-t0,ok:false,error:lifecycle_err_(e),source:source,action:action})); } catch(eLog2) {}
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
      out.skipped.push('MP_OPEN_SHEET_INVALIDATE:inactive on current CoreStatus hot path');
    } else {
      run_('_mp_open_cacheInvalidate_', function(){
        if (typeof _mp_open_cacheInvalidate_ === 'function') _mp_open_cacheInvalidate_(auditId);
      });
    }

    run_('_mp_aud_cacheInvalidate_', function(){
      if (typeof _mp_aud_cacheInvalidate_ === 'function') _mp_aud_cacheInvalidate_(auditId);
    });
  }

  out.skipped.push('V5_clearManagerOpenCache_:duplicate');

  if (isPlan) {
    // The audit-scoped manager-open invalidation above is sufficient for PLAN.
    // A complete manager namespace wipe rewrites the central cache registry in
    // PropertiesService and invalidates unrelated audits.
    out.skipped.push('AUDIT_CACHE.removeNamespace(manager):PLAN uses audit-scoped open invalidation');

    if (auditorEmail && typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.removeAuditorGrid === 'function') {
      run_('AUDIT_CACHE.removeAuditorGrid(targeted)', function(){
        AUDIT_CACHE.removeAuditorGrid(auditorEmail);
      });
    } else {
      out.skipped.push('AUDIT_CACHE.removeNamespace(auditor_grid):no targeted auditor cache key available');
    }
  } else {
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
  }

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
    planManagerInvalidation:'AUDIT_SCOPED',
    planAuditorGridInvalidation:'TARGETED_AUDITOR'
  };
}
