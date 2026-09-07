/***********************************************************************
 * FILE: EnvLegacyRuntimeScanner.gs
 *
 * PURPOSE
 * - DEV/PROD-safe runtime scanner for legacy ENV configuration risks.
 * - Scans Script Properties, User Properties, Document Properties.
 * - Scans System_Config sheet for legacy ENV keys and notification mode risks.
 * - Does NOT mutate anything.
 *
 * LIMITATION
 * - Apps Script cannot reliably read all project source files from inside
 *   the same GAS project without Apps Script API / clasp export.
 * - For source-code grep, use local export or provide files.
 ***********************************************************************/

var ENV_LEGACY_RUNTIME_SCANNER_BUILD = '2026-05-14_ENV_LEGACY_RUNTIME_SCANNER_R1';

function RUN_ENV_LEGACY_RUNTIME_SCAN() {
  var out = {
    ok: true,
    build: ENV_LEGACY_RUNTIME_SCANNER_BUILD,
    generatedAt: new Date().toISOString(),
    canonicalRequired: {
      scriptProperty: 'AUDIT_RUNTIME_ENV',
      allowedValues: ['DEV', 'PROD']
    },
    envGuard: ENV_LEGACY_SCAN_envGuard_(),
    scriptProperties: ENV_LEGACY_SCAN_properties_('SCRIPT'),
    userProperties: ENV_LEGACY_SCAN_properties_('USER'),
    documentProperties: ENV_LEGACY_SCAN_properties_('DOCUMENT'),
    systemConfig: ENV_LEGACY_SCAN_systemConfig_(),
    findings: [],
    verdict: 'UNKNOWN'
  };

  ENV_LEGACY_SCAN_addFindings_(out);

  out.verdict = out.findings.some(function(f) { return f.severity === 'BLOCKER'; })
    ? 'BLOCKER'
    : (out.findings.some(function(f) { return f.severity === 'WARNING'; }) ? 'WARNING' : 'OK');

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_ENV_LEGACY_RUNTIME_SCAN_COMPACT() {
  var full = RUN_ENV_LEGACY_RUNTIME_SCAN();
  var compact = {
    ok: full.ok,
    build: full.build,
    envGuard: full.envGuard,
    verdict: full.verdict,
    findings: full.findings,
    scriptPropertyKeysFound: full.scriptProperties.keysFound,
    userPropertyKeysFound: full.userProperties.keysFound,
    documentPropertyKeysFound: full.documentProperties.keysFound,
    systemConfigLegacyRows: full.systemConfig.legacyRows,
    systemConfigNotificationRows: full.systemConfig.notificationRows
  };

  Logger.log(JSON.stringify(compact, null, 2));
  return compact;
}

function ENV_LEGACY_SCAN_envGuard_() {
  var out = {
    available: typeof EnvironmentGuard_getContext === 'function',
    context: null,
    error: ''
  };

  try {
    if (typeof EnvironmentGuard_getContext === 'function') {
      out.context = EnvironmentGuard_getContext();
    }
  } catch (e) {
    out.error = String(e && e.message ? e.message : e);
  }

  return out;
}

function ENV_LEGACY_SCAN_properties_(scope) {
  var props = null;
  if (scope === 'SCRIPT') props = PropertiesService.getScriptProperties();
  if (scope === 'USER') props = PropertiesService.getUserProperties();
  if (scope === 'DOCUMENT') props = PropertiesService.getDocumentProperties();

  var all = {};
  var keysFound = {};
  var riskyKeys = [
    'AUDIT_RUNTIME_ENV',
    'ACTIVE_ENV',
    'AUDIT_ACTIVE_ENV',
    'ENV',
    'RUNTIME_ENV',
    'DEV_NOTIFICATION_MODE',
    'NOTIFICATION_TEST_MODE',
    'TEST_MODE',
    'DEV_TEST_EMAIL',
    'TEST_RECIPIENT',
    'SEND_NOTIFICATIONS',
    'RESEND_API_KEY',
    'NOTIFICATION_RESEND_API_KEY'
  ];

  try {
    all = props.getProperties() || {};
  } catch (e) {
    return {
      scope: scope,
      ok: false,
      error: String(e && e.message ? e.message : e),
      keysFound: {}
    };
  }

  for (var i = 0; i < riskyKeys.length; i++) {
    var k = riskyKeys[i];
    if (Object.prototype.hasOwnProperty.call(all, k)) {
      keysFound[k] = ENV_LEGACY_SCAN_maskValue_(k, all[k]);
    }
  }

  return {
    scope: scope,
    ok: true,
    keysFound: keysFound
  };
}

function ENV_LEGACY_SCAN_systemConfig_() {
  var out = {
    ok: true,
    sheetFound: false,
    legacyRows: [],
    notificationRows: [],
    error: ''
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('System_Config');
    if (!sh) return out;

    out.sheetFound = true;
    var values = sh.getDataRange().getValues();
    if (!values || values.length < 2) return out;

    var legacyKeys = {
      'ACTIVE_ENV': true,
      'AUDIT_ACTIVE_ENV': true,
      'ENV': true,
      'RUNTIME_ENV': true
    };

    var notificationKeys = {
      'DEV_NOTIFICATION_MODE': true,
      'NOTIFICATION_TEST_MODE': true,
      'TEST_MODE': true,
      'DEV_TEST_EMAIL': true,
      'TEST_RECIPIENT': true,
      'SEND_NOTIFICATIONS': true
    };

    var headers = values[0].map(function(v) { return String(v || '').trim(); });

    for (var r = 1; r < values.length; r++) {
      var key = String(values[r][0] || '').trim();
      var keyUp = key.toUpperCase();
      if (!keyUp) continue;

      if (legacyKeys[keyUp]) {
        out.legacyRows.push({
          row: r + 1,
          key: key,
          values: ENV_LEGACY_SCAN_rowValues_(headers, values[r])
        });
      }

      if (notificationKeys[keyUp]) {
        out.notificationRows.push({
          row: r + 1,
          key: key,
          values: ENV_LEGACY_SCAN_rowValues_(headers, values[r])
        });
      }
    }
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }

  return out;
}

function ENV_LEGACY_SCAN_rowValues_(headers, row) {
  var out = {};
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c] || ('COL_' + (c + 1));
    if (c === 0) continue;
    var v = row[c];
    if (v === '' || v === null || typeof v === 'undefined') continue;
    out[h] = String(v);
  }
  return out;
}

