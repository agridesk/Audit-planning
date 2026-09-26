/***********************************************************************
 * FILE: zz_ExternalManagerSessionHandoff.js
 * BUILD: 2026-09-26_EXTERNAL_MANAGER_SESSION_HANDOFF_R1
 *
 * DEV-only bridge from canonical GAS authentication to the external
 * Cloud Run Manager Portal.
 *
 * Why this exists:
 * - GAS remains the canonical validator of Auditor_Tokens.
 * - Cloud Run must not independently reinterpret token expiry/device truth
 *   for the normal Manager entry path.
 * - After GAS validates the trusted token, this file creates a short-lived,
 *   purpose-bound HMAC assertion and POSTs it to Cloud Run.
 * - The raw trusted token and device id are not sent to Cloud Run.
 * - Cloud Run exchanges the assertion for its own 2-hour HttpOnly session.
 * - PROD is blocked.
 ***********************************************************************/
var EXTERNAL_MANAGER_SESSION_HANDOFF_BUILD = '2026-09-26_EXTERNAL_MANAGER_SESSION_HANDOFF_R1';
var EXTERNAL_MANAGER_SESSION_HANDOFF_URL = 'https://ams-transport-proof-510075419067.europe-west1.run.app/auth/signed-handoff';
var EXTERNAL_MANAGER_SESSION_HANDOFF_MAX_FUTURE_MS = 90 * 1000;
var EXTERNAL_MANAGER_SESSION_HANDOFF_TTL_MS = 60 * 1000;

function ExternalManagerSessionHandoff_escape_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(ch) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
  });
}

function ExternalManagerSessionHandoff_b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function ExternalManagerSessionHandoff_payload_(email, role, expMs) {
  return [
    'v1',
    'MANAGER_SESSION',
    String(email || '').trim().toLowerCase(),
    String(role || '').trim(),
    String(expMs || '').trim()
  ].join('\n');
}

function ExternalManagerSessionHandoff_sign_(payload, key) {
  return ExternalManagerSessionHandoff_b64url_(
    Utilities.computeHmacSha256Signature(String(payload || ''), String(key || ''))
  );
}

function ExternalManagerSessionHandoff_buildAssertion_(email) {
  if (!V5_ENTRY_isDevEnv_()) throw new Error('EXTERNAL_MANAGER_HANDOFF_DEV_ONLY');

  email = String(email || '').trim().toLowerCase();
  if (!email) throw new Error('EXTERNAL_MANAGER_HANDOFF_EMAIL_REQUIRED');

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length < 32) throw new Error('EXTERNAL_MANAGER_HANDOFF_KEY_NOT_CONFIGURED');

  var role = 'Manager';
  var expMs = Date.now() + EXTERNAL_MANAGER_SESSION_HANDOFF_TTL_MS;
  var payload = ExternalManagerSessionHandoff_payload_(email, role, expMs);
  var signature = ExternalManagerSessionHandoff_sign_(payload, key);

  return {
    email: email,
    role: role,
    exp: String(expMs),
    signature: signature
  };
}

function ExternalManagerSessionHandoff_renderPost_(email) {
  var a = ExternalManagerSessionHandoff_buildAssertion_(email);
  var html = [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="referrer" content="no-referrer">',
    '<title>AMS - Opening Manager Portal</title></head><body>',
    '<form id="handoff" method="post" action="', ExternalManagerSessionHandoff_escape_(EXTERNAL_MANAGER_SESSION_HANDOFF_URL), '">',
    '<input type="hidden" name="email" value="', ExternalManagerSessionHandoff_escape_(a.email), '">',
    '<input type="hidden" name="role" value="Manager">',
    '<input type="hidden" name="exp" value="', ExternalManagerSessionHandoff_escape_(a.exp), '">',
    '<input type="hidden" name="signature" value="', ExternalManagerSessionHandoff_escape_(a.signature), '">',
    '</form>',
    '<script>document.getElementById("handoff").submit();</script>',
    '<noscript><button type="submit" form="handoff">Open Manager Portal</button></noscript>',
    '</body></html>'
  ].join('');
  return html;
}

