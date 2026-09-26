/***********************************************************************
 * FILE: zz_ExternalPlanningWorkspaceHandoff.js
 * BUILD: 2026-09-26_EXTERNAL_PLANNING_WORKSPACE_HANDOFF_R2_DIRECT_ROUTER
 *
 * DEV-only signed handoff from the external Cloud Run Manager Portal
 * to the existing GAS Planning Workspace 2.0.
 *
 * Security contract:
 * - Cloud Run application session remains the browser auth owner.
 * - AMS_EXTERNAL_WRITE_BRIDGE_KEY is never sent to the browser.
 * - Cloud Run sends only a short-lived HMAC assertion in POST body.
 * - No auth credential is placed in the URL.
 * - GAS validates role, expiry, auditId, actor email and signature.
 * - PROD is blocked.
 *
 * Routing note:
 * - The web-app entrypoint is now the direct global doPost declaration in
 *   zzzz_WebAppPostRouter.js. Apps Script /dev did not reliably honor the
 *   previous runtime reassignment/wrapper of doPost.
 ***********************************************************************/
var EXTERNAL_PLANNING_WORKSPACE_HANDOFF_BUILD = '2026-09-26_EXTERNAL_PLANNING_WORKSPACE_HANDOFF_R2_DIRECT_ROUTER';
var EXTERNAL_PLANNING_WORKSPACE_HANDOFF_MAX_FUTURE_MS = 90 * 1000;
var EXTERNAL_PLANNING_WORKSPACE_HANDOFF_CLOCK_SKEW_MS = 10 * 1000;

function ExternalPlanningWorkspaceHandoff_b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function ExternalPlanningWorkspaceHandoff_sign_(payload, key) {
  return ExternalPlanningWorkspaceHandoff_b64url_(
    Utilities.computeHmacSha256Signature(String(payload || ''), String(key || ''))
  );
}

function ExternalPlanningWorkspaceHandoff_safeEq_(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(i % Math.max(1, b.length)) || 0);
  }
  return diff === 0;
}

function ExternalPlanningWorkspaceHandoff_payload_(email, role, auditId, expMs) {
  return [
    'v1',
    String(email || '').trim().toLowerCase(),
    String(role || '').trim(),
    String(auditId || '').trim(),
    String(expMs || '').trim()
  ].join('\n');
}

function ExternalPlanningWorkspaceHandoff_verify_(p) {
  if (!V5_ENTRY_isDevEnv_()) return { ok:false, error:'DEV_ONLY' };

  p = p || {};
  var email = String(p.email || p.actorEmail || '').trim().toLowerCase();
  var role = String(p.role || '').trim();
  var auditId = String(p.auditId || '').trim();
  var expMs = Number(String(p.exp || p.expiresAt || '').trim());
  var supplied = String(p.signature || p.sig || '').trim();

  if (!email || !auditId || !role || !expMs || !supplied) {
    return { ok:false, error:'HANDOFF_REQUIRED_FIELDS_MISSING' };
  }
  if (role.toLowerCase() !== 'manager') return { ok:false, error:'ROLE_FORBIDDEN' };

  var now = Date.now();
  if (expMs < now - EXTERNAL_PLANNING_WORKSPACE_HANDOFF_CLOCK_SKEW_MS) {
    return { ok:false, error:'HANDOFF_EXPIRED' };
  }
  if (expMs > now + EXTERNAL_PLANNING_WORKSPACE_HANDOFF_MAX_FUTURE_MS) {
    return { ok:false, error:'HANDOFF_EXPIRY_INVALID' };
  }

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length < 32) return { ok:false, error:'HANDOFF_KEY_NOT_CONFIGURED' };

  var payload = ExternalPlanningWorkspaceHandoff_payload_(email, 'Manager', auditId, expMs);
  var expected = ExternalPlanningWorkspaceHandoff_sign_(payload, key);
  if (!ExternalPlanningWorkspaceHandoff_safeEq_(supplied, expected)) {
    return { ok:false, error:'HANDOFF_SIGNATURE_INVALID' };
  }

  return { ok:true, email:email, role:'Manager', auditId:auditId, expMs:expMs };
}

function ExternalPlanningWorkspaceHandoff_render_(identity) {
  if (!identity || identity.ok !== true) throw new Error('HANDOFF_IDENTITY_REQUIRED');

  var q = {
    auditId: String(identity.auditId || '').trim(),
    role: 'Manager',
    actorRole: 'Manager',
    actorEmail: String(identity.email || '').trim().toLowerCase()
  };
  var seed = PlanningWorkspaceRpc_bootstrap(q);
  var output = PlanningWorkspaceUi_render({ env:'DEV' });
  var html = output && typeof output.getContent === 'function' ? output.getContent() : String(output || '');
  var boot = {
    email: q.actorEmail,
    role: 'Manager',
    auditId: q.auditId,
    externalSessionHandoff: true,
    handoffBuild: EXTERNAL_PLANNING_WORKSPACE_HANDOFF_BUILD
  };
  var bootJson = JSON.stringify(boot).replace(/</g, '\\u003c');
  var seedJson = JSON.stringify(seed).replace(/</g, '\\u003c');
  html = html.replace(
    '</head>',
    '<script>window.__PW_ENTRY_DIRECT_SHELL=true;window.__PW_ENTRY_AUTH=' + bootJson + ';window.__PW_HTTP_BOOTSTRAP=' + seedJson + ';</script></head>'
  );
  return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
}

function RUN_EXTERNAL_PLANNING_WORKSPACE_HANDOFF_CONTRACT_ACCEPTANCE() {
  var out = {
    ok: true,
    build: EXTERNAL_PLANNING_WORKSPACE_HANDOFF_BUILD,
    writesPerformed: false,
    checks: []
  };
  function check_(name, ok, detail) {
    out.checks.push({ name:name, ok:!!ok, detail:detail || '' });
    if (!ok) out.ok = false;
  }

  check_('devEnvironment', V5_ENTRY_isDevEnv_(), '');
  check_('workspaceRendererAvailable', typeof PlanningWorkspaceUi_render === 'function', '');
  check_('workspaceBootstrapAvailable', typeof PlanningWorkspaceRpc_bootstrap === 'function', '');
  check_('directPostRouterAvailable', typeof doPost === 'function', '');
  check_('directPostRouterOwnsPlanningRoute', String(doPost).indexOf("rawAction === 'externalplanningworkspace'") >= 0, '');
  check_('bridgeKeyConfigured', String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim().length >= 32, '');

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length >= 32) {
    var exp = Date.now() + 30000;
    var email = 'planning@agriqa.es';
    var auditId = 'CONTRACT_ONLY_NO_WRITE';
    var payload = ExternalPlanningWorkspaceHandoff_payload_(email, 'Manager', auditId, exp);
    var sig = ExternalPlanningWorkspaceHandoff_sign_(payload, key);
    var good = ExternalPlanningWorkspaceHandoff_verify_({ email:email, role:'Manager', auditId:auditId, exp:String(exp), signature:sig });
    var bad = ExternalPlanningWorkspaceHandoff_verify_({ email:email, role:'Manager', auditId:auditId, exp:String(exp), signature:sig + 'x' });
    check_('validSignatureAccepted', good.ok === true, JSON.stringify(good));
    check_('invalidSignatureRejected', bad.ok === false && bad.error === 'HANDOFF_SIGNATURE_INVALID', JSON.stringify(bad));
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
