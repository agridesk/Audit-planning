/**
 * DiagnosticsEnvironmentAddon.gs
 * Safe diagnostics addon for environment/build/runtime visibility.
 *
 * Manual run functions:
 * - DIAG_ENVIRONMENT_SNAPSHOT
 * - DIAG_ENVIRONMENT_LOG
 *
 * This file does not modify existing diagnostics logic.
 * It only reads System_Config through SystemConfig.gs helpers when available.
 */

function DIAG_ENVIRONMENT_SNAPSHOT() {
  return DIAG_getEnvironmentSnapshot_();
}

function DIAG_ENVIRONMENT_LOG() {
  var snapshot = DIAG_getEnvironmentSnapshot_();
  Logger.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function DIAG_getEnvironmentSnapshot_() {
  var now = new Date();

  var result = {
    ok: true,
    generatedAt: now.toISOString(),
    section: 'Environment',
    systemConfigAvailable: DIAG_isFunctionAvailable_('SYS_getConfig_'),
    buildInfoAvailable: DIAG_isFunctionAvailable_('SYS_getBuildInfo_'),
    notificationModeAvailable: DIAG_isFunctionAvailable_('SYS_getNotificationMode_'),
    uiPayloadAvailable: DIAG_isFunctionAvailable_('SYS_getUiEnvironmentPayload_'),
    values: {},
    warnings: []
  };

  if (!result.systemConfigAvailable) {
    result.ok = false;
    result.warnings.push('SystemConfig.gs is not loaded or SYS_getConfig_ is unavailable.');
    return result;
  }

  try {
    var cfg = SYS_getConfig_();
    var buildInfo = DIAG_isFunctionAvailable_('SYS_getBuildInfo_')
      ? SYS_getBuildInfo_()
      : {};

    var notificationMode = DIAG_isFunctionAvailable_('SYS_getNotificationMode_')
      ? SYS_getNotificationMode_()
      : '';

    var uiPayload = DIAG_isFunctionAvailable_('SYS_getUiEnvironmentPayload_')
      ? SYS_getUiEnvironmentPayload_()
      : {};

    result.values = {
      env: String(cfg.ENV || ''),
      appVersion: String(cfg.APP_VERSION || ''),
      deployLabel: String(cfg.DEPLOY_LABEL || ''),
      buildSource: String(cfg.BUILD_SOURCE || ''),
      showBuildInfo: String(cfg.SHOW_BUILD_INFO || ''),
      showDebug: String(cfg.SHOW_DEBUG || ''),
      allowDevWrites: String(cfg.ALLOW_DEV_WRITES || ''),
      devWriteMode: String(cfg.DEV_WRITE_MODE || ''),
      devNotificationMode: String(cfg.DEV_NOTIFICATION_MODE || ''),
      sendNotifications: String(cfg.SEND_NOTIFICATIONS || ''),
      devTestEmail: String(cfg.DEV_TEST_EMAIL || ''),
      devAllowedAuditPrefix: String(cfg.DEV_ALLOWED_AUDIT_PREFIX || ''),
      banner: String(buildInfo.banner || uiPayload.banner || ''),
      resolvedNotificationMode: String(notificationMode || '')
    };

    DIAG_addEnvironmentWarnings_(result);

    result.ok = result.warnings.length === 0;

    return result;

  } catch (err) {
    result.ok = false;
    result.error = String(err && err.message ? err.message : err);
    result.warnings.push('Environment diagnostics failed.');
    return result;
  }
}

function DIAG_addEnvironmentWarnings_(result) {
  var v = result.values || {};

  var env = String(v.env || '').toUpperCase();
  var allowDevWrites = String(v.allowDevWrites || '').toUpperCase();
  var sendNotifications = String(v.sendNotifications || '').toUpperCase();
  var devMode = String(v.devWriteMode || '').toUpperCase();
  var notificationMode = String(v.resolvedNotificationMode || '').toUpperCase();

  if (env !== 'DEV' && env !== 'PROD') {
    result.warnings.push('ENV should be DEV or PROD.');
  }

  if (env === 'DEV') {
    if (allowDevWrites === 'TRUE') {
      result.warnings.push('DEV writes are enabled.');
    }

    if (sendNotifications === 'TRUE') {
      result.warnings.push('SEND_NOTIFICATIONS is TRUE in DEV.');
    }

    if (notificationMode === 'PROD_SEND') {
      result.warnings.push('Notification mode resolves to PROD_SEND in DEV.');
    }

    if (devMode !== 'BLOCK' && devMode !== 'TEST_PREFIX_ONLY' && devMode !== 'ALLOW') {
      result.warnings.push('DEV_WRITE_MODE should be BLOCK, TEST_PREFIX_ONLY or ALLOW.');
    }
  }

  if (env === 'PROD') {
    if (String(v.deployLabel || '').indexOf('DEV') >= 0) {
      result.warnings.push('PROD environment has a DEV-looking deploy label.');
    }

    if (String(v.appVersion || '').indexOf('DEV') >= 0) {
      result.warnings.push('PROD environment has a DEV-looking app version.');
    }
  }
}

function DIAG_formatEnvironmentSnapshotText_() {
  var s = DIAG_getEnvironmentSnapshot_();
  var v = s.values || {};
  var lines = [];

  lines.push((s.ok ? '✅' : '⚠') + ' Environment');
  lines.push('ENV: ' + (v.env || ''));
  lines.push('Version: ' + (v.appVersion || ''));
  lines.push('Deploy: ' + (v.deployLabel || ''));
  lines.push('Build source: ' + (v.buildSource || ''));
  lines.push('Banner: ' + (v.banner || ''));
  lines.push('Notifications: ' + (v.resolvedNotificationMode || ''));
  lines.push('DEV write mode: ' + (v.devWriteMode || ''));
  lines.push('ALLOW_DEV_WRITES: ' + (v.allowDevWrites || ''));

  if (s.warnings && s.warnings.length) {
    lines.push('Warnings:');
    s.warnings.forEach(function (w) {
      lines.push('- ' + w);
    });
  }

  if (s.error) {
    lines.push('Error: ' + s.error);
  }

  return lines.join('\n');
}

function DIAG_isFunctionAvailable_(name) {
  try {
    return typeof this[name] === 'function';
  } catch (err) {
    return false;
  }
}
