/**
 * NotificationDeliveryGuard.gs
 * Build: 2026-05-14_NOTIFICATION_DELIVERY_GUARD_R1
 *
 * Central outbound notification safety guard.
 *
 * Ownership:
 * - Does NOT own environment.
 * - Does NOT own notification rendering.
 * - Does NOT own queue reservation or sending.
 * - Only validates whether the resolved outbound delivery mode is allowed
 *   in the current runtime environment.
 *
 * Required dependency:
 * - EnvironmentGuardService.gs
 * - RuntimeSafetyGuards.gs
 */

var NOTIFICATION_DELIVERY_GUARD_BUILD = '2026-05-14_NOTIFICATION_DELIVERY_GUARD_R2_ALIAS';

function NotificationDeliveryGuard_getBuild() {
  return NOTIFICATION_DELIVERY_GUARD_BUILD;
}

function NotificationDeliveryGuard_requireDependencies_() {
  if (typeof EnvironmentGuard_getContext !== 'function') {
    throw new Error('Missing required dependency: EnvironmentGuardService.gs');
  }
  if (typeof RuntimeSafetyGuards_assertRealMailAllowed !== 'function') {
    throw new Error('Missing required dependency: RuntimeSafetyGuards.gs');
  }
}

function NotificationDeliveryGuard_normalizeMode_(mode) {
  var raw = String(mode || '').trim().toUpperCase();
  if (!raw) return 'UNKNOWN';
  if (raw === 'LIVE') return 'LIVE';
  if (raw === 'PROD') return 'LIVE';
  if (raw === 'REAL') return 'LIVE';
  if (raw === 'SEND_REAL') return 'LIVE';
  if (raw === 'TEST_TO_SELF') return 'TEST_TO_SELF';
  if (raw === 'DEV_REDIRECT') return 'TEST_TO_SELF';
  if (raw === 'DRY_RUN') return 'DRY_RUN';
  if (raw === 'DISABLED') return 'DISABLED';
  if (raw === 'OFF') return 'DISABLED';
  return raw;
}

function NotificationDeliveryGuard_assertOutboundAllowed(delivery) {
  NotificationDeliveryGuard_requireDependencies_();

  var ctx = EnvironmentGuard_getContext();
  var payload = delivery || {};
  var mode = NotificationDeliveryGuard_normalizeMode_(
    payload.mode || payload.sendMode || payload.deliveryMode || payload.resolvedMode
  );

  var eventKey = String(payload.eventKey || payload.event || payload.notificationEvent || '').trim();
  var to = String(payload.to || payload.recipient || '').trim();
  var originalTo = String(payload.originalTo || payload.originalRecipient || '').trim();
  var redirectedTo = String(payload.redirectedTo || payload.devRedirectTo || payload.testTo || '').trim();

  if (ctx.isDev) {
    if (mode === 'LIVE') {
      throw new Error(
        'Real notification delivery blocked in DEV.' +
        ' event=' + (eventKey || 'UNKNOWN') +
        ' to=' + (to || 'UNKNOWN')
      );
    }

    if (mode === 'TEST_TO_SELF') {
      if (!to && !redirectedTo) {
        throw new Error(
          'DEV TEST_TO_SELF delivery requires a resolved test recipient.' +
          ' event=' + (eventKey || 'UNKNOWN')
        );
      }
      return NotificationDeliveryGuard_result_(ctx, mode, true, eventKey, to, originalTo, redirectedTo);
    }

    if (mode === 'DRY_RUN' || mode === 'DISABLED') {
      return NotificationDeliveryGuard_result_(ctx, mode, true, eventKey, to, originalTo, redirectedTo);
    }

    throw new Error(
      'Unsupported notification delivery mode in DEV.' +
      ' mode=' + mode +
      ' event=' + (eventKey || 'UNKNOWN')
    );
  }

  if (ctx.isProd) {
    if (mode === 'TEST_TO_SELF') {
      throw new Error(
        'TEST_TO_SELF notification delivery blocked in PROD.' +
        ' event=' + (eventKey || 'UNKNOWN') +
        ' to=' + (to || 'UNKNOWN')
      );
    }

    if (mode === 'DRY_RUN' || mode === 'DISABLED') {
      return NotificationDeliveryGuard_result_(ctx, mode, true, eventKey, to, originalTo, redirectedTo);
    }

    if (mode === 'LIVE') {
      RuntimeSafetyGuards_assertRealMailAllowed(
        'NotificationDeliveryGuard_assertOutboundAllowed event=' + (eventKey || 'UNKNOWN')
      );
      if (!to) {
        throw new Error(
          'PROD LIVE notification delivery requires recipient.' +
          ' event=' + (eventKey || 'UNKNOWN')
        );
      }
      return NotificationDeliveryGuard_result_(ctx, mode, true, eventKey, to, originalTo, redirectedTo);
    }

    throw new Error(
      'Unsupported notification delivery mode in PROD.' +
      ' mode=' + mode +
      ' event=' + (eventKey || 'UNKNOWN')
    );
  }

  throw new Error('Unsupported runtime environment for notification delivery. env=' + ctx.env);
}

