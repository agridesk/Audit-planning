// FILE: SystemConfig.gs
// BUILD: 2026-05-11_SYSTEM_CONFIG_DEPLOYMENT_ENV_TRIGGERS
//
// PURPOSE:
//   Runtime configuration owner for DEV/PROD governance.
//   Supports both legacy KEY | VALUE and new KEY | DEV | PROD.
//   Active environment is determined in this order:
//   1) request env set by EntryV5 for webapp UI calls (?env=DEV / ?env=PROD)
//   2) deployment/script env from ScriptProperties for triggers/background jobs
//   3) DEV fallback for safety
//
//   IMPORTANT: time-based triggers do not have URL/request context.
//   Therefore weekly mails must use ScriptProperties ACTIVE_ENV/AUDIT_ACTIVE_ENV/ENV.
//
// RECOMMENDED SHEET:
//   System_Config
//   KEY | DEV | PROD | DESCRIPTION
//
// IMPORTANT:
//   This is a FULL replacement file.

var SYS_CONFIG_BUILD = '2026-05-11_SYSTEM_CONFIG_DEPLOYMENT_ENV_TRIGGERS';
var SYS_CONFIG_SHEET_NAME = 'System_Config';
var SYS_REQUEST_ENV_CACHE_ = '';

function SYS_setRequestEnv_(env) {
  env = SYS_normalizeEnv_(env);
  SYS_REQUEST_ENV_CACHE_ = env;
  try {
    PropertiesService.getUserProperties().setProperty('AUDIT_RUNTIME_ENV', env);
  } catch (e) {}
  return env;
}

function SYS_getRequestEnv_() {
  // Request env is in-memory only. Do NOT read UserProperties here.
  // Time-based triggers run without URL/request context and must not inherit
  // a stale browser/user env such as DEV from an earlier UI session.
  return SYS_normalizeEnv_(SYS_REQUEST_ENV_CACHE_);
}

function SYS_getDeploymentEnv_() {
  var candidates = [];

  try {
    var props = PropertiesService.getScriptProperties();
    candidates.push(props.getProperty('ACTIVE_ENV'));
    candidates.push(props.getProperty('AUDIT_ACTIVE_ENV'));
    candidates.push(props.getProperty('ENV'));
    candidates.push(props.getProperty('AUDIT_RUNTIME_ENV'));
  } catch (e) {}

  for (var i = 0; i < candidates.length; i++) {
    var env = SYS_normalizeEnv_(candidates[i]);
    if (env) return env;
  }

  return '';
}

function SYS_setDeploymentEnv_(env) {
  env = SYS_normalizeEnv_(env);
  if (!env) throw new Error('SYS_setDeploymentEnv_: env must be DEV or PROD');
  PropertiesService.getScriptProperties().setProperty('ACTIVE_ENV', env);
  PropertiesService.getScriptProperties().setProperty('AUDIT_ACTIVE_ENV', env);
  return env;
}

function SYS_normalizeEnv_(raw) {
  var env = String(raw || '').trim().toUpperCase();
  if (env === 'PROD') return 'PROD';
  if (env === 'DEV') return 'DEV';
  return '';
}

function SYS_getActiveDeploymentEnv_() {
  // Webapp calls: request env wins. Trigger/background calls: script env wins.
  return SYS_getRequestEnv_() || SYS_getDeploymentEnv_() || 'DEV';
}

function SYS_getEnv_() {
  return SYS_getActiveDeploymentEnv_();
}

function SYS_getActiveEnv_() {
  return SYS_getEnv_();
}

function SYS_getActiveEnv() {
  return SYS_getEnv_();
}

function SYS_getRuntimeEnv_() {
  return SYS_getEnv_();
}

function SYS_resolveRuntimeEnv_(fallback) {
  var env = SYS_getEnv_();
  var fb = SYS_normalizeEnv_(fallback);
  if (fb && fb !== env) {
    throw new Error('SYS_ENV_FALLBACK_CONFLICT: fallback=' + fb + ', runtime=' + env);
  }
  return env;
}

function SystemConfig_GetActiveEnv() {
  return SYS_getEnv_();
}

