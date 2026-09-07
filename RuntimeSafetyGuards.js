/**
 * RuntimeSafetyGuards.gs
 * Build: 2026-05-14_RUNTIME_SAFETY_GUARDS_R1
 *
 * Central safety assertions for environment-sensitive operations.
 *
 * This file does not own environment.
 * It delegates to EnvironmentGuardService only.
 */

var RUNTIME_SAFETY_GUARDS_BUILD = '2026-05-14_RUNTIME_SAFETY_GUARDS_R1';

function RuntimeSafetyGuards_getBuild() {
  return RUNTIME_SAFETY_GUARDS_BUILD;
}

function RuntimeSafetyGuards_requireEnvGuard_() {
  if (typeof EnvironmentGuard_getContext !== 'function') {
    throw new Error('Missing required dependency: EnvironmentGuardService.gs');
  }
}

function RuntimeSafetyGuards_assertRealMailAllowed(reason) {
  RuntimeSafetyGuards_requireEnvGuard_();

  if (typeof EnvironmentGuard_assertRealMailAllowed !== 'function') {
    throw new Error('Missing required dependency: EnvironmentGuard_assertRealMailAllowed');
  }

  return EnvironmentGuard_assertRealMailAllowed(reason || 'RuntimeSafetyGuards_assertRealMailAllowed');
}

function RuntimeSafetyGuards_assertDevMailOverrideAllowed(reason) {
  RuntimeSafetyGuards_requireEnvGuard_();

  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isDev) {
    throw new Error(
      'DEV mail override is only allowed in DEV. env=' + ctx.env +
      (reason ? ' reason=' + reason : '')
    );
  }

  return ctx;
}

function RuntimeSafetyGuards_assertDestructiveActionAllowed(actionName) {
  RuntimeSafetyGuards_requireEnvGuard_();

  if (typeof EnvironmentGuard_assertDestructiveActionAllowed !== 'function') {
    throw new Error('Missing required dependency: EnvironmentGuard_assertDestructiveActionAllowed');
  }

  return EnvironmentGuard_assertDestructiveActionAllowed(actionName || 'UNSPECIFIED_DESTRUCTIVE_ACTION');
}

function RuntimeSafetyGuards_assertProductionWriteAllowed(actionName) {
  RuntimeSafetyGuards_requireEnvGuard_();

  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isProd) {
    throw new Error(
      'Production write blocked outside PROD. env=' + ctx.env +
      (actionName ? ' action=' + actionName : '')
    );
  }

  return ctx;
}

function RuntimeSafetyGuards_assertDevOnlyDiagnosticAllowed(diagnosticName) {
  RuntimeSafetyGuards_requireEnvGuard_();

  var ctx = EnvironmentGuard_getContext();

  if (!ctx.isDev) {
    throw new Error(
      'Verbose diagnostic blocked outside DEV. env=' + ctx.env +
      (diagnosticName ? ' diagnostic=' + diagnosticName : '')
    );
  }

  return ctx;
}

function RUN_RUNTIME_SAFETY_GUARDS_SMOKE() {
  RuntimeSafetyGuards_requireEnvGuard_();

  var ctx = EnvironmentGuard_publicSafeContext();

  var result = {
    ok: true,
    build: RUNTIME_SAFETY_GUARDS_BUILD,
    env: ctx.env,
    isDev: ctx.isDev,
    isProd: ctx.isProd,
    realMailAllowed: ctx.isProd,
    devMailOverrideAllowed: ctx.isDev,
    destructiveActionsAllowed: ctx.isProd,
    source: 'RuntimeSafetyGuards -> EnvironmentGuardService'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
