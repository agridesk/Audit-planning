/***********************************************************************
 * FILE: AMS01_PlanningContextScopePreloadPerfTests.js
 * BUILD: 2026-09-10_AMS01_2_CONTEXT_SCOPE_PRELOAD_PERF_GATE_R1
 *
 * PURPOSE
 * - Verify PlanningContext R3 preloads canonical scope evidence before demand.
 * - Prove PlanningDemand no longer pays Config_Scopes initialization inside
 *   its per-row scope extraction phase.
 * - Compare ConfigScopes service-cache path with direct canonical sheet read.
 * - Measure realistic current-month + 3-month Planning Workspace context.
 *
 * SAFETY
 * - No business-data writes.
 * - ConfigScopes_GetCatalog(false) may populate the existing canonical cache
 *   when absent; no new cache or source of truth is introduced.
 ***********************************************************************/

var AMS01_CONTEXT_SCOPE_PRELOAD_TEST_BUILD = '2026-09-10_AMS01_2_CONTEXT_SCOPE_PRELOAD_PERF_GATE_R1';

function AMS01_CSP_period_() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var now = new Date();
  var from = Utilities.formatDate(now, tz, 'yyyy-MM-01');
  var y = Number(Utilities.formatDate(now, tz, 'yyyy'));
  var m = Number(Utilities.formatDate(now, tz, 'M')) - 1;
  var end = new Date(y, m + 4, 0, 12, 0, 0, 0);
  return { from: from, to: Utilities.formatDate(end, tz, 'yyyy-MM-dd'), timezone: tz };
}

function AMS01_CSP_resetScopeExecCache_() {
  if (typeof CONFIGSCOPES_EXEC_CACHE !== 'undefined' && CONFIGSCOPES_EXEC_CACHE) {
    CONFIGSCOPES_EXEC_CACHE.catalog = null;
    CONFIGSCOPES_EXEC_CACHE.byDisplay = null;
    CONFIGSCOPES_EXEC_CACHE.aliasMeta = null;
  }
  if (typeof AMS01_PDS_SCOPE_FASTPATH_CACHE !== 'undefined') {
    AMS01_PDS_SCOPE_FASTPATH_CACHE = {};
  }
}

function AMS01_CSP_stage_(perf, name) {
  var stages = perf && Array.isArray(perf.stages) ? perf.stages : [];
  for (var i = 0; i < stages.length; i++) {
    if (stages[i] && stages[i].stage === name) return stages[i];
  }
  return null;
}

function RUN_AMS01_2_CONTEXT_SCOPE_PRELOAD_PERF_GATE() {
  if (typeof PlanningContextReadModel_get !== 'function') throw new Error('PlanningContextReadModel_get unavailable');
  if (typeof ConfigScopes_GetCatalog !== 'function') throw new Error('ConfigScopes_GetCatalog unavailable');
  if (typeof ConfigScopes_loadCatalogFromSheet_ !== 'function') throw new Error('ConfigScopes_loadCatalogFromSheet_ unavailable');

  var period = AMS01_CSP_period_();

  AMS01_CSP_resetScopeExecCache_();
  var serviceStarted = Date.now();
  var serviceCatalog = ConfigScopes_GetCatalog(false) || {};
  var serviceCatalogMs = Date.now() - serviceStarted;

  AMS01_CSP_resetScopeExecCache_();
  var directStarted = Date.now();
  var directCatalog = ConfigScopes_loadCatalogFromSheet_() || {};
  var directCatalogMs = Date.now() - directStarted;

  AMS01_CSP_resetScopeExecCache_();
  var coldStarted = Date.now();
  var cold = PlanningContextReadModel_get({
    from: period.from,
    to: period.to,
    includeAvailability: true
  });
  var coldWallMs = Date.now() - coldStarted;

  var warmStarted = Date.now();
  var warm = PlanningContextReadModel_get({
    from: period.from,
    to: period.to,
    includeAvailability: true
  });
  var warmWallMs = Date.now() - warmStarted;

  var coldDemandPerf = cold && cold.demand ? cold.demand.devPerformance || null : null;
  var warmDemandPerf = warm && warm.demand ? warm.demand.devPerformance || null : null;
  var coldContextPerf = cold ? cold.devPerformance || null : null;
  var warmContextPerf = warm ? warm.devPerformance || null : null;
  var coldScopeStage = AMS01_CSP_stage_(coldContextPerf, 'scopeEvidence');
  var coldDemandStage = AMS01_CSP_stage_(coldContextPerf, 'demand');

  var coldScopeExtractMs = coldDemandPerf && coldDemandPerf.extra ? Number(coldDemandPerf.extra.scopeExtractMs || 0) : null;
  var warmScopeExtractMs = warmDemandPerf && warmDemandPerf.extra ? Number(warmDemandPerf.extra.scopeExtractMs || 0) : null;

  var checks = [
    { name: 'contextSuccess', ok: !!(cold && cold.success && warm && warm.success) },
    { name: 'scopeEvidencePreloadedBeforeDemand', ok: !!(cold && cold.meta && cold.meta.scopeEvidencePreloadedBeforeDemand === true) },
    { name: 'canonicalScopeOwnerUnchanged', ok: !!(cold && cold.meta && cold.meta.canonicalOwners && cold.meta.canonicalOwners.scope === 'Config_Scopes') },
    { name: 'coldDemandScopeExtractionLocal', ok: coldScopeExtractMs !== null && coldScopeExtractMs <= 50 },
    { name: 'warmDemandScopeExtractionLocal', ok: warmScopeExtractMs !== null && warmScopeExtractMs <= 50 },
    { name: 'catalogSemanticCountEqual', ok: Number(serviceCatalog.rowCount || 0) === Number(directCatalog.rowCount || 0) }
  ];

  var failed = checks.filter(function(x){ return !x.ok; });
  var out = {
    ok: failed.length === 0,
    build: AMS01_CONTEXT_SCOPE_PRELOAD_TEST_BUILD,
    contextBuild: cold ? cold.build || '' : '',
    period: period,
    checks: checks,
    failed: failed,
    scopeCatalog: {
      serviceCachePathMs: serviceCatalogMs,
      directCanonicalSheetMs: directCatalogMs,
      serviceRows: Number(serviceCatalog.rowCount || 0),
      directRows: Number(directCatalog.rowCount || 0)
    },
    cold: {
      wallServerMs: coldWallMs,
      scopeEvidenceStageMs: coldScopeStage ? coldScopeStage.deltaMs : null,
      demandStageMs: coldDemandStage ? coldDemandStage.deltaMs : null,
      demandScopeExtractMs: coldScopeExtractMs,
      contextPerformance: coldContextPerf,
      demandPerformance: coldDemandPerf,
      profilesPerformance: cold && cold.profiles ? cold.profiles.devPerformance || null : null,
      availabilityPerformance: cold && cold.availability ? cold.availability.devPerformance || null : null
    },
    warm: {
      wallServerMs: warmWallMs,
      demandScopeExtractMs: warmScopeExtractMs,
      contextPerformance: warmContextPerf,
      demandPerformance: warmDemandPerf,
      profilesPerformance: warm && warm.profiles ? warm.profiles.devPerformance || null : null,
      availabilityPerformance: warm && warm.availability ? warm.availability.devPerformance || null : null
    },
    businessDataWrites: false
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
