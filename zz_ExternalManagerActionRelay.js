/***********************************************************************
 * FILE: zz_ExternalManagerActionRelay.js
 * BUILD: 2026-10-03_COMPLETE_V29_MANAGER_ACTION_SERVER_WARM_R8
 * PURPOSE:
 *   Keep Manager Portal 2.0 lifecycle writes on the same Apps Script
 *   google.script.run path used by the fast 1.0 Manager Portal.
 *   Cloud Run only issues a short-lived signed iframe URL; lifecycle
 *   ownership remains managerV5Action -> Status_applyAction.
 ***********************************************************************/
var EXTERNAL_MANAGER_ACTION_RELAY_BUILD = '2026-10-03_COMPLETE_V29_MANAGER_ACTION_SERVER_WARM_R8';
var EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN = 'https://ams-transport-proof-510075419067.europe-west1.run.app';
var EXTERNAL_MANAGER_ACTION_RELAY_MAX_FUTURE_MS = 15 * 60 * 1000;

function ExternalManagerActionRelay_b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function ExternalManagerActionRelay_payload_(email, role, expMs, origin, nonce) {
  return [
    'v3',
    'MANAGER_ACTION_WARM_WORKER',
    String(email || '').trim().toLowerCase(),
    String(role || '').trim(),
    String(expMs || '').trim(),
    String(origin || '').trim(),
    String(nonce || '').trim()
  ].join('\n');
}

function ExternalManagerActionRelay_sign_(payload, key) {
  return ExternalManagerActionRelay_b64url_(
    Utilities.computeHmacSha256Signature(String(payload || ''), String(key || ''))
  );
}

function ExternalManagerActionRelay_safeEq_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  var x = 0;
  for (var i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

function ExternalManagerActionRelay_verify_(p) {
  p = p || {};
  if (!V5_ENTRY_isDevEnv_()) return { ok:false, error:'DEV_ONLY' };

  var email = String(p.email || '').trim().toLowerCase();
  var role = String(p.role || '').trim();
  var exp = Number(String(p.exp || '').trim());
  var origin = String(p.origin || '').trim();
  var supplied = String(p.signature || '').trim();
  var nonce = String(p.nonce || '').trim();
  var now = Date.now();

  if (!email || role !== 'Manager' || !exp || !origin || !supplied || !nonce) return { ok:false, error:'MISSING_FIELDS' };
  if (origin !== EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN) return { ok:false, error:'ORIGIN_FORBIDDEN' };
  if (exp < now) return { ok:false, error:'ASSERTION_EXPIRED' };
  if (exp - now > EXTERNAL_MANAGER_ACTION_RELAY_MAX_FUTURE_MS) return { ok:false, error:'ASSERTION_TOO_FAR' };

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length < 32) return { ok:false, error:'BRIDGE_KEY_NOT_CONFIGURED' };

  var payload = ExternalManagerActionRelay_payload_(email, role, exp, origin, nonce);
  var expected = ExternalManagerActionRelay_sign_(payload, key);
  if (!ExternalManagerActionRelay_safeEq_(supplied, expected)) return { ok:false, error:'BAD_SIGNATURE' };

  return { ok:true, email:email, role:role, exp:exp, origin:origin, nonce:nonce };
}

function ExternalManagerActionRelay_render_(verified) {
  var t = HtmlService.createTemplateFromFile('ManagerActionRelay');
  t.__parentOrigin = verified.origin;
  t.__actorEmail = verified.email;
  t.__nonce = verified.nonce;
  t.__build = EXTERNAL_MANAGER_ACTION_RELAY_BUILD;
  return t.evaluate()
    .setTitle('AMS Manager Action Relay')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ExternalManagerActionRelay_errorHtml_(errorCode, origin, nonce) {
  var code = String(errorCode || 'RELAY_FAILED').replace(/[<>]/g, '');
  var parentOrigin = String(origin || EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN);
  if (parentOrigin !== EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN) parentOrigin = EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN;
  var payload = JSON.stringify({
    type:'AMS_MANAGER_ACTION_RELAY_READY',
    success:false,
    error:code,
    build:EXTERNAL_MANAGER_ACTION_RELAY_BUILD,
    nonce:String(nonce || '')
  });
  return '<!doctype html><html><head><meta charset="utf-8"><title>AMS relay error</title></head><body><pre>' + code + '</pre><script>' +
    'try{top.postMessage(' + payload + ',' + JSON.stringify(parentOrigin) + ');}catch(e){}' +
    '<\/script></body></html>';
}

function ManagerActionWorker_warm() {
  var t0 = Date.now();
  if (!V5_ENTRY_isDevEnv_()) return { success:false, error:'DEV_ONLY', ms:Date.now()-t0 };

  var out = {
    success:true,
    build:EXTERNAL_MANAGER_ACTION_RELAY_BUILD,
    auditPlanningPack:false,
    availabilityReady:false,
    statusOwner:false,
    ms:0
  };

  try {
    if (typeof __mp_getAuditPlanningPack_ === 'function') {
      var pack = __mp_getAuditPlanningPack_();
      out.auditPlanningPack = !!(pack && pack.rows);
      out.auditPlanningRows = pack && pack.rows ? pack.rows.length : 0;
    }
  } catch (ePack) {
    out.auditPlanningPackError = String(ePack && ePack.message ? ePack.message : ePack);
  }

  try {
    if (typeof AvailabilityService !== 'undefined' && AvailabilityService && typeof AvailabilityService.healthcheck === 'function') {
      var av = AvailabilityService.healthcheck();
      out.availabilityReady = !!(av && av.success !== false);
    } else {
      out.availabilityReady = typeof V5_availabilityClearAuditId_ === 'function';
    }
  } catch (eAv) {
    out.availabilityError = String(eAv && eAv.message ? eAv.message : eAv);
  }

  out.statusOwner = typeof managerV5Action === 'function' && typeof Status_applyAction === 'function';
  out.success = out.statusOwner;
  out.ms = Date.now() - t0;
  return out;
}

function RUN_EXTERNAL_MANAGER_ACTION_RELAY_CONTRACT_ACCEPTANCE() {
  var out = { ok:true, build:EXTERNAL_MANAGER_ACTION_RELAY_BUILD, writesPerformed:false, checks:[] };
  function check_(name, ok, detail) { out.checks.push({name:name,ok:!!ok,detail:detail||''}); if (!ok) out.ok=false; }
  check_('devOnly', V5_ENTRY_isDevEnv_(), '');
  check_('managerAdapterAvailable', typeof managerV5Action === 'function', '');
  check_('serverWarmupAvailable', typeof ManagerActionWorker_warm === 'function', '');
  check_('bridgeKeyConfigured', String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')||'').trim().length >= 32, '');
  check_('parentOriginPinned', EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN === 'https://ams-transport-proof-510075419067.europe-west1.run.app', EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN);
  check_('errorPagePostsFailure', ExternalManagerActionRelay_errorHtml_('TEST', EXTERNAL_MANAGER_ACTION_RELAY_PARENT_ORIGIN).indexOf('AMS_MANAGER_ACTION_RELAY_READY') >= 0, '');
  try { Logger.log(JSON.stringify(out, null, 2)); } catch (e) {}
  return out;
}