function NotificationDeliveryGuard_result_(ctx, mode, allowed, eventKey, to, originalTo, redirectedTo) {
  return {
    ok: true,
    build: NOTIFICATION_DELIVERY_GUARD_BUILD,
    env: ctx.env,
    isDev: ctx.isDev,
    isProd: ctx.isProd,
    mode: mode,
    allowed: !!allowed,
    eventKey: eventKey || '',
    to: to || '',
    originalTo: originalTo || '',
    redirectedTo: redirectedTo || '',
    source: 'NotificationDeliveryGuard -> RuntimeSafetyGuards -> EnvironmentGuardService'
  };
}

function NotificationDeliveryGuard_publicSafeDiagnostic() {
  NotificationDeliveryGuard_requireDependencies_();

  var ctx = EnvironmentGuard_publicSafeContext();
  var cases = [];

  cases.push(NotificationDeliveryGuard_probeCase_({
    eventKey: 'AUDIT_PLANNED_BY_MANAGER',
    mode: 'TEST_TO_SELF',
    to: 'test@example.com',
    originalTo: 'auditor@example.com',
    redirectedTo: 'test@example.com'
  }));

  cases.push(NotificationDeliveryGuard_probeCase_({
    eventKey: 'AUDIT_PLANNED_BY_MANAGER',
    mode: 'LIVE',
    to: 'auditor@example.com'
  }));

  cases.push(NotificationDeliveryGuard_probeCase_({
    eventKey: 'AUDIT_PLANNED_BY_MANAGER',
    mode: 'DRY_RUN',
    to: ''
  }));

  return {
    ok: true,
    build: NOTIFICATION_DELIVERY_GUARD_BUILD,
    env: ctx.env,
    isDev: ctx.isDev,
    isProd: ctx.isProd,
    diagnosticMode: ctx.diagnosticMode,
    cases: cases,
    source: 'NotificationDeliveryGuard_publicSafeDiagnostic'
  };
}

function NotificationDeliveryGuard_probeCase_(delivery) {
  try {
    var result = NotificationDeliveryGuard_assertOutboundAllowed(delivery);
    return {
      mode: result.mode,
      eventKey: result.eventKey,
      allowed: true,
      error: ''
    };
  } catch (err) {
    return {
      mode: NotificationDeliveryGuard_normalizeMode_(delivery && delivery.mode),
      eventKey: delivery && delivery.eventKey ? delivery.eventKey : '',
      allowed: false,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function RUN_NOTIFICATION_DELIVERY_GUARD_SMOKE() {
  var result = NotificationDeliveryGuard_publicSafeDiagnostic();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}


/**
 * Compatibility/public alias expected by NotificationSender.gs R8.
 * Canonical implementation remains NotificationDeliveryGuard_assertOutboundAllowed().
 */
function NotificationDeliveryGuard_assertDeliveryAllowed(delivery) {
  return NotificationDeliveryGuard_assertOutboundAllowed(delivery);
}
