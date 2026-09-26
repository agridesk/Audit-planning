/*****************************************************************************************
 * FILE: zz_ExternalPlanningWorkspaceHandoff.js
 * BUILD: 2026-09-26_EXTERNAL_PLANNING_WORKSPACE_HANDOFF_R5_CANONICAL_COMMIT
 *
 * DEV-only signed bridge for external Manager Planning 2.0.
 * - Legacy/open handoff remains supported for compatibility.
 * - Commit mode delegates to canonical saveManagerPlanning().
 ***********************************************************************/
var EXTERNAL_PLANNING_WORKSPACE_HANDOFF_BUILD = '2026-09-26_EXTERNAL_PLANNING_WORKSPACE_HANDOFF_R5_CANONICAL_COMMIT';
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

function ExternalPlanningWorkspaceHandoff_sha256_(value) {
  return ExternalPlanningWorkspaceHandoff_b64url_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8)
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

function ExternalPlanningWorkspaceHandoff_commitPayload_(email, role, auditId, expMs, planningPayloadJson) {
  return [
    'v2',
    'PLANNING_COMMIT',
    String(email || '').trim().toLowerCase(),
    String(role || '').trim(),
    String(auditId || '').trim(),
    String(expMs || '').trim(),
    ExternalPlanningWorkspaceHandoff_sha256_(planningPayloadJson)
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
  var mode = String(p.mode || '').trim().toLowerCase();

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

  var planningPayloadJson = '';
  var payload = '';
  if (mode === 'commit') {
    planningPayloadJson = String(p.planningPayload || '').trim();
    if (!planningPayloadJson) return { ok:false, error:'PLANNING_PAYLOAD_REQUIRED' };
    payload = ExternalPlanningWorkspaceHandoff_commitPayload_(email, 'Manager', auditId, expMs, planningPayloadJson);
  } else {
    payload = ExternalPlanningWorkspaceHandoff_payload_(email, 'Manager', auditId, expMs);
  }

  var expected = ExternalPlanningWorkspaceHandoff_sign_(payload, key);
  if (!ExternalPlanningWorkspaceHandoff_safeEq_(supplied, expected)) {
    return { ok:false, error:'HANDOFF_SIGNATURE_INVALID' };
  }

  return {
    ok:true,
    email:email,
    role:'Manager',
    auditId:auditId,
    expMs:expMs,
    mode:mode === 'commit' ? 'commit' : 'open',
    planningPayloadJson:planningPayloadJson
  };
}

function ExternalPlanningWorkspaceHandoff_prewarm_(auditId) {
  var started = Date.now();
  try {
    var res = getToolkitOpenFastV5(
      String(auditId || '').trim(),
      '',
      { withCalendar:false, role:'MANAGER', lockedAuditorEmail:'' }
    );
    return {
      ok: !!(res && res.success),
      ms: Date.now() - started,
      cacheHit: !!(res && res.__cacheHit),
      serverMs: Number((res && res.__serverMs) || 0)
    };
  } catch (e) {
    return { ok:false, ms:Date.now()-started, error:String(e && e.message ? e.message : e) };
  }
}

function ExternalPlanningWorkspaceHandoff_commit_(identity) {
  if (typeof saveManagerPlanning !== 'function') {
    return { success:false, error:'CANONICAL_PLANNING_OWNER_UNAVAILABLE', message:'saveManagerPlanning is unavailable' };
  }

  var body = {};
  try { body = JSON.parse(String(identity.planningPayloadJson || '{}')); }
  catch (eJson) { return { success:false, error:'PLANNING_PAYLOAD_BAD_JSON', message:'Invalid planning payload JSON' }; }

  var auditId = String(identity.auditId || '').trim();
  var auditorEmail = String(body.auditorEmail || '').trim().toLowerCase();
  var auditorName = String(body.auditorName || '').trim();
  var blocks = Array.isArray(body.blocks) ? body.blocks : [];
  var comment = String(body.comment || '').trim();

  if (!auditId || !auditorEmail || !blocks.length) {
    return { success:false, error:'PLANNING_REQUIRED_FIELDS_MISSING', message:'auditId, auditorEmail and blocks are required' };
  }
  if (blocks.length > 5) {
    return { success:false, error:'PLANNING_TOO_MANY_BLOCKS', message:'Maximum 5 planning blocks per audit' };
  }

  var payload = {
    auditorEmail:auditorEmail,
    auditorName:auditorName,
    blocks:blocks.map(function(b) {
      b = b || {};
      return {
        date:String(b.date || '').trim(),
        start:String(b.start || '').trim(),
        end:String(b.end || '').trim(),
        execLoc:String(b.execLoc || b.location || 'HQ').trim() || 'HQ',
        slotComment:String(b.slotComment || b.comment || '').trim()
      };
    }),
    comment:comment,
    actorEmail:String(identity.email || '').trim().toLowerCase(),
    actorRole:'MANAGER',
    externalSession:true
  };

  return saveManagerPlanning(auditId, payload);
}

function ExternalPlanningWorkspaceHandoff_render_(identity) {
  if (!identity || identity.ok !== true) throw new Error('HANDOFF_IDENTITY_REQUIRED');

  if (String(identity.mode || '').toLowerCase() === 'commit') {
    var committed = ExternalPlanningWorkspaceHandoff_commit_(identity);
    return ContentService
      .createTextOutput(JSON.stringify(committed || { success:false, error:'EMPTY_RESULT' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var auditId = String(identity.auditId || '').trim();
  var email = String(identity.email || '').trim().toLowerCase();
  if (!auditId) throw new Error('AUDIT_ID_REQUIRED');
  if (!email) throw new Error('ACTOR_EMAIL_REQUIRED');

  var execUrl = '';
  try { execUrl = String(ScriptApp.getService().getUrl() || '').trim(); } catch (e0) { execUrl = ''; }

  var prewarm = ExternalPlanningWorkspaceHandoff_prewarm_(auditId);
  try { Logger.log('[EXTERNAL_PLAN_PREWARM] ' + JSON.stringify({ auditId:auditId, result:prewarm })); } catch (eLog) {}

  var tp = HtmlService.createTemplateFromFile('ManagerPlanningV5UI');
  tp.__execUrl = execUrl;
  tp.__email = email;
  tp.__role = 'Manager';
  tp.__trustedToken = '';
  tp.__deviceFingerprint = '';
  tp.__action = 'planningtoolkit';
  tp.__env = 'DEV';
  tp.auditId = auditId;

  return tp.evaluate().setTitle('AMS - Planning');
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
  check_('directPostRouterAvailable', typeof doPost === 'function', '');
  check_('directPostRouterOwnsPlanningRoute', String(doPost).indexOf("rawAction === 'externalplanningworkspace'") >= 0, '');
  check_('bridgeKeyConfigured', String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim().length >= 32, '');
  check_('canonicalPlanningSaveAvailable', typeof saveManagerPlanning === 'function', '');
  check_('commitDelegatesToCanonicalSave', String(ExternalPlanningWorkspaceHandoff_commit_).indexOf('saveManagerPlanning(auditId, payload)') >= 0, '');
  check_('commitForcesManagerRole', String(ExternalPlanningWorkspaceHandoff_commit_).indexOf("actorRole:'MANAGER'") >= 0, '');
  check_('commitPayloadIsBodyBound', String(ExternalPlanningWorkspaceHandoff_commitPayload_).indexOf('ExternalPlanningWorkspaceHandoff_sha256_(planningPayloadJson)') >= 0, '');

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  if (key.length >= 32) {
    var exp = Date.now() + 30000;
    var email = 'planning@agriqa.es';
    var auditId = 'CONTRACT_ONLY_NO_WRITE';

    var openPayload = ExternalPlanningWorkspaceHandoff_payload_(email, 'Manager', auditId, exp);
    var openSig = ExternalPlanningWorkspaceHandoff_sign_(openPayload, key);
    var openGood = ExternalPlanningWorkspaceHandoff_verify_({ email:email, role:'Manager', auditId:auditId, exp:String(exp), signature:openSig });
    check_('legacyOpenSignatureAccepted', openGood.ok === true && openGood.mode === 'open', JSON.stringify(openGood));

    var planningJson = JSON.stringify({ auditorEmail:'contract@example.invalid', auditorName:'Contract', blocks:[{date:'2099-01-01',start:'09:00',end:'10:00',execLoc:'HQ'}] });
    var commitPayload = ExternalPlanningWorkspaceHandoff_commitPayload_(email, 'Manager', auditId, exp, planningJson);
    var commitSig = ExternalPlanningWorkspaceHandoff_sign_(commitPayload, key);
    var commitGood = ExternalPlanningWorkspaceHandoff_verify_({ mode:'commit', email:email, role:'Manager', auditId:auditId, exp:String(exp), planningPayload:planningJson, signature:commitSig });
    var tampered = ExternalPlanningWorkspaceHandoff_verify_({ mode:'commit', email:email, role:'Manager', auditId:auditId, exp:String(exp), planningPayload:planningJson + ' ', signature:commitSig });
    check_('signedCommitAcceptedWithoutWrite', commitGood.ok === true && commitGood.mode === 'commit', JSON.stringify({ok:commitGood.ok,mode:commitGood.mode,auditId:commitGood.auditId}));
    check_('tamperedCommitRejected', tampered.ok === false && tampered.error === 'HANDOFF_SIGNATURE_INVALID', JSON.stringify(tampered));
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
