/***********************************************************************
 * PlanningDemandServiceTests.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_DEMAND_TESTS_R2_PERF_ISOLATION
 *
 * Non-destructive regression + real-data DEV smoke.
 ***********************************************************************/

var PLANNING_DEMAND_TEST_BUILD = '2026-09-10_AMS01_2_PLANNING_DEMAND_TESTS_R2_PERF_ISOLATION';

function PDS_TEST_assert_(cond, name, detail, results) {
  results.push({ name: name, ok: !!cond, detail: cond ? '' : String(detail || '') });
}

function PDS_TEST_findSmokePeriod_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("Missing sheet 'Audit planning'");
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('Audit planning is empty');
  var hdr = values[0] || [];
  var cStatus = PDS_findCol_(hdr, ['Status']);
  var cFrom = PDS_findCol_(hdr, ['Planning window from','Plan van','Planning from','Planning start','Plan start']);
  var cTo = PDS_findCol_(hdr, ['Planning window to','Plan tot','Planning to','Planning end','Plan end']);
  if (cStatus < 0 || cFrom < 0 || cTo < 0) throw new Error('Planning Demand smoke: required window/status columns missing');
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  for (var r = 1; r < values.length; r++) {
    var st = PDS_clean_(values[r][cStatus]);
    if (!PDS_statusIncluded_(st)) continue;
    var from = PDS_isoDate_(values[r][cFrom], tz);
    var to = PDS_isoDate_(values[r][cTo], tz);
    if (from && to && to >= from) return { from: from, to: to };
  }
  throw new Error('Planning Demand smoke: no active audit with valid planning window found');
}

function RUN_PLANNING_DEMAND_REGRESSION() {
  var results = [];
  var p = { from: '2026-01-01', to: '2026-01-31' };

  PDS_TEST_assert_(PDS_windowOverlaps_('2025-12-01','2026-01-01',p) === true, 'overlapBoundaryStart', '', results);
  PDS_TEST_assert_(PDS_windowOverlaps_('2026-01-31','2026-02-15',p) === true, 'overlapBoundaryEnd', '', results);
  PDS_TEST_assert_(PDS_windowOverlaps_('2025-10-01','2025-12-31',p) === false, 'noOverlapBefore', '', results);
  PDS_TEST_assert_(PDS_windowOverlaps_('2026-02-01','2026-03-01',p) === false, 'noOverlapAfter', '', results);
  PDS_TEST_assert_(PDS_statusIncluded_('Pending Planning') === true, 'pendingPlanningIncluded', '', results);
  PDS_TEST_assert_(PDS_statusIncluded_('Completed') === false, 'completedExcluded', '', results);
  PDS_TEST_assert_(PDS_urgency_('2025-12-31', p) === 'OVERDUE', 'urgencyOverdue', '', results);
  PDS_TEST_assert_(PDS_urgency_('2026-01-20', p) === 'DUE_IN_PERIOD', 'urgencyDue', '', results);
  PDS_TEST_assert_(PDS_urgency_('2026-02-20', p) === 'OPEN_IN_PERIOD', 'urgencyOpen', '', results);

  var smokePeriod = PDS_TEST_findSmokePeriod_();
  var t0 = Date.now();
  var smoke = PlanningDemandService_get({ from: smokePeriod.from, to: smokePeriod.to, limit: 50 });
  var wallServerMs = Date.now() - t0;

  PDS_TEST_assert_(smoke && smoke.success === true, 'realDataSmokeSuccess', smoke && smoke.message, results);
  PDS_TEST_assert_(smoke && Array.isArray(smoke.rows), 'realDataRowsArray', '', results);
  PDS_TEST_assert_(smoke && smoke.totals && typeof smoke.totals.audits === 'number', 'realDataTotals', '', results);
  PDS_TEST_assert_(smoke && smoke.meta && smoke.meta.writes === false, 'readOnlyContract', '', results);
  PDS_TEST_assert_(smoke && smoke.meta && smoke.meta.perfProbe && typeof smoke.meta.perfProbe.scopeExtractMs === 'number', 'perfProbeContract', '', results);

  var failed = results.filter(function(x){ return !x.ok; });
  var out = {
    ok: failed.length === 0,
    build: PLANNING_DEMAND_TEST_BUILD,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    smokePeriod: smokePeriod,
    smokeReturned: smoke && smoke.rows ? smoke.rows.length : 0,
    smokeCandidates: smoke && smoke.meta ? smoke.meta.periodCandidates : null,
    smokeServerMs: wallServerMs,
    devPerformance: smoke ? smoke.devPerformance || null : null,
    perfProbe: smoke && smoke.meta ? smoke.meta.perfProbe || null : null,
    results: results
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_AMS01_2_PLANNING_DEMAND_PERF() {
  var period = PDS_TEST_findSmokePeriod_();

  function run_(label, includeCompanyMeta) {
    var started = Date.now();
    var result = PlanningDemandService_get({
      from: period.from,
      to: period.to,
      limit: 500,
      includeCompanyMeta: includeCompanyMeta
    });
    return {
      label: label,
      wallServerMs: Date.now() - started,
      returned: result && result.rows ? result.rows.length : 0,
      candidates: result && result.meta ? result.meta.periodCandidates : null,
      devPerformance: result ? result.devPerformance || null : null,
      perfProbe: result && result.meta ? result.meta.perfProbe || null : null
    };
  }

  var withoutCompanyProjection = run_('NO_COMPANY_PROJECTION', false);
  var withCompanyProjection = run_('WITH_COMPANY_PROJECTION', true);
  var out = {
    ok: true,
    build: PLANNING_DEMAND_TEST_BUILD,
    serviceBuild: PLANNING_DEMAND_BUILD,
    period: period,
    withoutCompanyProjection: withoutCompanyProjection,
    withCompanyProjection: withCompanyProjection,
    companyProjectionDeltaMs: withCompanyProjection.wallServerMs - withoutCompanyProjection.wallServerMs
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