/*
 * EntryV5 has a DEV Manager cutover guard that deliberately renders LoginV5
 * before normal legacy rendering. This wrapper owns only the real authenticated
 * Manager cutover. Test bypass remains on the legacy GAS Manager UI.
 */
var EXTERNAL_MANAGER_SESSION_HANDOFF_BASE_RESOLVE_ = V5_ENTRY_resolve;
V5_ENTRY_resolve = function(ctx) {
  ctx = ctx || {};

  var runtimeEnv = V5_ENTRY_captureEnv_(ctx);
  var action = V5_ENTRY_normAction_(ctx.action);
  var expectedRole = V5_ENTRY_expectedRole_(action, ctx.role);
  var email = String(ctx.email || '').trim().toLowerCase();
  var token = String(ctx.trustedToken || ctx.token || '').trim();
  var device = String(ctx.deviceFingerprint || ctx.deviceId || '').trim();

  if (runtimeEnv !== 'DEV' || action !== 'manager' || expectedRole !== 'Manager') {
    return EXTERNAL_MANAGER_SESSION_HANDOFF_BASE_RESOLVE_(ctx);
  }

  if (V5_ENTRY_isTestBypass_(email, expectedRole, token, device)) {
    return EXTERNAL_MANAGER_SESSION_HANDOFF_BASE_RESOLVE_(ctx);
  }

  if (!token || !device) {
    return V5_ENTRY_renderLogin(action, expectedRole);
  }

  var authRes = null;
  try {
    authRes = V5_AUTH.validateTrustedTokenByRole(token, 'Manager', device);
  } catch (errAuth) {
    authRes = null;
  }

  if (!authRes || authRes.ok !== true || !authRes.email) {
    return V5_ENTRY_renderLogin(action, expectedRole);
  }

  return ExternalManagerSessionHandoff_renderPost_(String(authRes.email || '').trim().toLowerCase());
};

function RUN_EXTERNAL_MANAGER_SESSION_HANDOFF_CONTRACT_ACCEPTANCE() {
  var out = {
    ok: true,
    build: EXTERNAL_MANAGER_SESSION_HANDOFF_BUILD,
    writesPerformed: false,
    checks: []
  };

  function check_(name, ok, detail) {
    out.checks.push({ name:name, ok:!!ok, detail:detail || '' });
    if (!ok) out.ok = false;
  }

  check_('devEnvironment', V5_ENTRY_isDevEnv_(), '');
  check_('baseResolvePreserved', typeof EXTERNAL_MANAGER_SESSION_HANDOFF_BASE_RESOLVE_ === 'function', '');
  check_('canonicalGasTokenValidatorAvailable', !!(V5_AUTH && typeof V5_AUTH.validateTrustedTokenByRole === 'function'), '');
  check_('bridgeKeyConfigured', String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim().length >= 32, '');
  check_('targetIsCloudRunSignedPost', /^https:\/\/ams-transport-proof-[^.]+\.europe-west1\.run\.app\/auth\/signed-handoff$/.test(EXTERNAL_MANAGER_SESSION_HANDOFF_URL), EXTERNAL_MANAGER_SESSION_HANDOFF_URL);

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length >= 32) {
    var exp = Date.now() + 30000;
    var payload = ExternalManagerSessionHandoff_payload_('planning@agriqa.es', 'Manager', exp);
    var sig1 = ExternalManagerSessionHandoff_sign_(payload, key);
    var sig2 = ExternalManagerSessionHandoff_sign_(payload, key);
    check_('signatureDeterministic', !!sig1 && sig1 === sig2, '');
    check_('payloadPurposeBound', payload.indexOf('v1\nMANAGER_SESSION\nplanning@agriqa.es\nManager\n') === 0, '');
  }

  check_('ttlWithinNinetySeconds', EXTERNAL_MANAGER_SESSION_HANDOFF_TTL_MS > 0 && EXTERNAL_MANAGER_SESSION_HANDOFF_TTL_MS <= EXTERNAL_MANAGER_SESSION_HANDOFF_MAX_FUTURE_MS, String(EXTERNAL_MANAGER_SESSION_HANDOFF_TTL_MS));

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