function SYS_getConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SYS_CONFIG_SHEET_NAME);

  if (!sh) {
    sh = ss.insertSheet(SYS_CONFIG_SHEET_NAME);
    sh.getRange(1, 1, 1, 4).setValues([['KEY', 'DEV', 'PROD', 'DESCRIPTION']]);
    SYS_writeDefaultConfigRows_(sh);
  }

  return sh;
}

function SYS_getConfig_() {
  return SYS_getConfigForEnv_(SYS_getEnv_());
}

function SYS_getConfigForEnv_(env) {
  env = SYS_normalizeEnv_(env) || 'DEV';

  var sh = SYS_getConfigSheet_();
  var values = sh.getDataRange().getValues();

  if (!values || values.length < 1) {
    return SYS_defaultConfigObject_(env);
  }

  var headers = (values[0] || []).map(function(h) {
    return String(h || '').trim().toUpperCase();
  });

  var keyCol = SYS_findHeader_(headers, ['KEY', 'NAME', 'SETTING']);
  var valueCol = SYS_findHeader_(headers, ['VALUE']);
  var devCol = SYS_findHeader_(headers, ['DEV']);
  var prodCol = SYS_findHeader_(headers, ['PROD']);

  if (keyCol < 0) keyCol = 0;

  var selectedCol = -1;
  if (env === 'DEV' && devCol >= 0) selectedCol = devCol;
  if (env === 'PROD' && prodCol >= 0) selectedCol = prodCol;
  if (selectedCol < 0 && valueCol >= 0) selectedCol = valueCol;
  if (selectedCol < 0) selectedCol = 1;

  var cfg = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][keyCol] || '').trim();
    if (!key) continue;
    cfg[key] = values[r][selectedCol];
  }

  cfg.ENV = env;
  cfg.__ACTIVE_ENV = env;
  cfg.__CONFIG_LAYOUT = (devCol >= 0 && prodCol >= 0) ? 'KEY_DEV_PROD' : 'KEY_VALUE';
  cfg.__BUILD = SYS_CONFIG_BUILD;

  return SYS_applyConfigDefaults_(cfg, env);
}

function SYS_getUiEnvironmentPayload_() {
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();

  return {
    ok: true,
    build: SYS_CONFIG_BUILD,
    env: env,
    appVersion: String(cfg.APP_VERSION || ''),
    deployLabel: String(cfg.DEPLOY_LABEL || ''),
    buildSource: String(cfg.BUILD_SOURCE || env),
    showBuildInfo: SYS_bool_(cfg.SHOW_BUILD_INFO),
    showDebug: SYS_bool_(cfg.SHOW_DEBUG),
    banner: String(cfg.DEV_BANNER || cfg.BANNER || (env === 'DEV' ? 'DEV ENVIRONMENT' : '')),
    notificationMode: SYS_getResolvedNotificationMode_(),
    devWriteMode: String(cfg.DEV_WRITE_MODE || ''),
    allowDevWrites: SYS_bool_(cfg.ALLOW_DEV_WRITES),
    configLayout: String(cfg.__CONFIG_LAYOUT || ''),
    runtimeEnvSource: (SYS_getRequestEnv_() ? 'REQUEST_ENV' : (SYS_getDeploymentEnv_() ? 'SCRIPT_PROPERTIES' : 'DEV_FALLBACK'))
  };
}

function SYS_getResolvedNotificationMode_() {
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();

  if (env === 'DEV') {
    var mode = String(cfg.DEV_NOTIFICATION_MODE || 'DRY_RUN').trim().toUpperCase();
    if (mode === 'OFF' || mode === 'DRY_RUN' || mode === 'TEST_TO_SELF') return mode;
    return 'DRY_RUN';
  }

  if (SYS_bool_(cfg.SEND_NOTIFICATIONS)) return 'LIVE';
  return 'OFF';
}

