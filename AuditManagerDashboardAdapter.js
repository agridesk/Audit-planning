// FILE: AuditManagerDashboardAdapter.js
// BUILD: 2026-04-28_DASHBOARD_ADAPTER_LIGHT_STATUS_COLUMN_ONLY
// PURPOSE:
//   Restore Manager dashboard endpoints expected by ManagerV5UI.html.
//   Safe adapter: no action/status/planning logic changes.
//   Reads ENV/version from SystemConfig when available, with legacy fallback.

function getManagerV5DashboardData() {
  var started = new Date().getTime();

  try {
    // PERFORMANCE NOTE — 2026-04-28
    // This endpoint is called during Manager UI init in parallel with getManagerV5Open().
    // Previous build constructed full row objects for every Audit planning row and then
    // optionally ran location consistency checks. That duplicated the heavy grid read path.
    // This version is intentionally lightweight:
    // - reads only the Status column for counts
    // - keeps environment/user payload intact
    // - returns locationIssues as [] during init
    // - does not write or change status/planning/availability behavior

    var envPayload = ManagerDashboard_getEnvironmentPayload_();

    var env = envPayload.env;
    var version = envPayload.version;
    var deployLabel = envPayload.deployLabel;
    var buildSource = envPayload.buildSource;
    var banner = envPayload.banner;
    var notificationMode = envPayload.notificationMode;
    var devWriteMode = envPayload.devWriteMode;
    var allowDevWrites = envPayload.allowDevWrites;

    var user = 'UNKNOWN';
    try {
      if (typeof V5_resolveManagerEmail_ === 'function') {
        user = V5_resolveManagerEmail_({});
      }
    } catch (eUser) {}

    var empty = {
      env: env,
      version: version,
      deployLabel: deployLabel,
      buildSource: buildSource,
      banner: banner,
      notificationMode: notificationMode,
      devWriteMode: devWriteMode,
      allowDevWrites: allowDevWrites,
      user: user,
      counts: {
        total: 0,
        pendingPlanning: 0,
        pendingApproval: 0,
        approved: 0,
        rejected: 0,
        accepted: 0
      },
      locationIssues: [],
      perf: {
        dashboardAdapterMs: new Date().getTime() - started,
        mode: 'LIGHT_STATUS_COLUMN_ONLY'
      }
    };

    var sheet = null;
    try {
      if (typeof getAuditPlanningSheet_ === 'function') {
        sheet = getAuditPlanningSheet_();
      } else {
        sheet = SpreadsheetApp.getActive().getSheetByName('Audit planning');
      }
    } catch (eSheet) {}

    if (!sheet) return empty;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return empty;

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
    var statusCol = ManagerDashboard_findHeaderIndex_(headers, ['Status']);
    if (statusCol < 0) return empty;

    var values = sheet.getRange(2, statusCol + 1, lastRow - 1, 1).getValues();

    var counts = {
      total: 0,
      pendingPlanning: 0,
      pendingApproval: 0,
      approved: 0,
      rejected: 0,
      accepted: 0
    };

    for (var r = 0; r < values.length; r++) {
      var raw = String(values[r][0] || '').trim();
      if (!raw) continue;

      counts.total++;

      var norm = '';
      try {
        if (typeof Status_normalizeStatus_ === 'function') {
          norm = Status_normalizeStatus_(raw);
        }
      } catch (eNorm) {}

      if (!norm) norm = raw.toUpperCase().replace(/\s+/g, '_');

      if (norm === 'PENDING_PLANNING') counts.pendingPlanning++;
      else if (norm === 'PENDING_APPROVAL') counts.pendingApproval++;
      else if (norm === 'APPROVED') counts.approved++;
      else if (norm === 'REJECTED') counts.rejected++;
      else if (norm === 'ACCEPTED') counts.accepted++;
    }

    try {
      if (typeof logManagerV5_ === 'function') {
        logManagerV5_('Dashboard data requested', {
          user: user,
          env: env,
          version: version,
          deployLabel: deployLabel,
          counts: counts,
          mode: 'LIGHT_STATUS_COLUMN_ONLY'
        });
      }
    } catch (eLog) {}

    return {
      env: env,
      version: version,
      deployLabel: deployLabel,
      buildSource: buildSource,
      banner: banner,
      notificationMode: notificationMode,
      devWriteMode: devWriteMode,
      allowDevWrites: allowDevWrites,
      user: user,
      counts: counts,
      locationIssues: [],
      perf: {
        dashboardAdapterMs: new Date().getTime() - started,
        mode: 'LIGHT_STATUS_COLUMN_ONLY',
        rowsScanned: values.length
      }
    };

  } catch (e) {

    var fallback = ManagerDashboard_getEnvironmentPayloadSafeFallback_();

    return {
      env: fallback.env,
      version: fallback.version,
      deployLabel: fallback.deployLabel,
      buildSource: fallback.buildSource,
      banner: fallback.banner,
      notificationMode: fallback.notificationMode,
      devWriteMode: fallback.devWriteMode,
      allowDevWrites: fallback.allowDevWrites,
      user: 'UNKNOWN',
      counts: {
        total: 0,
        pendingPlanning: 0,
        pendingApproval: 0,
        approved: 0,
        rejected: 0,
        accepted: 0
      },
      locationIssues: [],
      error: String(e && e.message ? e.message : e),
      perf: {
        dashboardAdapterMs: new Date().getTime() - started,
        mode: 'LIGHT_STATUS_COLUMN_ONLY_ERROR'
      }
    };
  }
}

