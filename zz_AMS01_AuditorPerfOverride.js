/**
 * FILE: zz_AMS01_AuditorPerfOverride.js
 * BUILD: AMS01_AUDITOR_PERF_OVERRIDE_20260907_R1
 *
 * DEV-only performance override.
 *
 * Evidence from AMS-01 regression tests:
 * - auditorV5_extractPlannedSummary_ spent ~1.9s for 11 planned rows.
 * - A semantically identical candidate using one timezone resolution spent ~16-23ms.
 *
 * This override keeps the public helper contract unchanged and only memoizes
 * the spreadsheet timezone for the current Apps Script execution.
 */

var AMS01_AUDITOR_PERF_OVERRIDE_BUILD = 'AMS01_AUDITOR_PERF_OVERRIDE_20260907_R1';
var AMS01_AUDITOR_TZ_CACHE_ = null;

function auditorV5_getTz_() {
  if (AMS01_AUDITOR_TZ_CACHE_) return AMS01_AUDITOR_TZ_CACHE_;
  var tz = '';
  try {
    var ss = auditorV5_getSs_();
    if (ss && ss.getSpreadsheetTimeZone) {
      tz = String(ss.getSpreadsheetTimeZone() || '').trim();
    }
  } catch (e) {}
  AMS01_AUDITOR_TZ_CACHE_ = tz || 'Europe/Paris';
  return AMS01_AUDITOR_TZ_CACHE_;
}

auditorV5_getTz_.__ams01Build = AMS01_AUDITOR_PERF_OVERRIDE_BUILD;

function AMS01_AuditorPerfOverrideStatus() {
  return {
    build: AMS01_AUDITOR_PERF_OVERRIDE_BUILD,
    active: !!(auditorV5_getTz_ && auditorV5_getTz_.__ams01Build === AMS01_AUDITOR_PERF_OVERRIDE_BUILD),
    resolvedTimeZone: auditorV5_getTz_()
  };
}