function SYS_resolveNotificationDelivery_(originalRecipient) {
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();
  var recipient = String(originalRecipient || '').trim();

  if (env === 'DEV') {
    var mode = SYS_getResolvedNotificationMode_();

    if (mode === 'OFF') {
      return SYS_deliveryResult_('OFF', false, recipient, recipient, false);
    }

    if (mode === 'DRY_RUN') {
      return SYS_deliveryResult_('DRY_RUN', false, recipient, recipient, false);
    }

    if (mode === 'TEST_TO_SELF') {
      var testEmail = String(cfg.DEV_TEST_EMAIL || '').trim();
      return SYS_deliveryResult_('TEST_TO_SELF', !!testEmail, testEmail, recipient, true);
    }
  }

  if (env === 'PROD') {
    if (SYS_bool_(cfg.SEND_NOTIFICATIONS)) {
      return SYS_deliveryResult_('LIVE', !!recipient, recipient, recipient, false);
    }
    return SYS_deliveryResult_('OFF', false, recipient, recipient, false);
  }

  return SYS_deliveryResult_('OFF', false, recipient, recipient, false);
}

function SYS_resolveNotificationRecipients_(originalRecipients) {
  var list = [];

  if (Array.isArray(originalRecipients)) {
    list = originalRecipients.map(function(x) { return String(x || '').trim(); }).filter(Boolean);
  } else {
    list = String(originalRecipients || '').split(',').map(function(x) { return String(x || '').trim(); }).filter(Boolean);
  }

  var originalJoined = list.join(',');
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();

  if (env === 'DEV') {
    var mode = SYS_getResolvedNotificationMode_();

    if (mode === 'OFF') {
      return SYS_deliveryResult_('OFF', false, '', originalJoined, false);
    }

    if (mode === 'DRY_RUN') {
      return SYS_deliveryResult_('DRY_RUN', false, '', originalJoined, false);
    }

    if (mode === 'TEST_TO_SELF') {
      var testEmail = String(cfg.DEV_TEST_EMAIL || '').trim();
      return SYS_deliveryResult_('TEST_TO_SELF', !!testEmail, testEmail, originalJoined, true);
    }
  }

  if (env === 'PROD') {
    if (SYS_bool_(cfg.SEND_NOTIFICATIONS)) {
      return SYS_deliveryResult_('LIVE', list.length > 0, originalJoined, originalJoined, false);
    }
    return SYS_deliveryResult_('OFF', false, '', originalJoined, false);
  }

  return SYS_deliveryResult_('OFF', false, '', originalJoined, false);
}


function SYS_deliveryResult_(mode, send, recipient, originalRecipient, overridden) {
  recipient = String(recipient || '').trim();
  originalRecipient = String(originalRecipient || '').trim();

  var recipients = recipient
    ? recipient.split(',').map(function(x) { return String(x || '').trim(); }).filter(Boolean)
    : [];
  var originalRecipients = originalRecipient
    ? originalRecipient.split(',').map(function(x) { return String(x || '').trim(); }).filter(Boolean)
    : [];

  return {
    mode: String(mode || '').trim(),
    send: !!send && recipients.length > 0,
    recipient: recipients.join(','),
    recipients: recipients,
    originalRecipients: originalRecipients,
    overridden: !!overridden,
    source: 'SystemConfig',
    env: SYS_getEnv_(),
    requestEnv: SYS_getRequestEnv_(),
    deploymentEnv: SYS_getDeploymentEnv_()
  };
}

function SYS_assertWriteAllowed_(actionName, auditId) {
  if (typeof SYS_ENFORCE_WRITE_ALLOWED === 'function') {
    return SYS_ENFORCE_WRITE_ALLOWED(actionName, auditId);
  }

  var res = SYS_legacyWriteDecision_(actionName, auditId);
  if (!res.allowed) throw new Error(res.message);
  return res;
}