function ManagerDashboard_findHeaderIndex_(headers, candidates) {
  headers = headers || [];
  candidates = candidates || [];

  function norm_(v) {
    return String(v == null ? '' : v)
      .replace(/\u00A0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var k = norm_(headers[i]);
    if (k && !map.hasOwnProperty(k)) map[k] = i;
  }

  for (var j = 0; j < candidates.length; j++) {
    var c = norm_(candidates[j]);
    if (c && map.hasOwnProperty(c)) return map[c];
  }

  return -1;
}

function ManagerV5_GetDashboard() {
  return getManagerV5DashboardData();
}

function ManagerDashboard_getEnvironmentPayload_() {
  try {
    if (typeof SYS_getUiEnvironmentPayload_ === 'function') {
      var p = SYS_getUiEnvironmentPayload_();

      if (p && p.ok) {
        return {
          env: String(p.env || 'DEV'),
          version: String(p.appVersion || ''),
          deployLabel: String(p.deployLabel || ''),
          buildSource: String(p.buildSource || ''),
          banner: String(p.banner || ''),
          notificationMode: String(p.notificationMode || ''),
          devWriteMode: String(p.devWriteMode || ''),
          allowDevWrites: !!p.allowDevWrites
        };
      }
    }
  } catch (eSys) {}

  return ManagerDashboard_getEnvironmentPayloadSafeFallback_();
}

function ManagerDashboard_getEnvironmentPayloadSafeFallback_() {
  var env = 'PROD';
  var version = 'dashboard-adapter-2026-04-25';
  var deployLabel = '';
  var buildSource = '';
  var banner = '';
  var notificationMode = '';
  var devWriteMode = '';
  var allowDevWrites = false;

  try {
    if (typeof MANAGER_V5_ENVIRONMENT !== 'undefined') {
      env = String(MANAGER_V5_ENVIRONMENT || env);
    }
  } catch (eEnv) {}

  try {
    if (typeof MANAGER_V5_VERSION !== 'undefined') {
      version = String(MANAGER_V5_VERSION || version);
    }
  } catch (eVer) {}

  try {
    if (typeof MANAGER_V5_DEPLOY_LABEL !== 'undefined') {
      deployLabel = String(MANAGER_V5_DEPLOY_LABEL || '');
    }
  } catch (eDep) {}

  try {
    if (typeof MANAGER_V5_BUILD_SOURCE !== 'undefined') {
      buildSource = String(MANAGER_V5_BUILD_SOURCE || '');
    }
  } catch (eSrc) {}

  try {
    if (typeof MANAGER_V5_BANNER !== 'undefined') {
      banner = String(MANAGER_V5_BANNER || '');
    }
  } catch (eBanner) {}

  return {
    env: env,
    version: version,
    deployLabel: deployLabel,
    buildSource: buildSource,
    banner: banner,
    notificationMode: notificationMode,
    devWriteMode: devWriteMode,
    allowDevWrites: allowDevWrites
  };
}
