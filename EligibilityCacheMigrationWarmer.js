/***********************************************************************
 * EligibilityCacheMigrationWarmer.js
 * BUILD: 2026-09-09_ROADMAP_2_4_ELIGIBILITY_CACHE_MIGRATION_WARMER_R1
 *
 * PURPOSE
 *   Bounded background/manual migration of derived Eligibility_Cache rows
 *   after EligibilityService build/generation changes.
 *
 * GOVERNANCE
 *   - EligibilityService remains the sole eligibility compute/cache owner.
 *   - Delegates all refresh work to EligibilityTargetedRefreshService_refresh.
 *   - Eligibility_Cache is derived acceleration only.
 *   - No lifecycle, planning, availability or status writes.
 *   - Not for user-facing hot paths.
 *
 * SPEED / SAFETY CONTRACT
 *   - At most one Audit planning bulk read when auditIds are not supplied.
 *   - Hard bounded scan window and hard bounded refresh count.
 *   - Default maxRefresh=2 because cold canonical recompute is expensive.
 *   - Caller may supply Concept Planning refreshAuditIds to skip Audit planning.
 *   - Dry-run is supported and performs no cache writes.
 ***********************************************************************/

var ELIGIBILITY_CACHE_MIGRATION_WARMER_BUILD = '2026-09-09_ROADMAP_2_4_ELIGIBILITY_CACHE_MIGRATION_WARMER_R1';
var ECMW_CURSOR_PROP = 'ROADMAP_2_4_ELIG_MIGRATION_CURSOR';

function ECMW_clean_(v) {
  return String(v == null ? '' : v).trim();
}

function ECMW_uniqueIds_(raw) {
  var arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var id = ECMW_clean_(arr[i]);
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

function ECMW_findAuditIdCol_(hdr) {
  hdr = hdr || [];
  for (var i = 0; i < hdr.length; i++) {
    var h = ECMW_clean_(hdr[i]).toLowerCase().replace(/[ _-]/g, '');
    if (h === 'auditid') return i;
  }
  return -1;
}

function ECMW_loadAuditIds_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('EligibilityCacheMigrationWarmer: no active spreadsheet');
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("EligibilityCacheMigrationWarmer: missing sheet 'Audit planning'");
  var data = sh.getDataRange().getValues() || [];
  if (!data.length) return { ids: [], rowsRead: 0, colsRead: 0 };
  var col = ECMW_findAuditIdCol_(data[0] || []);
  if (col < 0) throw new Error('EligibilityCacheMigrationWarmer: Audit ID column not found');
  var ids = [];
  for (var r = 1; r < data.length; r++) {
    var id = ECMW_clean_(data[r][col]);
    if (id) ids.push(id);
  }
  return { ids: ECMW_uniqueIds_(ids), rowsRead: data.length, colsRead: (data[0] || []).length };
}

function ECMW_segment_(ids, start, maxScan) {
  ids = ids || [];
  if (!ids.length) return { ids: [], start: 0, next: 0, wrapped: false };
  start = Number(start || 0);
  if (!isFinite(start) || start < 0 || start >= ids.length) start = 0;
  maxScan = Math.max(1, Math.min(100, Number(maxScan || 30) || 30));
  var out = [];
  var idx = start;
  var wrapped = false;
  while (out.length < maxScan && out.length < ids.length) {
    out.push(ids[idx]);
    idx++;
    if (idx >= ids.length) {
      idx = 0;
      wrapped = true;
    }
  }
  return { ids: out, start: start, next: idx, wrapped: wrapped };
}

function EligibilityCacheMigrationWarmer_run(input) {
  input = input || {};
  var dryRun = input.dryRun === true;
  var resetCursor = input.resetCursor === true;
  var maxRefresh = Math.max(1, Math.min(5, Number(input.maxRefresh || 2) || 2));
  var maxScan = Math.max(maxRefresh, Math.min(100, Number(input.maxScan || 30) || 30));
  var supplied = ECMW_uniqueIds_(input.auditIds || input.refreshAuditIds || []);

  var perf = (typeof DPL_start_ === 'function') ? DPL_start_('EligibilityCacheMigrationWarmer_run', {
    dryRun: dryRun,
    suppliedAuditIds: supplied.length,
    maxScan: maxScan,
    maxRefresh: maxRefresh
  }) : null;

  if (typeof EligibilityTargetedRefreshService_refresh !== 'function') {
    throw new Error('EligibilityCacheMigrationWarmer: EligibilityTargetedRefreshService_refresh unavailable');
  }

  var loaded = { ids: supplied, rowsRead: 0, colsRead: 0 };
  if (!supplied.length) loaded = ECMW_loadAuditIds_();
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'loadAuditIds', {
    source: supplied.length ? 'supplied' : 'Audit planning',
    totalIds: loaded.ids.length,
    rowsRead: loaded.rowsRead,
    colsRead: loaded.colsRead
  });

  var props = PropertiesService.getScriptProperties();
  var cursor = 0;
  if (!supplied.length && !resetCursor) {
    cursor = parseInt(props.getProperty(ECMW_CURSOR_PROP) || '0', 10);
    if (!isFinite(cursor) || cursor < 0) cursor = 0;
  }
  var segment = ECMW_segment_(loaded.ids, supplied.length ? 0 : cursor, maxScan);

  var refresh = EligibilityTargetedRefreshService_refresh({
    auditIds: segment.ids,
    dryRun: dryRun,
    force: false,
    maxRefresh: maxRefresh
  });
  if (typeof DPL_mark_ === 'function') DPL_mark_(perf, 'targetedRefresh', {
    scanned: segment.ids.length,
    selected: refresh && refresh.selected || 0,
    refreshed: refresh && refresh.refreshed || 0,
    orphaned: refresh && refresh.orphaned || 0,
    failed: refresh && refresh.failed || 0,
    dryRun: dryRun
  });

  if (!supplied.length && !dryRun) props.setProperty(ECMW_CURSOR_PROP, String(segment.next));

  var result = {
    success: !!(refresh && refresh.success === true),
    build: ELIGIBILITY_CACHE_MIGRATION_WARMER_BUILD,
    source: supplied.length ? 'suppliedAuditIds' : 'Audit planning',
    totalAuditIds: loaded.ids.length,
    scanned: segment.ids.length,
    cursorStart: segment.start,
    cursorNext: segment.next,
    wrapped: segment.wrapped,
    dryRun: dryRun,
    refresh: refresh,
    meta: {
      backgroundOnly: true,
      hotPathForbidden: true,
      bounded: true,
      maxScan: maxScan,
      maxRefresh: maxRefresh,
      canonicalOwner: 'EligibilityService via EligibilityTargetedRefreshService_refresh',
      cacheRole: 'derived acceleration only',
      writesBusinessTruth: false,
      lifecycleWrites: false,
      planningWrites: false,
      availabilityWrites: false,
      statusWrites: false,
      callerCanReuseConceptRefreshIds: true
    }
  };

  if (typeof DPL_end_ === 'function') result.devPerformance = DPL_end_(perf, {
    totalAuditIds: loaded.ids.length,
    scanned: segment.ids.length,
    selected: refresh && refresh.selected || 0,
    refreshed: refresh && refresh.refreshed || 0,
    dryRun: dryRun
  });
  return result;
}