function SYS_legacyWriteDecision_(actionName, auditId) {
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();
  var action = String(actionName || 'WRITE').trim().toUpperCase();
  var id = String(auditId || '').trim();

  if (env === 'PROD') {
    return { allowed: true, env: env, action: action, auditId: id, mode: 'PROD' };
  }

  if (env !== 'DEV') {
    return {
      allowed: false,
      env: env,
      action: action,
      auditId: id,
      mode: 'UNKNOWN',
      message: 'Write blocked: ENV must be DEV or PROD.'
    };
  }

  var allow = SYS_bool_(cfg.ALLOW_DEV_WRITES);
  var mode = String(cfg.DEV_WRITE_MODE || 'BLOCK').trim().toUpperCase();
  var prefix = String(cfg.DEV_ALLOWED_AUDIT_PREFIX || 'TEST_').trim();

  if (!allow) {
    return {
      allowed: false,
      env: env,
      action: action,
      auditId: id,
      mode: mode,
      message: 'DEV write blocked: ALLOW_DEV_WRITES is not TRUE.'
    };
  }

  if (mode === 'TEST_PREFIX_ONLY') {
    if (id.indexOf(prefix) !== 0) {
      return {
        allowed: false,
        env: env,
        action: action,
        auditId: id,
        mode: mode,
        message: 'DEV write blocked: auditId must start with ' + prefix + '.'
      };
    }
    return { allowed: true, env: env, action: action, auditId: id, mode: mode };
  }

  if (mode === 'ALLOW') {
    return { allowed: true, env: env, action: action, auditId: id, mode: mode };
  }

  return {
    allowed: false,
    env: env,
    action: action,
    auditId: id,
    mode: mode,
    message: 'DEV write blocked: DEV_WRITE_MODE = ' + mode + '.'
  };
}

function SYS_RELEASE_PRECHECK() {
  var cfg = SYS_getConfig_();
  var env = SYS_getEnv_();
  var checks = [];
  var errors = [];
  var warnings = [];

  function add_(key, ok, severity, message) {
    var item = { key: key, ok: !!ok, severity: severity || 'ERROR', message: message || '' };
    checks.push(item);
    if (!ok && item.severity === 'ERROR') errors.push(item);
    if (!ok && item.severity === 'WARN') warnings.push(item);
  }

  add_('ENV_VALID', env === 'DEV' || env === 'PROD', 'ERROR', 'Runtime env must be DEV or PROD.');
  add_('CONFIG_LAYOUT', String(cfg.__CONFIG_LAYOUT || '') === 'KEY_DEV_PROD', 'WARN', 'System_Config should use KEY | DEV | PROD layout.');
  add_('APP_VERSION_SET', !!String(cfg.APP_VERSION || '').trim(), 'ERROR', 'APP_VERSION must be set.');
  add_('DEPLOY_LABEL_SET', !!String(cfg.DEPLOY_LABEL || '').trim(), 'ERROR', 'DEPLOY_LABEL must be set.');

  if (env === 'DEV') {
    add_('DEV_SEND_NOTIFICATIONS_FALSE', !SYS_bool_(cfg.SEND_NOTIFICATIONS), 'ERROR', 'SEND_NOTIFICATIONS must not be TRUE in DEV.');
    add_('DEV_NOTIFICATION_SAFE', ['OFF', 'DRY_RUN', 'TEST_TO_SELF'].indexOf(SYS_getResolvedNotificationMode_()) >= 0, 'ERROR', 'DEV notification mode must be safe.');
    add_('DEV_WRITE_MODE_SAFE', ['BLOCK', 'TEST_PREFIX_ONLY', 'ALLOW'].indexOf(String(cfg.DEV_WRITE_MODE || '').trim().toUpperCase()) >= 0, 'ERROR', 'DEV_WRITE_MODE must be valid.');
    add_('DEV_PREFIX_SET', !!String(cfg.DEV_ALLOWED_AUDIT_PREFIX || '').trim(), 'WARN', 'DEV_ALLOWED_AUDIT_PREFIX should be set.');
  }

  if (env === 'PROD') {
    add_('PROD_SEND_NOTIFICATIONS_EXPLICIT', String(cfg.SEND_NOTIFICATIONS || '').trim() !== '', 'WARN', 'SEND_NOTIFICATIONS should be explicitly set in PROD.');
  }

  return {
    ok: errors.length === 0,
    env: env,
    generatedAt: new Date().toISOString(),
    buildInfo: SYS_getUiEnvironmentPayload_(),
    notificationMode: SYS_getResolvedNotificationMode_(),
    checks: checks,
    errors: errors,
    warnings: warnings,
    recommendation: errors.length ? 'Do not deploy.' : 'Deploy precheck passed.'
  };
}

