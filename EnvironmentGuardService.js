/**
 * EnvironmentGuardService.gs
 * Build: 2026-05-14_ENV_HARDENING_R7
 *
 * Canonical runtime environment owner:
 *   Script Properties -> AUDIT_RUNTIME_ENV
 *
 * Allowed values:
 *   DEV
 *   PROD
 *
 * Hard rules:
 * - No URL parameter ownership.
 * - No spreadsheet-name ownership.
 * - No cache ownership.
 * - No user-property ownership.
 * - Missing or invalid environment fails loud.
 */

var ENVIRONMENT_GUARD_BUILD = '2026-05-14_ENV_HARDENING_R7';
var ENVIRONMENT_GUARD_PROPERTY_KEY = 'AUDIT_RUNTIME_ENV';
var ENVIRONMENT_GUARD_ALLOWED_ENVS = ['DEV', 'PROD'];

function EnvironmentGuard_getBuild() {
  return ENVIRONMENT_GUARD_BUILD;
}

function EnvironmentGuard_getRuntimeEnv() {
  var raw = PropertiesService.getScriptProperties().getProperty(ENVIRONMENT_GUARD_PROPERTY_KEY);
  var env = String(raw || '').trim().toUpperCase();

  if (!env) {
    throw new Error(
      'Missing Script Property ' + ENVIRONMENT_GUARD_PROPERTY_KEY +
      '. Set it explicitly to DEV or PROD in this GAS project.'
    );
  }

  if (ENVIRONMENT_GUARD_ALLOWED_ENVS.indexOf(env) === -1) {
    throw new Error(
      'Invalid Script Property ' + ENVIRONMENT_GUARD_PROPERTY_KEY +
      '="' + raw + '". Allowed values: DEV, PROD.'
    );
  }

  return env;
}

function EnvironmentGuard_getContext() {
  var env = EnvironmentGuard_getRuntimeEnv();

  return {
    ok: true,
    build: ENVIRONMENT_GUARD_BUILD,
    env: env,
    isDev: env === 'DEV',
    isProd: env === 'PROD',
    testLoginAllowed: env === 'DEV',
    source: 'ScriptProperties.' + ENVIRONMENT_GUARD_PROPERTY_KEY,
    generatedAt: new Date().toISOString()
  };
}

function EnvironmentGuard_isDev() {
  return EnvironmentGuard_getRuntimeEnv() === 'DEV';
}

function EnvironmentGuard_isProd() {
  return EnvironmentGuard_getRuntimeEnv() === 'PROD';
}

function EnvironmentGuard_assertDev(reason) {
  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isDev) {
    throw new Error(
      'DEV-only operation blocked. env=' + ctx.env +
      (reason ? ' reason=' + reason : '')
    );
  }

  return ctx;
}

function EnvironmentGuard_assertProd(reason) {
  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isProd) {
    throw new Error(
      'PROD-only operation blocked. env=' + ctx.env +
      (reason ? ' reason=' + reason : '')
    );
  }

  return ctx;
}

function EnvironmentGuard_assertTestLoginAllowed() {
  var ctx = EnvironmentGuard_getContext();

  if (!ctx.testLoginAllowed) {
    throw new Error('Test login blocked outside DEV. env=' + ctx.env);
  }

  return ctx;
}

function EnvironmentGuard_assertRealMailAllowed() {
  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isProd) {
    throw new Error('Real mail delivery blocked outside PROD. env=' + ctx.env);
  }

  return ctx;
}

function EnvironmentGuard_assertDestructiveActionAllowed(actionName) {
  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isProd) {
    throw new Error(
      'Destructive action blocked outside PROD. env=' + ctx.env +
      (actionName ? ' action=' + actionName : '')
    );
  }

  return ctx;
}

function EnvironmentGuard_publicSafeContext() {
  var ctx = EnvironmentGuard_getContext();

  return {
    ok: true,
    build: ctx.build,
    env: ctx.env,
    isDev: ctx.isDev,
    isProd: ctx.isProd,
    testLoginAllowed: ctx.testLoginAllowed,
    source: ctx.source
  };
}

function EnvironmentGuard_privateDiagContext_() {
  var ctx = EnvironmentGuard_getContext();

  if (ctx.isProd) {
    return {
      ok: true,
      build: ctx.build,
      env: ctx.env,
      isProd: true,
      diagnosticMode: 'PROD_SAFE_MINIMAL',
      source: ctx.source
    };
  }

  return {
    ok: true,
    build: ctx.build,
    env: ctx.env,
    isDev: ctx.isDev,
    isProd: ctx.isProd,
    testLoginAllowed: ctx.testLoginAllowed,
    diagnosticMode: 'DEV_VERBOSE',
    source: ctx.source,
    scriptIdAvailable: !!ScriptApp.getScriptId(),
    activeSpreadsheetIdAvailable: !!SpreadsheetApp.getActiveSpreadsheet(),
    generatedAt: ctx.generatedAt
  };
}

/**
 * Public diagnostics.
 */

function RUN_ENV_GUARD_SMOKE() {
  var result = EnvironmentGuard_privateDiagContext_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENV_GUARD_ASSERT_DEV() {
  var result = EnvironmentGuard_assertDev('RUN_ENV_GUARD_ASSERT_DEV');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENV_GUARD_ASSERT_PROD() {
  var result = EnvironmentGuard_assertProd('RUN_ENV_GUARD_ASSERT_PROD');
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENV_GUARD_TESTLOGIN_DIAG() {
  var result = {
    ok: true,
    build: ENVIRONMENT_GUARD_BUILD,
    env: EnvironmentGuard_getRuntimeEnv(),
    testLoginAllowed: EnvironmentGuard_getContext().testLoginAllowed,
    source: 'EnvironmentGuardService -> ScriptProperties'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
