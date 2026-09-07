/**
 * FILE: EnvironmentBanner.gs
 *
 * PURPOSE
 * - Safe UI environment banner helpers.
 * - UI environment display must follow EnvironmentGuardService runtime truth.
 *
 * GOVERNANCE
 * - Runtime environment owner: ScriptProperties.AUDIT_RUNTIME_ENV via EnvironmentGuardService.
 * - System_Config may still provide labels/version/display fields, but never owns runtime ENV.
 *
 * READ-ONLY
 * - No writes.
 * - No persistence mutation.
 *
 * Manual run functions:
 * - ENV_BANNER_PREVIEW
 * - ENV_BANNER_LOG
 * - RUN_ENV_BANNER_GUARD_SMOKE
 */

var ENV_BANNER_BUILD = '2026-05-14_ENV_BANNER_GUARD_INTEGRATION_R1';

function ENV_BANNER_PREVIEW() {
  return ENV_getBannerHtml_();
}

function ENV_BANNER_LOG() {
  var payload = ENV_getBannerPayload_();
  Logger.log(JSON.stringify(payload, null, 2));
  return payload;
}

function RUN_ENV_BANNER_GUARD_SMOKE() {
  var payload = ENV_getBannerPayload_();
  var html = ENV_getBannerHtml_();

  var out = {
    ok: !!(payload && payload.ok),
    build: ENV_BANNER_BUILD,
    payload: payload,
    htmlAvailable: !!html,
    source: payload ? payload.source : '',
    expectedRuntimeOwner: 'EnvironmentGuardService -> ScriptProperties.AUDIT_RUNTIME_ENV'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ENV_getBannerPayload_() {
  var guard = ENV_getGuardContext_();
  var legacyUi = ENV_getLegacyUiPayload_();

  if (!guard.ok) {
    return {
      ok: false,
      build: ENV_BANNER_BUILD,
      error: guard.error || 'EnvironmentGuardService unavailable.',
      env: '',
      banner: 'ENV UNKNOWN',
      appVersion: ENV_readLegacyField_(legacyUi, 'appVersion', ''),
      deployLabel: ENV_readLegacyField_(legacyUi, 'deployLabel', ''),
      buildSource: 'EnvironmentBanner',
      showBuildInfo: true,
      showDebug: false,
      notificationMode: ENV_readLegacyField_(legacyUi, 'notificationMode', ''),
      devWriteMode: ENV_readLegacyField_(legacyUi, 'devWriteMode', ''),
      allowDevWrites: false,
      source: 'EnvironmentBanner -> EnvironmentGuardService ERROR'
    };
  }

  var env = String(guard.env || '').trim().toUpperCase();
  var isDev = env === 'DEV';
  var isProd = env === 'PROD';

  return {
    ok: true,
    build: ENV_BANNER_BUILD,
    env: env,
    isDev: isDev,
    isProd: isProd,
    banner: ENV_resolveBannerLabel_(env, legacyUi),
    appVersion: ENV_readLegacyField_(legacyUi, 'appVersion', ''),
    deployLabel: ENV_readLegacyField_(legacyUi, 'deployLabel', ''),
    buildSource: ENV_readLegacyField_(legacyUi, 'buildSource', 'EnvironmentGuardService'),
    showBuildInfo: ENV_readLegacyBool_(legacyUi, 'showBuildInfo', true),
    showDebug: isDev ? ENV_readLegacyBool_(legacyUi, 'showDebug', true) : false,
    notificationMode: ENV_readLegacyField_(legacyUi, 'notificationMode', ''),
    devWriteMode: ENV_readLegacyField_(legacyUi, 'devWriteMode', ''),
    allowDevWrites: isDev ? ENV_readLegacyBool_(legacyUi, 'allowDevWrites', false) : false,
    testLoginAllowed: !!guard.testLoginAllowed,
    runtimeSource: guard.source || 'ScriptProperties.AUDIT_RUNTIME_ENV',
    source: 'EnvironmentBanner -> EnvironmentGuardService'
  };
}

function ENV_getGuardContext_() {
  try {
    if (typeof EnvironmentGuard_getContext !== 'function') {
      return {
        ok: false,
        error: 'EnvironmentGuard_getContext missing. Add EnvironmentGuardService.gs.'
      };
    }

    var ctx = EnvironmentGuard_getContext() || {};
    var env = String(ctx.env || '').trim().toUpperCase();

    if (env !== 'DEV' && env !== 'PROD') {
      return {
        ok: false,
        error: 'Invalid env from EnvironmentGuardService: ' + env
      };
    }

    return {
      ok: true,
      env: env,
      isDev: !!ctx.isDev,
      isProd: !!ctx.isProd,
      testLoginAllowed: !!ctx.testLoginAllowed,
      source: ctx.source || ''
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.message ? e.message : e)
    };
  }
}

function ENV_getLegacyUiPayload_() {
  try {
    if (typeof SYS_getUiEnvironmentPayload_ === 'function') {
      return SYS_getUiEnvironmentPayload_() || {};
    }
  } catch (e) {}

  return {};
}

function ENV_resolveBannerLabel_(env, legacyUi) {
  var legacyBanner = ENV_readLegacyField_(legacyUi, 'banner', '');
  if (legacyBanner) return legacyBanner;

  if (env === 'DEV') return 'DEV ENVIRONMENT';
  if (env === 'PROD') return 'PRODUCTION';
  return 'ENV UNKNOWN';
}

function ENV_getBannerText_() {
  var p = ENV_getBannerPayload_();

  if (!p.ok) {
    return 'ENV UNKNOWN';
  }

  return [
    p.banner,
    p.appVersion,
    p.deployLabel
  ].filter(Boolean).join(' · ');
}

function ENV_getBannerHtml_() {
  var p = ENV_getBannerPayload_();

  if (!p.ok) {
    return '<div style="padding:6px;background:#b71c1c;color:#fff;font-weight:bold;">ENV UNKNOWN</div>';
  }

  var isDev = String(p.env || '').toUpperCase() === 'DEV';
  var bg = isDev ? '#b71c1c' : '#1b5e20';
  var text = ENV_escapeHtml_(ENV_getBannerText_());

  var extra = '';

  if (p.notificationMode) {
    extra += 'Notifications: ' + ENV_escapeHtml_(p.notificationMode);
  }

  if (p.devWriteMode) {
    if (extra) extra += ' | ';
    extra += 'Writes: ' + ENV_escapeHtml_(p.devWriteMode);
  }

  if (p.runtimeSource) {
    if (extra) extra += ' | ';
    extra += 'Runtime: ' + ENV_escapeHtml_(p.env);
  }

  return ''
    + '<div style="'
    + 'padding:8px 12px;'
    + 'background:' + bg + ';'
    + 'color:#ffffff;'
    + 'font-size:12px;'
    + 'font-weight:bold;'
    + 'border-radius:4px;'
    + 'margin-bottom:8px;'
    + 'font-family:Arial,sans-serif;'
    + '">'
    + '<div>' + text + '</div>'
    + (extra
      ? '<div style="font-size:11px;font-weight:normal;opacity:0.9;margin-top:2px;">' + extra + '</div>'
      : '')
    + '</div>';
}

function ENV_readLegacyField_(payload, key, fallback) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) {
    return fallback;
  }

  var v = payload[key];
  if (v === null || typeof v === 'undefined') return fallback;
  return String(v || '').trim();
}

function ENV_readLegacyBool_(payload, key, fallback) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) {
    return !!fallback;
  }

  var v = payload[key];

  if (v === true) return true;
  if (v === false) return false;

  var s = String(v == null ? '' : v).trim().toUpperCase();
  if (s === 'TRUE' || s === 'YES' || s === '1' || s === 'Y') return true;
  if (s === 'FALSE' || s === 'NO' || s === '0' || s === 'N') return false;

  return !!fallback;
}

function ENV_escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