function SYS_RELEASE_PRECHECK_LOG() {
  var out = SYS_RELEASE_PRECHECK();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function SYS_ADMIN_createOrRepairSystemConfig() {
  var sh = SYS_getConfigSheet_();
  var values = sh.getDataRange().getValues();

  if (!values || !values.length || String(values[0][0] || '').trim().toUpperCase() !== 'KEY') {
    sh.clear();
    sh.getRange(1, 1, 1, 4).setValues([['KEY', 'DEV', 'PROD', 'DESCRIPTION']]);
    SYS_writeDefaultConfigRows_(sh);
    return { ok: true, repaired: true, layout: 'KEY_DEV_PROD', build: SYS_CONFIG_BUILD };
  }

  var headers = values[0].map(function(h) { return String(h || '').trim().toUpperCase(); });
  var hasDev = headers.indexOf('DEV') >= 0;
  var hasProd = headers.indexOf('PROD') >= 0;

  if (!hasDev || !hasProd) {
    SYS_migrateSystemConfigToEnvColumns_(sh);
  }

  SYS_ensureDefaultConfigKeys_(sh);

  return {
    ok: true,
    repaired: true,
    layout: 'KEY_DEV_PROD',
    build: SYS_CONFIG_BUILD,
    activeEnv: SYS_getEnv_()
  };
}

function SYS_ADMIN_createOrRepairSystemConfig_LOG() {
  var out = SYS_ADMIN_createOrRepairSystemConfig();
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function SYS_migrateSystemConfigToEnvColumns_(sh) {
  var values = sh.getDataRange().getValues();
  var oldMap = {};

  if (values && values.length) {
    var headers = values[0].map(function(h) { return String(h || '').trim().toUpperCase(); });
    var keyCol = SYS_findHeader_(headers, ['KEY', 'NAME', 'SETTING']);
    var valueCol = SYS_findHeader_(headers, ['VALUE']);
    if (keyCol < 0) keyCol = 0;
    if (valueCol < 0) valueCol = 1;

    for (var r = 1; r < values.length; r++) {
      var key = String(values[r][keyCol] || '').trim();
      if (!key) continue;
      oldMap[key] = values[r][valueCol];
    }
  }

  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['KEY', 'DEV', 'PROD', 'DESCRIPTION']]);

  var defaults = SYS_defaultConfigRows_();
  var rows = [];
  for (var i = 0; i < defaults.length; i++) {
    var d = defaults[i];
    var key = d[0];
    var legacy = oldMap.hasOwnProperty(key) ? oldMap[key] : '';
    rows.push([
      key,
      legacy !== '' ? legacy : d[1],
      d[2],
      d[3]
    ]);
  }

  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.autoResizeColumns(1, 4);
}

function SYS_writeDefaultConfigRows_(sh) {
  var rows = SYS_defaultConfigRows_();
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.autoResizeColumns(1, 4);
}

function SYS_ensureDefaultConfigKeys_(sh) {
  var values = sh.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0] || '').trim();
    if (key) existing[key] = true;
  }

  var append = [];
  var defaults = SYS_defaultConfigRows_();
  for (var i = 0; i < defaults.length; i++) {
    if (!existing[defaults[i][0]]) append.push(defaults[i]);
  }

  if (append.length) {
    sh.getRange(sh.getLastRow() + 1, 1, append.length, 4).setValues(append);
  }
}

function SYS_defaultConfigRows_() {
  return [
    ['ENV', 'DEV', 'PROD', 'Resolved environment. Usually mirrors URL env.'],
    ['APP_VERSION', '2026-04-29_DEV_001', '2026-04-29_PROD_001', 'Human readable version.'],
    ['DEPLOY_LABEL', 'DEV-2026-04-29-001', 'PROD-2026-04-29-001', 'Exact deployment label.'],
    ['BUILD_SOURCE', 'DEV', 'PROD', 'Build source label.'],
    ['SHOW_BUILD_INFO', 'TRUE', 'FALSE', 'Show build info in UI.'],
    ['SHOW_DEBUG', 'TRUE', 'FALSE', 'Show debug/diagnostic UI details.'],
    ['ALLOW_DEV_WRITES', 'TRUE', 'FALSE', 'Whether DEV may write. Ignored in PROD.'],
    ['DEV_WRITE_MODE', 'TEST_PREFIX_ONLY', 'BLOCK', 'DEV write mode.'],
    ['DEV_ALLOWED_AUDIT_PREFIX', 'TEST_', 'TEST_', 'Allowed test audit prefix.'],
    ['DEV_NOTIFICATION_MODE', 'TEST_TO_SELF', 'OFF', 'DEV notification mode.'],
    ['DEV_TEST_EMAIL', 'romboutsrwj@gmail.com', '', 'Email receiving DEV test mails.'],
    ['SEND_NOTIFICATIONS', 'FALSE', 'TRUE', 'Whether PROD sends live mails.'],
    ['DEV_BANNER', 'DEV ENVIRONMENT', '', 'Banner text for DEV.'],
    ['DEFAULT_FROM_EMAIL', 'planning@agriqa.es', 'planning@agriqa.es', 'Notification sender email label.'],
    ['DEFAULT_FROM_NAME', 'Agri Quality Assurance – Audit Planning', 'Agri Quality Assurance – Audit Planning', 'Notification sender name label.']
  ];
}

