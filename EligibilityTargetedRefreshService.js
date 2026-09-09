/***********************************************************************
 * EligibilityTargetedRefreshService.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_TARGETED_REFRESH_R1
 *
 * PURPOSE
 *   Bounded targeted refresh of derived EligibilityService cache entries.
 *   Intended for Concept Planning / Workspace 2.0 when the batch read model
 *   reports missing or canonically invalid cache rows.
 *
 * GOVERNANCE
 *   - EligibilityService remains the sole eligibility compute/cache owner.
 *   - This service delegates compute to elig_compute_ and persistence to
 *     eligService_cacheWrite_. It owns no eligibility rules.
 *   - Eligibility_Cache remains derived acceleration only.
 *   - No lifecycle, Planning, Availability or Status writes.
 *
 * SPEED CONTRACT
 *   - One batch classification before refresh.
 *   - Refresh only requested rows that need it, unless force=true.
 *   - Hard bounded refresh count; never an unbounded warmer in a user path.
 *   - One batch verification after refresh.
 *   - No per-audit eligibility sheet lookup before compute.
 *   - DEV-only performance telemetry.
 ***********************************************************************/

var ELIGIBILITY_TARGETED_REFRESH_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_TARGETED_REFRESH_R1';

function ETRS_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function ETRS_ids_(input) {
  var raw = input && (input.auditIds || input.auditId);
  var arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var id = ETRS_clean_(arr[i]);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function ETRS_selectTargets_(auditIds, batch, force, maxRefresh) {
  var targets = [];
  var byAuditId = batch && batch.byAuditId ? batch.byAuditId : {};
  for (var i = 0; i < auditIds.length && targets.length < maxRefresh; i++) {
    var id = auditIds[i];
    var rec = byAuditId[id] || null;
    if (force || !rec || rec.requiresCanonicalRefresh === true) {
      targets.push({
        auditId: id,
        reason: force ? 'FORCE' : (!rec ? 'CACHE_MISSING' : (rec.refreshReasons || ['REFRESH_REQUIRED']).join('|'))
      });
    }
  }
  return targets;
}

function EligibilityTargetedRefreshService_refresh(input) {
  input = input || {};
  var auditIds = ETRS_ids_(input);
  var dryRun = input.dryRun === true;
  var force = input.force === true;
  var maxRefresh = Math.max(1, Math.min(20, Number(input.maxRefresh || 5) || 5));

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('EligibilityTargetedRefreshService_refresh', {
    requested: auditIds.length,
    dryRun: dryRun,
    force: force,
    maxRefresh: maxRefresh
  }) : null;

  if (typeof EligibilityBatchReadModel_get !== 'function') {
    throw new Error('EligibilityTargetedRefreshService: EligibilityBatchReadModel_get unavailable');
  }
  if (typeof elig_compute_ !== 'function') {
    throw new Error('EligibilityTargetedRefreshService: elig_compute_ unavailable');
  }
  if (typeof eligService_cacheWrite_ !== 'function') {
    throw new Error('EligibilityTargetedRefreshService: eligService_cacheWrite_ unavailable');
  }

  if (!auditIds.length) {
    var none = {
      success: true,
      build: ELIGIBILITY_TARGETED_REFRESH_BUILD,
      requested: 0,
      selected: 0,
      refreshed: 0,
      skipped: 0,
      failed: 0,
      dryRun: dryRun,
      items: [],
      meta: {
        bounded: true,
        maxRefresh: maxRefresh,
        canonicalOwner: 'EligibilityService',
        cacheRole: 'derived acceleration only',
        writesBusinessTruth: false
      }
    };
    if (typeof DPL_end_ === 'function') none.devPerformance = DPL_end_(perf, { requested:0, selected:0, refreshed:0 });
    return none;
  }

  var before = EligibilityBatchReadModel_get({ auditIds: auditIds });
  var targets = ETRS_selectTargets_(auditIds, before, force, maxRefresh);
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'classify', {
    requested: auditIds.length,
    selected: targets.length,
    missing: before && before.meta ? before.meta.missing || 0 : 0,
    refreshRequired: before && before.meta ? before.meta.refreshRequired || 0 : 0
  });

  var items = [];
  var refreshed = 0;
  var failed = 0;

  if (!dryRun && targets.length) {
    try { if (typeof elig_resetExec_ === 'function') elig_resetExec_(); } catch (e1) {}
    try { if (typeof elig_dep_resetExecCache_ === 'function') elig_dep_resetExecCache_(); } catch (e2) {}
  }

  var loopStart = Date.now();
  for (var i = 0; i < targets.length; i++) {
    var t = targets[i];
    if (dryRun) {
      items.push({ auditId:t.auditId, ok:true, action:'WOULD_REFRESH', reason:t.reason, elapsedMs:0 });
      continue;
    }

    var t0 = Date.now();
    try {
      var fresh = elig_compute_(t.auditId);
      var write = eligService_cacheWrite_(t.auditId, fresh);
      var ok = !!(write && write.ok === true);
      if (ok) refreshed++; else failed++;
      items.push({
        auditId: t.auditId,
        ok: ok,
        action: ok ? 'REFRESHED' : 'WRITE_FAILED',
        reason: t.reason,
        elapsedMs: Date.now() - t0,
        auditors: fresh && fresh.auditors ? fresh.auditors.length : 0,
        computedBuild: fresh ? ETRS_clean_(fresh.computedBuild) : '',
        sheetWritten: !!(write && write.sheetWritten),
        scriptWritten: !!(write && write.scriptWritten)
      });
    } catch (e) {
      failed++;
      items.push({
        auditId: t.auditId,
        ok: false,
        action: 'ERROR',
        reason: t.reason,
        elapsedMs: Date.now() - t0,
        error: String(e && e.message || e)
      });
    }
  }

  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'refreshLoop', {
    selected: targets.length,
    refreshed: refreshed,
    failed: failed,
    dryRun: dryRun,
    loopMs: Date.now() - loopStart
  });

  var after = null;
  if (!dryRun && targets.length) {
    var targetIds = targets.map(function(x){ return x.auditId; });
    after = EligibilityBatchReadModel_get({ auditIds: targetIds });
  }
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'verifyBatch', {
    performed: !!after,
    returned: after && after.rows ? after.rows.length : 0,
    refreshRequired: after && after.meta ? after.meta.refreshRequired || 0 : 0
  });

  var result = {
    success: failed === 0,
    build: ELIGIBILITY_TARGETED_REFRESH_BUILD,
    requested: auditIds.length,
    selected: targets.length,
    refreshed: refreshed,
    skipped: Math.max(0, auditIds.length - targets.length),
    failed: failed,
    dryRun: dryRun,
    force: force,
    items: items,
    verification: after ? {
      returned: after.rows ? after.rows.length : 0,
      missing: after.meta ? after.meta.missing || 0 : 0,
      refreshRequired: after.meta ? after.meta.refreshRequired || 0 : 0,
      currentEligibilityBuild: after.meta ? after.meta.currentEligibilityBuild || '' : ''
    } : null,
    meta: {
      bounded: true,
      maxRefresh: maxRefresh,
      canonicalOwner: 'EligibilityService',
      cacheRole: 'derived acceleration only',
      writesBusinessTruth: false,
      lifecycleWrites: false,
      availabilityWrites: false,
      planningWrites: false
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    requested: auditIds.length,
    selected: targets.length,
    refreshed: refreshed,
    failed: failed,
    dryRun: dryRun
  });
  return result;
}
