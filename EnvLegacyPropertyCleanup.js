/***********************************************************************
 * FILE: EnvLegacyPropertyCleanup.gs
 *
 * PURPOSE
 * - Cleanup legacy runtime ENV properties after EnvironmentGuardService adoption.
 * - Keeps canonical Script Property AUDIT_RUNTIME_ENV.
 * - Removes legacy ENV ownership from Script/User/Document properties.
 *
 * DOES NOT
 * - mutate System_Config
 * - mutate cache
 * - mutate business data
 *
 * SAFE TO RUN IN DEV AND PROD
 ***********************************************************************/

var ENV_LEGACY_PROPERTY_CLEANUP_BUILD = '2026-05-14_ENV_LEGACY_PROPERTY_CLEANUP_R1';

function RUN_ENV_LEGACY_PROPERTY_CLEANUP_PREVIEW() {
  return ENV_LEGACY_PROPERTY_CLEANUP_run_(false);
}

function RUN_ENV_LEGACY_PROPERTY_CLEANUP_APPLY() {
  return ENV_LEGACY_PROPERTY_CLEANUP_run_(true);
}

function ENV_LEGACY_PROPERTY_CLEANUP_run_(apply) {
  var canonical = ENV_LEGACY_PROPERTY_CLEANUP_getCanonicalEnv_();
  var targets = ['ACTIVE_ENV', 'AUDIT_ACTIVE_ENV', 'ENV', 'RUNTIME_ENV'];
  var scopes = [
    { name: 'SCRIPT', store: PropertiesService.getScriptProperties(), removeAuditRuntimeEnv: false },
    { name: 'USER', store: PropertiesService.getUserProperties(), removeAuditRuntimeEnv: true },
    { name: 'DOCUMENT', store: PropertiesService.getDocumentProperties(), removeAuditRuntimeEnv: true }
  ];

  var changes = [];

  for (var s = 0; s < scopes.length; s++) {
    var scope = scopes[s];
    var props = scope.store.getProperties() || {};

    for (var i = 0; i < targets.length; i++) {
      var key = targets[i];
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;

      changes.push({
        scope: scope.name,
        key: key,
        currentValue: String(props[key] || ''),
        action: apply ? 'DELETE_APPLIED' : 'DELETE_PREVIEW'
      });

      if (apply) {
        scope.store.deleteProperty(key);
      }
    }

    if (scope.removeAuditRuntimeEnv && Object.prototype.hasOwnProperty.call(props, 'AUDIT_RUNTIME_ENV')) {
      changes.push({
        scope: scope.name,
        key: 'AUDIT_RUNTIME_ENV',
        currentValue: String(props.AUDIT_RUNTIME_ENV || ''),
        action: apply ? 'DELETE_APPLIED' : 'DELETE_PREVIEW',
        reason: 'AUDIT_RUNTIME_ENV must only exist as Script Property.'
      });

      if (apply) {
        scope.store.deleteProperty('AUDIT_RUNTIME_ENV');
      }
    }
  }

  var out = {
    ok: true,
    build: ENV_LEGACY_PROPERTY_CLEANUP_BUILD,
    mode: apply ? 'APPLY' : 'PREVIEW',
    canonical: canonical,
    changes: changes,
    changeCount: changes.length,
    next: apply
      ? 'Run RUN_ENV_LEGACY_RUNTIME_SCAN_COMPACT again.'
      : 'If this preview is acceptable, run RUN_ENV_LEGACY_PROPERTY_CLEANUP_APPLY.'
  };

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function ENV_LEGACY_PROPERTY_CLEANUP_getCanonicalEnv_() {
  var value = String(
    PropertiesService.getScriptProperties().getProperty('AUDIT_RUNTIME_ENV') || ''
  ).trim().toUpperCase();

  if (value !== 'DEV' && value !== 'PROD') {
    throw new Error('Canonical Script Property AUDIT_RUNTIME_ENV missing or invalid: ' + value);
  }

  return {
    property: 'AUDIT_RUNTIME_ENV',
    value: value
  };
}
