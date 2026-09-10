/***********************************************************************
 * FILE: AMS01_PlanningWorkspaceRealPeriodPerfTests.js
 * BUILD: 2026-09-10_AMS01_2_WORKSPACE_REAL_PERIOD_PERF_R1
 *
 * PURPOSE
 * - Measure the actual Planning Workspace default period: current month
 *   through +3 months.
 * - Separate cold/warm context cost and Availability contribution.
 * - Read-only diagnostics only; no writes and no business-rule changes.
 ***********************************************************************/

var AMS01_WORKSPACE_REAL_PERIOD_PERF_BUILD = '2026-09-10_AMS01_2_WORKSPACE_REAL_PERIOD_PERF_R1';

function AMS01_WRP_isoMonthStart_(date, tz) {
  return Utilities.formatDate(date, tz, 'yyyy-MM-01');
}

function AMS01_WRP_monthEndPlus_(date, monthsAhead, tz) {
  var y = Number(Utilities.formatDate(date, tz, 'yyyy'));
  var m = Number(Utilities.formatDate(date, tz, 'M')) - 1;
  var d = new Date(y, m + monthsAhead + 1, 0, 12, 0, 0, 0);
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function AMS01_WRP_runContext_(label, from, to, includeAvailability) {
  var started = Date.now();
  var result = PlanningContextReadModel_get({
    from: from,
    to: to,
    includeAvailability: includeAvailability !== false
  });
  return {
    label: label,
    wallServerMs: Date.now() - started,
    includeAvailability: includeAvailability !== false,
    demandRows: result && result.demand && result.demand.rows ? result.demand.rows.length : 0,
    companyProfiles: result && result.profiles && result.profiles.companies ? result.profiles.companies.length : 0,
    auditorProfiles: result && result.profiles && result.profiles.auditors ? result.profiles.auditors.length : 0,
    availabilityRows: result && result.availability && result.availability.rows ? result.availability.rows.length : 0,
    devPerformance: result ? result.devPerformance || null : null,
    demandPerformance: result && result.demand ? result.demand.devPerformance || null : null,
    profilesPerformance: result && result.profiles ? result.profiles.devPerformance || null : null,
    availabilityPerformance: result && result.availability ? result.availability.devPerformance || null : null
  };
}

function RUN_AMS01_2_PLANNING_WORKSPACE_REAL_PERIOD_PERF() {
  if (typeof PlanningContextReadModel_get !== 'function') {
    throw new Error('PlanningContextReadModel_get unavailable');
  }

  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  var now = new Date();
  var from = AMS01_WRP_isoMonthStart_(now, tz);
  var to = AMS01_WRP_monthEndPlus_(now, 3, tz);

  var coldFull = AMS01_WRP_runContext_('COLD_FULL_CONTEXT', from, to, true);
  var warmFull = AMS01_WRP_runContext_('WARM_FULL_CONTEXT', from, to, true);
  var warmNoAvailability = AMS01_WRP_runContext_('WARM_NO_AVAILABILITY', from, to, false);

  var out = {
    ok: true,
    build: AMS01_WORKSPACE_REAL_PERIOD_PERF_BUILD,
    period: { from: from, to: to, timezone: tz },
    runs: {
      coldFull: coldFull,
      warmFull: warmFull,
      warmNoAvailability: warmNoAvailability
    },
    derived: {
      warmAvailabilityContributionMs: Math.max(0, warmFull.wallServerMs - warmNoAvailability.wallServerMs),
      coldToWarmGainMs: Math.max(0, coldFull.wallServerMs - warmFull.wallServerMs),
      coldToWarmGainPct: coldFull.wallServerMs > 0 ? Math.round(((coldFull.wallServerMs - warmFull.wallServerMs) * 1000 / coldFull.wallServerMs)) / 10 : 0
    },
    readOnly: true
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
