/***********************************************************************
 * FILE: AMS01_PlanningDemandScopeFastPathTests.js
 * BUILD: 2026-09-10_AMS01_2_PLANNING_DEMAND_SCOPE_FASTPATH_TEST_R1
 *
 * PURPOSE
 * - Prove fast-path scope extraction is functionally identical to the
 *   canonical legacy extractor for real Audit planning rows.
 * - Measure legacy vs fast extraction cost in one GAS execution.
 * - Non-destructive; no writes.
 ***********************************************************************/

var AMS01_PDS_SCOPE_FASTPATH_TEST_BUILD = '2026-09-10_AMS01_2_PLANNING_DEMAND_SCOPE_FASTPATH_TEST_R1';

function AMS01_PDS_SCOPE_TEST_cleanArray_(arr) {
  return (arr || []).map(function(v){ return String(v == null ? '' : v).trim(); }).filter(function(v){ return !!v; });
}

function AMS01_PDS_SCOPE_TEST_legacyNames_(headers, row) {
  if (typeof v5_extractScopesForAuditPlanningRow_ !== 'function') return [];
  var res = v5_extractScopesForAuditPlanningRow_(headers || [], row || []) || {};
  return AMS01_PDS_SCOPE_TEST_cleanArray_((res.scopes || []).map(function(s){
    return s && (s.name || s.code || s.slot);
  }));
}

function AMS01_PDS_SCOPE_TEST_fastNames_(headers, row) {
  if (typeof AMS01_PDS_scopePlan_ !== 'function') throw new Error('Fast-path override unavailable');
  var plan = AMS01_PDS_scopePlan_(headers || []);
  var columns = plan.columns || [];
  var out = [];
  for (var i = 0; i < columns.length; i++) {
    var c = columns[i];
    if (AMS01_PDS_isMarkedX_(row[c.col])) out.push(c.name);
  }
  return out;
}

function AMS01_PDS_SCOPE_TEST_same_(a, b) {
  a = AMS01_PDS_SCOPE_TEST_cleanArray_(a);
  b = AMS01_PDS_SCOPE_TEST_cleanArray_(b);
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function RUN_AMS01_2_PLANNING_DEMAND_SCOPE_FASTPATH_REGRESSION() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) throw new Error("Missing sheet 'Audit planning'");
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) throw new Error('Audit planning empty');

  var headers = values[0] || [];
  var mismatches = [];
  var rowsChecked = 0;

  AMS01_PDS_SCOPE_FASTPATH_CACHE = {};

  var legacyStart = Date.now();
  var legacy = [];
  for (var r = 1; r < values.length; r++) {
    legacy.push(AMS01_PDS_SCOPE_TEST_legacyNames_(headers, values[r] || []));
  }
  var legacyMs = Date.now() - legacyStart;

  AMS01_PDS_SCOPE_FASTPATH_CACHE = {};
  var fastStart = Date.now();
  var fast = [];
  for (var r2 = 1; r2 < values.length; r2++) {
    fast.push(AMS01_PDS_SCOPE_TEST_fastNames_(headers, values[r2] || []));
  }
  var fastMs = Date.now() - fastStart;

  for (var i = 0; i < legacy.length; i++) {
    rowsChecked++;
    if (!AMS01_PDS_SCOPE_TEST_same_(legacy[i], fast[i])) {
      mismatches.push({
        rowNumber: i + 2,
        legacy: legacy[i],
        fast: fast[i]
      });
      if (mismatches.length >= 10) break;
    }
  }

  var plan = AMS01_PDS_scopePlan_(headers);
  var serviceStart = Date.now();
  var period = null;
  var cFrom = typeof PDS_findCol_ === 'function' ? PDS_findCol_(headers, ['Planning window from','Plan van','Planning from','Planning start','Plan start']) : -1;
  var cTo = typeof PDS_findCol_ === 'function' ? PDS_findCol_(headers, ['Planning window to','Plan tot','Planning to','Planning end','Plan end']) : -1;
  var cStatus = typeof PDS_findCol_ === 'function' ? PDS_findCol_(headers, ['Status']) : -1;
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  for (var p = 1; p < values.length; p++) {
    var row = values[p] || [];
    if (cStatus < 0 || cFrom < 0 || cTo < 0) break;
    if (!PDS_statusIncluded_(row[cStatus])) continue;
    var from = PDS_isoDate_(row[cFrom], tz);
    var to = PDS_isoDate_(row[cTo], tz);
    if (from && to && to >= from) { period = {from:from,to:to}; break; }
  }
  if (!period) throw new Error('No active smoke period found');

  var service = PlanningDemandService_get({from:period.from,to:period.to,limit:50});
  var serviceMs = Date.now() - serviceStart;

  var out = {
    ok: mismatches.length === 0,
    build: AMS01_PDS_SCOPE_FASTPATH_TEST_BUILD,
    rowsChecked: rowsChecked,
    mismatches: mismatches,
    legacyMs: legacyMs,
    fastMs: fastMs,
    gainMs: legacyMs - fastMs,
    gainPct: legacyMs > 0 ? Math.round((legacyMs-fastMs)*1000/legacyMs)/10 : 0,
    plan: {
      source: plan.source,
      configuredScopes: plan.configuredScopes,
      matchedColumns: plan.matchedColumns
    },
    serviceSmoke: {
      period: period,
      serverMs: serviceMs,
      returned: service && service.rows ? service.rows.length : 0,
      devPerformance: service ? service.devPerformance || null : null,
      perfProbe: service && service.meta ? service.meta.perfProbe || null : null
    }
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
