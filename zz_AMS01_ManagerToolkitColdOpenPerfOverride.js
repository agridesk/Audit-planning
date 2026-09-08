/**
 * FILE: zz_AMS01_ManagerToolkitColdOpenPerfOverride.js
 * BUILD: AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_ZZ_20260908_R1
 * DEV-only late-load override for AMS-01 Manager Toolkit cold-open validation.
 *
 * Purpose:
 * - Manager first paint may have no selected/assigned/preassigned auditor.
 * - In that case blocked-weekday enrichment has no subject and must not read
 *   the Auditors sheet just to return empty values.
 * - When an auditor identifier is present, delegate unchanged to the same
 *   canonical lookup helper and preserve the existing output contract.
 */

var AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD = 'AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_ZZ_20260908_R1';

function ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, auditorEmail, auditorName) {
  companyConstraints = companyConstraints || {};
  auditorEmail = String(auditorEmail || '').trim();
  auditorName = String(auditorName || '').trim();

  if (!auditorEmail && !auditorName) {
    companyConstraints.auditorBlockedWeekdays = '';
    companyConstraints.auditorDefaultBlockedWeekdays = '';
    companyConstraints.auditorLessAvailableOn = '';
    companyConstraints.auditorAvailabilityLimitationsDays = '';
    companyConstraints.__d44AuditorBlockedWeekdaysMatched = false;
    companyConstraints.__d44AuditorBlockedWeekdaysSource = '';
    companyConstraints.__ams01BlockedWeekdaysSkipped = true;
    companyConstraints.__ams01BlockedWeekdaysBuild = AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD;
    return companyConstraints;
  }

  var aud = ManagerV5_getAuditorBlockedWeekdaysFromAuditors_(ss, auditorEmail, auditorName);
  var bw = aud && aud.blockedWeekdays ? String(aud.blockedWeekdays || '').trim() : '';
  companyConstraints.auditorBlockedWeekdays = bw;
  companyConstraints.auditorDefaultBlockedWeekdays = bw;
  companyConstraints.auditorLessAvailableOn = bw;
  companyConstraints.auditorAvailabilityLimitationsDays = bw;
  companyConstraints.__d44AuditorBlockedWeekdaysMatched = !!(aud && aud.found);
  companyConstraints.__d44AuditorBlockedWeekdaysSource = bw ? 'Auditors!P' : '';
  companyConstraints.__ams01BlockedWeekdaysSkipped = false;
  companyConstraints.__ams01BlockedWeekdaysBuild = AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD;
  return companyConstraints;
}

function AMS01_ManagerToolkitColdOpenPerfStatus() {
  var probe = {};
  var t0 = Date.now();
  probe = ManagerV5_applyToolkitAuditorBlockedWeekdays_({}, SpreadsheetApp.getActive(), '', '');
  return {
    success: true,
    active: probe && probe.__ams01BlockedWeekdaysBuild === AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD,
    build: AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD,
    skippedWithoutAuditor: !!(probe && probe.__ams01BlockedWeekdaysSkipped),
    wallMs: Date.now() - t0
  };
}
