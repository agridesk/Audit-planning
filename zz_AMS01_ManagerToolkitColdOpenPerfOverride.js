/**
 * FILE: zz_AMS01_ManagerToolkitColdOpenPerfOverride.js
 * BUILD: AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_ZZ_20260908_R3
 * DEV-only late-load override for AMS-01 Manager Toolkit cold-open validation.
 *
 * Purpose:
 * - Avoid generic persisted/full-sheet Auditors reads on Manager Toolkit open.
 * - If no auditor is selected/assigned/preassigned, return empty enrichment.
 * - Reuse same-execution auditor profiles produced by fast qualification when available.
 * - Otherwise read only Auditors A:P and resolve blocked weekdays.
 * - Preserve the existing companyConstraints output contract.
 */

var AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD = 'AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_ZZ_20260908_R3';

function ManagerV5_applyToolkitAuditorBlockedWeekdays_(companyConstraints, ss, auditorEmail, auditorName) {
  companyConstraints = companyConstraints || {};
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  auditorName = String(auditorName || '').trim().toLowerCase();
  ss = ss || SpreadsheetApp.getActive();

  var bw = '';
  var found = false;
  var skipped = false;
  var source = '';
  var t0 = Date.now();

  if (!auditorEmail && !auditorName) {
    skipped = true;
  } else {
    try {
      var execProfiles = (typeof AMS01_FAST_QUAL_EXEC_PROFILES !== 'undefined' && AMS01_FAST_QUAL_EXEC_PROFILES)
        ? AMS01_FAST_QUAL_EXEC_PROFILES
        : null;
      var cached = null;
      if (execProfiles) {
        if (auditorEmail && execProfiles.byEmail && execProfiles.byEmail[auditorEmail]) cached = execProfiles.byEmail[auditorEmail];
        if (!cached && auditorName && execProfiles.byName && execProfiles.byName[auditorName]) cached = execProfiles.byName[auditorName];
      }
      if (cached) {
        found = true;
        bw = String(cached.blockedWeekdays || '').trim();
        source = 'FAST_QUAL_EXEC_PROFILE';
      }
    } catch (eCache) {}

    if (!found) {
      try {
        var sh = ss.getSheetByName('Auditors');
        if (sh) {
          var lastRow = sh.getLastRow();
          if (lastRow >= 2) {
            var width = Math.min(sh.getLastColumn(), 16);
            var data = sh.getRange(1, 1, lastRow, width).getValues();
            var hdr = data[0] || [];
            var cName = _mp_findCol_(hdr, ['Name','Auditor','Auditor name']);
            var cEmail = _mp_findCol_(hdr, ['E-mail','Email','E mail']);
            var cActive = _mp_findCol_(hdr, ['Active']);
            var cBlock = _mp_findCol_(hdr, ['Blocked weekdays','Default blocked weekdays','Blocked weekdays (default)']);

            for (var r = 1; r < data.length; r++) {
              var row = data[r] || [];
              var rowEmail = cEmail >= 0 ? String(row[cEmail] || '').trim().toLowerCase() : '';
              var rowName = cName >= 0 ? String(row[cName] || '').trim().toLowerCase() : '';
              if ((auditorEmail && rowEmail === auditorEmail) || (auditorName && rowName === auditorName)) {
                if (cActive >= 0) {
                  var active = String(row[cActive] || '').trim().toUpperCase();
                  if (active !== 'YES') break;
                }
                found = true;
                bw = cBlock >= 0 ? String(row[cBlock] || '').trim() : '';
                source = 'DIRECT_BOUNDED_A_P';
                break;
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  companyConstraints.auditorBlockedWeekdays = bw;
  companyConstraints.auditorDefaultBlockedWeekdays = bw;
  companyConstraints.auditorLessAvailableOn = bw;
  companyConstraints.auditorAvailabilityLimitationsDays = bw;
  companyConstraints.__d44AuditorBlockedWeekdaysMatched = found;
  companyConstraints.__d44AuditorBlockedWeekdaysSource = bw ? 'Auditors!P' : '';
  companyConstraints.__ams01BlockedWeekdaysSkipped = skipped;
  companyConstraints.__ams01BlockedWeekdaysBuild = AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD;
  companyConstraints.__ams01BlockedWeekdaysMs = Date.now() - t0;
  companyConstraints.__ams01BlockedWeekdaysPerfSource = source;

  try {
    Logger.log('[AMS01_MANAGER_BLOCKED_WEEKDAYS] ' + JSON.stringify({
      build: AMS01_MANAGER_TOOLKIT_COLD_OPEN_PERF_BUILD,
      auditorEmail: auditorEmail,
      auditorName: auditorName,
      found: found,
      skipped: skipped,
      blockedWeekdays: bw,
      source: source,
      ms: Date.now() - t0
    }));
  } catch (eLog) {}

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