function ENV_LEGACY_SCAN_addFindings_(out) {
  var sp = out.scriptProperties.keysFound || {};
  var up = out.userProperties.keysFound || {};
  var dp = out.documentProperties.keysFound || {};

  if (!sp.AUDIT_RUNTIME_ENV) {
    out.findings.push({
      severity: 'BLOCKER',
      code: 'MISSING_CANONICAL_SCRIPT_PROPERTY',
      message: 'Script Property AUDIT_RUNTIME_ENV is missing.'
    });
  }

  if (sp.AUDIT_RUNTIME_ENV && ['DEV', 'PROD'].indexOf(String(sp.AUDIT_RUNTIME_ENV).toUpperCase()) < 0) {
    out.findings.push({
      severity: 'BLOCKER',
      code: 'INVALID_CANONICAL_SCRIPT_PROPERTY',
      message: 'AUDIT_RUNTIME_ENV must be DEV or PROD.'
    });
  }

  ['ACTIVE_ENV', 'AUDIT_ACTIVE_ENV', 'ENV', 'RUNTIME_ENV'].forEach(function(k) {
    if (sp[k]) {
      out.findings.push({
        severity: 'WARNING',
        code: 'LEGACY_SCRIPT_PROPERTY_PRESENT',
        key: k,
        message: 'Legacy environment Script Property is present. It must not be used as runtime owner.'
      });
    }
    if (up[k]) {
      out.findings.push({
        severity: 'WARNING',
        code: 'LEGACY_USER_PROPERTY_PRESENT',
        key: k,
        message: 'Legacy environment User Property is present. UserProperties must not own runtime ENV.'
      });
    }
    if (dp[k]) {
      out.findings.push({
        severity: 'WARNING',
        code: 'LEGACY_DOCUMENT_PROPERTY_PRESENT',
        key: k,
        message: 'Legacy environment Document Property is present. DocumentProperties must not own runtime ENV.'
      });
    }
  });

  if (out.systemConfig.legacyRows && out.systemConfig.legacyRows.length) {
    out.findings.push({
      severity: 'WARNING',
      code: 'SYSTEM_CONFIG_LEGACY_ENV_ROWS_PRESENT',
      count: out.systemConfig.legacyRows.length,
      message: 'System_Config contains legacy ENV rows. Acceptable temporarily only if code no longer reads them.'
    });
  }

  if (out.envGuard.error) {
    out.findings.push({
      severity: 'BLOCKER',
      code: 'ENV_GUARD_ERROR',
      message: out.envGuard.error
    });
  }

  if (!out.envGuard.available) {
    out.findings.push({
      severity: 'BLOCKER',
      code: 'ENV_GUARD_MISSING',
      message: 'EnvironmentGuardService is missing or not globally available.'
    });
  }
}

function ENV_LEGACY_SCAN_maskValue_(key, value) {
  var k = String(key || '').toUpperCase();
  var v = String(value == null ? '' : value);

  if (k.indexOf('KEY') >= 0 || k.indexOf('TOKEN') >= 0 || k.indexOf('SECRET') >= 0) {
    if (!v) return '';
    return '[SET:' + v.length + ' chars]';
  }

  return v;
}