function SYS_defaultConfigObject_(env) {
  env = SYS_normalizeEnv_(env) || 'DEV';
  var rows = SYS_defaultConfigRows_();
  var cfg = {};
  var col = env === 'PROD' ? 2 : 1;
  for (var i = 0; i < rows.length; i++) cfg[rows[i][0]] = rows[i][col];
  cfg.ENV = env;
  cfg.__ACTIVE_ENV = env;
  cfg.__CONFIG_LAYOUT = 'DEFAULTS';
  cfg.__BUILD = SYS_CONFIG_BUILD;
  return cfg;
}

function SYS_applyConfigDefaults_(cfg, env) {
  var d = SYS_defaultConfigObject_(env);
  for (var k in d) {
    if (!d.hasOwnProperty(k)) continue;
    if (cfg[k] === undefined || cfg[k] === null || cfg[k] === '') cfg[k] = d[k];
  }
  cfg.ENV = env;
  cfg.__ACTIVE_ENV = env;
  cfg.__BUILD = SYS_CONFIG_BUILD;
  return cfg;
}

function SYS_findHeader_(headers, names) {
  headers = headers || [];
  names = names || [];
  for (var i = 0; i < names.length; i++) {
    var target = String(names[i] || '').trim().toUpperCase();
    var ix = headers.indexOf(target);
    if (ix >= 0) return ix;
  }
  return -1;
}

function SYS_bool_(v) {
  var s = String(v || '').trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y';
}

function RUN_SYSTEM_CONFIG_ENV_COLUMNS_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: SYS_CONFIG_BUILD,
    activeEnv: SYS_getEnv_(),
    requestEnv: SYS_getRequestEnv_(),
    deploymentEnv: SYS_getDeploymentEnv_(),
    config: SYS_getConfig_(),
    uiPayload: SYS_getUiEnvironmentPayload_(),
    notificationDeliverySample: SYS_resolveNotificationDelivery_('real.recipient@example.com'),
    releasePrecheck: SYS_RELEASE_PRECHECK()
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function RUN_SYSTEM_CONFIG_SET_ENV_DEV() {
  return SYS_setRequestEnv_('DEV');
}

function RUN_SYSTEM_CONFIG_SET_ENV_PROD() {
  return SYS_setRequestEnv_('PROD');
}

function RUN_SYSTEM_CONFIG_SET_DEPLOYMENT_ENV_DEV() {
  return SYS_setDeploymentEnv_('DEV');
}

function RUN_SYSTEM_CONFIG_SET_DEPLOYMENT_ENV_PROD() {
  return SYS_setDeploymentEnv_('PROD');
}

function RUN_SYSTEM_CONFIG_TRIGGER_ENV_DIAGNOSTICS() {
  var out = {
    ok: true,
    build: SYS_CONFIG_BUILD,
    activeEnv: SYS_getEnv_(),
    requestEnv: SYS_getRequestEnv_(),
    deploymentEnv: SYS_getDeploymentEnv_(),
    notificationMode: SYS_getResolvedNotificationMode_(),
    deliverySample: SYS_resolveNotificationRecipients_(['real.recipient@example.com']),
    note: 'For time-based triggers requestEnv should normally be empty and deploymentEnv must be DEV or PROD.'
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
