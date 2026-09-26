/***********************************************************************
 * FILE: zzzz_WebAppPostRouter.js
 * BUILD: 2026-09-26_WEBAPP_POST_ROUTER_R1
 *
 * Canonical DEV web-app POST router.
 *
 * Why this exists:
 * - Apps Script web-app entrypoints must be direct global function declarations.
 * - Runtime reassignment/wrapping of doPost is not reliably used by the
 *   deployed /dev web-app endpoint.
 * - This router preserves the existing Manager action bridge and deprecated
 *   overview command while adding the signed Planning Workspace handoff.
 * - PROD behavior remains guarded by the route-specific DEV checks.
 ***********************************************************************/
var WEBAPP_POST_ROUTER_BUILD = '2026-09-26_WEBAPP_POST_ROUTER_R1';

function doPost(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var rawAction = String(p.action || '').trim().toLowerCase();

  if (rawAction === 'externalplanningworkspace') {
    if (typeof ExternalPlanningWorkspaceHandoff_verify_ !== 'function' ||
        typeof ExternalPlanningWorkspaceHandoff_render_ !== 'function') {
      return HtmlService.createHtmlOutput(
        '<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title>' +
        '<h3>Planning Workspace handoff failed</h3><pre>HANDOFF_OWNER_UNAVAILABLE</pre>'
      ).setTitle('AMS - Planning Workspace');
    }

    var verified = ExternalPlanningWorkspaceHandoff_verify_(p);
    if (!verified || verified.ok !== true) {
      return HtmlService.createHtmlOutput(
        '<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title>' +
        '<h3>Planning Workspace handoff failed</h3><pre>' +
        String((verified && verified.error) || 'HANDOFF_FAILED').replace(/[<>]/g, '') +
        '</pre>'
      ).setTitle('AMS - Planning Workspace');
    }

    try {
      return ExternalPlanningWorkspaceHandoff_render_(verified);
    } catch (errPlanning) {
      return HtmlService.createHtmlOutput(
        '<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title>' +
        '<h3>Planning Workspace failed to open</h3><pre>' +
        String(errPlanning && errPlanning.message ? errPlanning.message : errPlanning).replace(/[<>]/g, '') +
        '</pre>'
      ).setTitle('AMS - Planning Workspace');
    }
  }

  if (rawAction === 'externalmanageraction') {
    if (!V5_ENTRY_isDevEnv_()) {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'DEV_ONLY' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var props = PropertiesService.getScriptProperties();
    var expectedKey = String(props.getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
    var body = {};
    try {
      body = JSON.parse(String((e && e.postData && e.postData.contents) || '{}'));
    } catch (eJson) {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'BAD_JSON' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var suppliedKey = String(body.bridgeKey || '').trim();
    if (!expectedKey || !suppliedKey || expectedKey !== suppliedKey) {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'BRIDGE_UNAUTHORIZED' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    delete body.bridgeKey;
    var actorEmail = String(body.actorEmail || '').trim().toLowerCase();
    var auditId = String(body.auditId || '').trim();
    var managerAction = String(body.managerAction || body.action || '').trim().toLowerCase();
    var options = body.options && typeof body.options === 'object' ? body.options : {};

    if (!actorEmail || !auditId || !managerAction) {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'MISSING_REQUIRED_FIELDS' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (managerAction !== 'approve' && managerAction !== 'cancel' && managerAction !== 'reject') {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'MANAGER_PORTAL_ACTION_NOT_ALLOWED' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if ((managerAction === 'cancel' || managerAction === 'reject') &&
        !String(options.reason || options.comment || '').trim()) {
      return ContentService.createTextOutput(JSON.stringify({ success:false, error:'ACTION_REASON_REQUIRED' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    options.actorEmail = actorEmail;
    options.managerEmail = actorEmail;
    options.externalSession = true;
    var result = managerV5Action(auditId, managerAction, options);
    return ContentService.createTextOutput(JSON.stringify(result || {success:false,error:'EMPTY_RESULT'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (rawAction === 'manageroverviewcommand' || rawAction === 'overviewcommand') {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'OVERVIEW_COMMAND_DEPRECATED',
      redirectAction: 'manager'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ success:false, error:'UNHANDLED_POST' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function RUN_WEBAPP_POST_ROUTER_CONTRACT_ACCEPTANCE() {
  var out = {
    ok: true,
    build: WEBAPP_POST_ROUTER_BUILD,
    writesPerformed: false,
    checks: []
  };

  function check_(name, ok, detail) {
    out.checks.push({ name:name, ok:!!ok, detail:detail || '' });
    if (!ok) out.ok = false;
  }

  var src = String(doPost);
  check_('devEnvironment', V5_ENTRY_isDevEnv_(), '');
  check_('directDoPostOwnsPlanningRoute', src.indexOf("rawAction === 'externalplanningworkspace'") >= 0, '');
  check_('directDoPostPreservesManagerActionRoute', src.indexOf("rawAction === 'externalmanageraction'") >= 0, '');
  check_('directDoPostPreservesOverviewDeprecation', src.indexOf("rawAction === 'manageroverviewcommand'") >= 0, '');
  check_('planningVerifierAvailable', typeof ExternalPlanningWorkspaceHandoff_verify_ === 'function', '');
  check_('planningRendererAvailable', typeof ExternalPlanningWorkspaceHandoff_render_ === 'function', '');
  check_('managerActionOwnerAvailable', typeof managerV5Action === 'function', '');

  var key = String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY') || '').trim();
  check_('bridgeKeyConfigured', key.length >= 32, '');

  if (key.length >= 32 && typeof ExternalPlanningWorkspaceHandoff_payload_ === 'function' && typeof ExternalPlanningWorkspaceHandoff_sign_ === 'function') {
    var exp = Date.now() + 30000;
    var email = 'planning@agriqa.es';
    var auditId = 'CONTRACT_ONLY_NO_WRITE';
    var payload = ExternalPlanningWorkspaceHandoff_payload_(email, 'Manager', auditId, exp);
    var sig = ExternalPlanningWorkspaceHandoff_sign_(payload, key);
    var verified = ExternalPlanningWorkspaceHandoff_verify_({
      email: email,
      role: 'Manager',
      auditId: auditId,
      exp: String(exp),
      signature: sig
    });
    check_('signedPlanningPayloadAccepted', !!(verified && verified.ok === true), JSON.stringify(verified || {}));
  }

  try { Logger.log(JSON.stringify(out, null, 2)); } catch (eLog) {}
  return out;
}
