var AMS_EXTERNAL_AUDITOR_ACTION_LOCK_HELD_=false;
/*****************************************************************************************
 * EntryV5.gs — RESTORE DOGET FROM LAST KNOWN WORKING ENTRY (20260514_R8_RESTORE_DOGET)
 *
 * Routes:
 * - ?action=manager
 * - ?action=auditorportal
 * - ?action=auditoravailability
 * - ?action=planningtoolkit
 * - ?action=companies
 * - ?action=diag
 *****************************************************************************************/

function V5_ENTRY_normAction_(raw) {
  var a = String(raw || '').trim().toLowerCase();
  if (a === 'manager' || a === 'managerportal') return 'manager';
  if (a === 'auditorportal' || a === 'auditor') return 'auditorportal';
  if (a === 'auditorgrid2' || a === 'auditorgrid') return 'auditorgrid2';
  if (a === 'auditoravailability' || a === 'availability') return 'auditoravailability';
  if (a === 'planningworkspace' || a === 'workspace') return 'planningworkspace';
  if (a === 'planningtoolkit' || a === 'planning' || a === 'planner' || a === 'plan') return 'planningtoolkit';
  if (a === 'companies' || a === 'company' || a === 'companyui') return 'companies';
  if (a === 'companymap' || a === 'map' || a === 'geomap') return 'companymap';
  if (a === 'diag' || a === 'diagnostics') return 'diag';
  return '';
}

var V5_ENTRY_ENV_DEFAULT = 'PROD';
var V5_ENTRY_ENV_PROP_KEY = 'AUDIT_RUNTIME_ENV';
var V5_ENTRY_ENV_CACHE_KEY = 'AUDIT_RUNTIME_ENV'; // legacy constant only; no longer used as owner

function V5_ENTRY_normEnv_(raw) {
  if (typeof ENV_norm_ === 'function') return ENV_norm_(raw);
  var env = String(raw || '').trim().toUpperCase();
  if (env === 'PROD') return 'PROD';
  if (env === 'DEV') return 'DEV';
  return '';
}

function V5_ENTRY_readProjectEnv_() {
  if (typeof ENV_getRuntimeEnv_ === 'function') return ENV_getRuntimeEnv_();
  var env = '';
  try { env = V5_ENTRY_normEnv_(PropertiesService.getScriptProperties().getProperty(V5_ENTRY_ENV_PROP_KEY)); }
  catch (err) { throw new Error('ENTRY_ENV_SCRIPT_PROPERTIES_UNAVAILABLE: ' + String(err && err.message ? err.message : err)); }
  if (!env) throw new Error('ENTRY_ENV_MISSING_RUNTIME_ENV: set Script Property ' + V5_ENTRY_ENV_PROP_KEY + ' to DEV or PROD');
  return env;
}

function V5_ENTRY_readStoredEnv_() { return V5_ENTRY_readProjectEnv_(); }
function V5_ENTRY_storeEnv_(env) {
  var runtimeEnv = V5_ENTRY_readProjectEnv_();
  var requested = V5_ENTRY_normEnv_(env);
  if (requested && requested !== runtimeEnv) throw new Error('ENTRY_ENV_OVERRIDE_BLOCKED: requested=' + requested + ', runtime=' + runtimeEnv);
  return runtimeEnv;
}
function V5_ENTRY_captureEnv_(p) {
  p = p || {};
  var explicitEnv = V5_ENTRY_normEnv_(p.env || p.environment || p.runtimeEnv || p.__env);
  var runtimeEnv = V5_ENTRY_readProjectEnv_();
  if (explicitEnv && explicitEnv !== runtimeEnv) throw new Error('ENTRY_ENV_URL_OVERRIDE_BLOCKED: requested=' + explicitEnv + ', runtime=' + runtimeEnv);
  return runtimeEnv;
}
function V5_ENTRY_appendEnvToUrl_(url, env) { return String(url || '').trim(); }
function V5_SYS_setRequestEnv_(env) { return V5_ENTRY_storeEnv_(env); }
function V5_SYS_getRequestEnv_() { return V5_ENTRY_readProjectEnv_(); }
function V5_SYS_resolveRuntimeEnv_(fallback) {
  var runtimeEnv = V5_ENTRY_readProjectEnv_();
  var fb = V5_ENTRY_normEnv_(fallback);
  if (fb && fb !== runtimeEnv) throw new Error('ENTRY_ENV_FALLBACK_CONFLICT: fallback=' + fb + ', runtime=' + runtimeEnv);
  return runtimeEnv;
}
function V5_ENTRY_isDevEnv_() {
  if (typeof ENV_isDev_ === 'function') return ENV_isDev_();
  return V5_ENTRY_normEnv_(V5_SYS_getRequestEnv_()) === 'DEV';
}

function V5_ENTRY_browserTitle_(action, roleHint) {
  action = V5_ENTRY_normAction_(action);
  var role = String(roleHint || '').trim().toLowerCase();
  if (action === 'manager') return 'AMS - Manager';
  if (action === 'auditorportal') return 'AMS - Auditor';
  if (action === 'auditorgrid2') return 'AMS - Auditor Grid 2.0';
  if (action === 'auditoravailability') return 'AMS - Availability';
  if (action === 'planningworkspace') return 'AMS - Planning Workspace';
  if (action === 'planningtoolkit') return role === 'auditor' ? 'AMS - Auditor Plan' : 'AMS - Planning';
  if (action === 'companies') return 'AMS - Companies';
  if (action === 'companymap') return 'AMS - Map';
  if (action === 'diag') return 'AMS - Diagnose';
  return 'AMS - Opening';
}

function V5_ENTRY_expectedRole_(action, roleHint) {
  if (action === 'manager') return 'Manager';
  if (action === 'auditorportal') return 'Auditor';
  if (action === 'auditorgrid2') return 'Auditor';
  if (action === 'auditoravailability') return 'Auditor';
  if (action === 'planningworkspace') return String(roleHint || '').trim().toLowerCase() === 'auditor' ? 'Auditor' : 'Manager';
  if (action === 'planningtoolkit') return String(roleHint || '').trim().toLowerCase() === 'auditor' ? 'Auditor' : 'Manager';
  if (action === 'companies') return 'Manager';
  if (action === 'companymap') return roleHint === 'Auditor' ? 'Auditor' : 'Manager';
  if (action === 'diag') return 'Manager';
  return '';
}

var V5_TEST_AUTH = {
  enabled: true,
  token: 'TEST_BYPASS_TOKEN_V5',
  deviceId: 'TEST_BYPASS_DEVICE_V5',
  testCode: '654321',
  users: {'romboutsrwj@gmail.com':'Auditor','planning@agriqa.es':'Manager'}
};
function V5_ENTRY_isAllowedTestUser_(email, expectedRole) {
  email = String(email || '').trim().toLowerCase();
  expectedRole = String(expectedRole || '').trim();
  if (!V5_TEST_AUTH || V5_TEST_AUTH.enabled !== true || !email || !expectedRole) return false;
  return String(V5_TEST_AUTH.users[email] || '') === expectedRole;
}
function V5_ENTRY_isTestBypass_(email, expectedRole, token, deviceId) {
  email = String(email || '').trim().toLowerCase(); expectedRole = String(expectedRole || '').trim(); token = String(token || '').trim(); deviceId = String(deviceId || '').trim();
  if (!V5_ENTRY_isDevEnv_()) return false;
  if (!V5_ENTRY_isAllowedTestUser_(email, expectedRole)) return false;
  return token === String(V5_TEST_AUTH.token || '') && deviceId === String(V5_TEST_AUTH.deviceId || '');
}
function V5_ENTRY_readAuthParams_(p) {
  p = p || {};
  return {email:String(p.email || '').trim().toLowerCase(),token:String(p.trustedToken || p.token || '').trim(),deviceId:String(p.deviceFingerprint || p.deviceId || '').trim()};
}
function V5_ENTRY_authJson_(p, expectedRole, onOk) {
  var auth = V5_ENTRY_readAuthParams_(p);
  if (!auth.token || !auth.deviceId) return ContentService.createTextOutput(JSON.stringify({ success:false, error:'AUTH_REQUIRED' })).setMimeType(ContentService.MimeType.JSON);
  if (V5_ENTRY_isTestBypass_(auth.email, expectedRole, auth.token, auth.deviceId)) {
    p = p || {}; p.email=auth.email; p.token=auth.token; p.trustedToken=auth.token; p.deviceId=auth.deviceId; p.deviceFingerprint=auth.deviceId; return onOk();
  }
  var authRes = null;
  try { authRes = V5_AUTH.validateTrustedTokenByRole(auth.token, expectedRole, auth.deviceId); } catch (e) { authRes = null; }
  if (!authRes || authRes.ok !== true || !authRes.email) return ContentService.createTextOutput(JSON.stringify({ success:false, error:'AUTH_REQUIRED' })).setMimeType(ContentService.MimeType.JSON);
  p = p || {}; p.email=String(authRes.email || '').trim().toLowerCase(); p.token=auth.token; p.trustedToken=auth.token; p.deviceId=auth.deviceId; p.deviceFingerprint=auth.deviceId; return onOk();
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var runtimeEnv = V5_ENTRY_captureEnv_(p); p.env = runtimeEnv;
  var rawAction = String(p.action || '').trim().toLowerCase();

  // Canonical Manager 2.0 warm relay route.
  // Own this route explicitly here; do not depend on cross-file doGet overrides.
  if (rawAction === 'externalmanageractionrelay') {
    if (typeof ExternalManagerActionRelay_verify_ !== 'function' ||
        typeof ExternalManagerActionRelay_render_ !== 'function' ||
        typeof ExternalManagerActionRelay_errorHtml_ !== 'function') {
      return HtmlService.createHtmlOutput('<pre>MANAGER_ACTION_RELAY_OWNER_UNAVAILABLE</pre>')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    var relayVerified = ExternalManagerActionRelay_verify_(p);
    if (!relayVerified || relayVerified.ok !== true) {
      return HtmlService.createHtmlOutput(
        ExternalManagerActionRelay_errorHtml_(
          relayVerified && relayVerified.error ? relayVerified.error : 'RELAY_FAILED',
          p.origin,
          p.nonce
        )
      ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return ExternalManagerActionRelay_render_(relayVerified);
  }

  var action = V5_ENTRY_normAction_(p.action);
  if (action === 'auditoravailability' && String(p.format || '').toLowerCase() === 'json') {
    return V5_ENTRY_authJson_(p, 'Auditor', function() {
      try {
        var jsonEmail = String(p.email || '').trim().toLowerCase();
        var jsonMonthKey = String(p.monthKey || '').trim();
        if (!jsonEmail) return ContentService.createTextOutput(JSON.stringify({success:false,marker:'AV5_JSON_FAIL',reason:'MISSING_EMAIL',auditorEmail:'',monthKey:jsonMonthKey})).setMimeType(ContentService.MimeType.JSON);
        if (!/^[0-9]{4}-[0-9]{2}$/.test(jsonMonthKey)) return ContentService.createTextOutput(JSON.stringify({success:false,marker:'AV5_JSON_FAIL',reason:'INVALID_MONTHKEY',auditorEmail:jsonEmail,monthKey:jsonMonthKey})).setMimeType(ContentService.MimeType.JSON);
        var forceFresh = String(p.forceFresh || '').trim().toLowerCase();
        var result = AV_getAvailabilityMonthJSON_(jsonEmail, jsonMonthKey, (forceFresh === '1' || forceFresh === 'true' || forceFresh === 'yes'));
        if (!result || typeof result !== 'object') result = { success:false, marker:'AV5_JSON_FAIL', reason:'BACKEND_EMPTY' };
        if (typeof result.marker === 'undefined') result.marker = 'AV5_JSON_OK';
        if (typeof result.execUrl === 'undefined') { try { result.execUrl = ScriptApp.getService().getUrl(); } catch(eU) { result.execUrl=''; } }
        return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({success:false,marker:'AV5_JSON_FAIL',reason:'EXCEPTION',message:String(err && err.message ? err.message : err)})).setMimeType(ContentService.MimeType.JSON);
      }
    });
  }
  if (String(p.action || '').trim()) {
    var rawAction2 = String(p.action || '').trim().toLowerCase();
    if (rawAction2 === 'manageroverview' || rawAction2 === 'overview' || rawAction2 === 'manageroverviewui' || rawAction2 === 'overviewui' || rawAction2 === 'manageroverviewcommand' || rawAction2 === 'overviewcommand') {
      return HtmlService.createHtmlOutput('<script>location.replace(' + JSON.stringify((function(){ try { return ScriptApp.getService().getUrl(); } catch(e0){ return ''; } })() + '?action=manager&ts=' + Date.now()) + ');</script>').setTitle(V5_ENTRY_browserTitle_('manager','Manager'));
    }
  }
  var expectedRole = V5_ENTRY_expectedRole_(action, p.role);
  if (!action || !expectedRole) return HtmlService.createHtmlOutput('Unknown action').setTitle('AMS - Error');
  var t = HtmlService.createTemplateFromFile('EntryBootstrapV5');
  t.__action=action; t.__auditorEmail=''; t.__monthKey=''; t.__email=String(p.email || '').trim().toLowerCase(); t.__role=String(p.role || '').trim(); t.__trustedToken=String(p.trustedToken || p.token || '').trim(); t.__deviceFingerprint=String(p.deviceFingerprint || p.deviceId || '').trim(); t.__auditId=String(p.auditId || '').trim(); t.__env=runtimeEnv;
  return t.evaluate().setTitle(V5_ENTRY_browserTitle_(action,p.role));
}

function V5_ENTRY_resolve(ctx) {
  ctx = ctx || {};
  var runtimeEnv = V5_ENTRY_captureEnv_(ctx); ctx.env=runtimeEnv;
  var action = V5_ENTRY_normAction_(ctx.action); var expectedRole = V5_ENTRY_expectedRole_(action, ctx.role);
  var email=String(ctx.email || '').trim().toLowerCase(); var token=String(ctx.trustedToken || ctx.token || '').trim(); var device=String(ctx.deviceFingerprint || ctx.deviceId || '').trim();
  if (!action || !expectedRole) return V5_ENTRY_renderLogin(action, expectedRole);
  if (!V5_ENTRY_isTestBypass_(email, expectedRole, token, device)) {
    var authRes=null; try { authRes=V5_AUTH.validateTrustedTokenByRole(token, expectedRole, device); } catch(errAuth) { return V5_ENTRY_renderLogin(action, expectedRole); }
    if (!authRes || authRes.ok !== true) return V5_ENTRY_renderLogin(action, expectedRole);
    email=String(authRes.email || '').trim().toLowerCase(); if (!email) return V5_ENTRY_renderLogin(action, expectedRole);
  }
  try { ctx.email=email; ctx.token=token; ctx.deviceId=device; ctx.trustedToken=token; ctx.deviceFingerprint=device; return V5_ENTRY_renderApp(action, ctx); }
  catch(errRender) { var msg=(errRender&&errRender.message)?errRender.message:String(errRender); return HtmlService.createHtmlOutput('<h3>Render error</h3><pre>'+msg.replace(/[<>]/g,'')+'</pre>').getContent(); }
}

function V5_ENTRY_monthKeyNow_() { var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function V5_ENTRY_renderLogin(action, expectedRole) {
  var runtimeEnv=V5_ENTRY_captureEnv_({}); var t=HtmlService.createTemplateFromFile('LoginV5');
  t.__actionAfterLogin=action; t.__expectedRole=expectedRole; t.__execUrl=(function(){try{return ScriptApp.getService().getUrl();}catch(e0){return '';}})(); t.__env=runtimeEnv; t.__appEnv=runtimeEnv;
  t.__testAuthEnabled=!!(runtimeEnv==='DEV'&&V5_TEST_AUTH&&V5_TEST_AUTH.enabled===true); t.__testCode=String((V5_TEST_AUTH&&V5_TEST_AUTH.testCode)||''); t.__testAuditorEmail='romboutsrwj@gmail.com'; t.__testManagerEmail='planning@agriqa.es'; t.__testToken=String((V5_TEST_AUTH&&V5_TEST_AUTH.token)||''); t.__testDeviceId=String((V5_TEST_AUTH&&V5_TEST_AUTH.deviceId)||'');
  return t.evaluate().getContent();
}
function V5_ENTRY_renderApp(action, ctx) {
  var runtimeEnv=V5_ENTRY_captureEnv_(ctx); var execUrl=V5_ENTRY_appendEnvToUrl_((function(){try{return ScriptApp.getService().getUrl();}catch(e0){return '';}})(),runtimeEnv);
  var email=String(ctx.email||'').trim().toLowerCase(); var role=V5_ENTRY_expectedRole_(action,ctx.role); var token=String(ctx.trustedToken||ctx.token||'').trim(); var device=String(ctx.deviceFingerprint||ctx.deviceId||'').trim();
  if (action==='manager') { var tm=HtmlService.createTemplateFromFile('ManagerV5UI'); tm.__execUrl=execUrl;tm.__email=email;tm.__role=role;tm.__trustedToken=token;tm.__deviceFingerprint=device;tm.__action=action;tm.__env=runtimeEnv;return tm.evaluate().getContent(); }
  if (action==='planningworkspace') { return PlanningWorkspaceEntryRoute_render(ctx).getContent(); }
  if (action==='planningtoolkit') { var tp=HtmlService.createTemplateFromFile('ManagerPlanningV5UI'); tp.__execUrl=execUrl;tp.__email=email;tp.__role=role;tp.__trustedToken=token;tp.__deviceFingerprint=device;tp.__action=action;tp.__env=runtimeEnv;tp.auditId=String(ctx.auditId||'').trim();return tp.evaluate().getContent(); }
  if (action==='companies') { var tc=HtmlService.createTemplateFromFile('CompaniesUI'); tc.__execUrl=execUrl;tc.__email=email;tc.__role=role;tc.__trustedToken=token;tc.__deviceFingerprint=device;tc.__action=action;tc.__env=runtimeEnv;return tc.evaluate().getContent(); }
  if (action==='companymap') { var tmx=HtmlService.createTemplateFromFile('CompanyMap'); tmx.__execUrl=execUrl;tmx.__email=email;tmx.__role=role;tmx.__trustedToken=token;tmx.__deviceFingerprint=device;tmx.__action=action;tmx.__env=runtimeEnv;return tmx.evaluate().getContent(); }
  if (action==='diag') { var td=HtmlService.createTemplateFromFile('ManagerDiagnosticsUI'); td.__execUrl=execUrl;td.__email=email;td.__role=role;td.__trustedToken=token;td.__deviceFingerprint=device;td.__action=action;td.__env=runtimeEnv;return td.evaluate().getContent(); }
  if (action==='auditorportal') { var t2=HtmlService.createTemplateFromFile('AuditorPortalV5'); t2.__UI_MODE='full';t2.__PAGE='audits';t2.__auditorEmail=email;t2.__token=token;t2.__execUrl=execUrl;t2.__email=email;t2.__role=role;t2.__trustedToken=token;t2.__deviceFingerprint=device;t2.__action=action;t2.__env=runtimeEnv;return t2.evaluate().getContent(); }
  if (action==='auditoravailability') {
    var t3=HtmlService.createTemplateFromFile('AuditorAvailabilityV5'); var avMonthKey=String(ctx.monthKey||'').trim()||V5_ENTRY_monthKeyNow_(); var avBootstrapPayload={primaryMonthKey:avMonthKey,months:{}};
    function V5_ENTRY_addMonthsToMonthKey_(monthKey,addMonths){var m=String(monthKey||'').trim().match(/^(\d{4})-(\d{2})$/);if(!m)return'';var y=Number(m[1]);var mo=Number(m[2])-1+Number(addMonths||0);while(mo<0){mo+=12;y--;}while(mo>11){mo-=12;y++;}return y+'-'+String(mo+1).padStart(2,'0');}
    try {[-1,0,1].forEach(function(offset){var mk=V5_ENTRY_addMonthsToMonthKey_(avMonthKey,offset);if(!mk)return;try{var monthPayload=AV_getAvailabilityMonthJSON_(email,mk,false);if(monthPayload&&typeof monthPayload==='object'){avBootstrapPayload.months[mk]={success:monthPayload.success===true,monthKey:String(monthPayload.monthKey||mk),days:monthPayload.days||{},blockedWeekdaysCsv:String(monthPayload.blockedWeekdaysCsv||'')};}}catch(eMonthBoot){try{Logger.log('[AV_BOOTSTRAP_WARN] month='+mk+' error='+String(eMonthBoot&&eMonthBoot.message?eMonthBoot.message:eMonthBoot));}catch(_eLogMonthBoot){}}});}catch(eBoot){try{Logger.log('[AV_BOOTSTRAP_FAIL] '+String(eBoot&&eBoot.message?eBoot.message:eBoot));}catch(_eLogBoot){}}
    t3.AV5_EXEC_URL=execUrl;t3.AV5_AUDITOR_EMAIL=email;t3.AV5_MONTHKEY=avMonthKey;t3.AV5_BOOTSTRAP_JSON=JSON.stringify(avBootstrapPayload);t3.AV5_BUILD_TS='20260517_D4_MULTIMONTH_BOOTSTRAP';t3.__UI_MODE='AVAILABILITY_ONLY';t3.__PAGE='myavailability';t3.__auditorEmail=email;t3.__token=token;t3.__execUrl=execUrl;t3.__email=email;t3.__role=role;t3.__trustedToken=token;t3.__deviceFingerprint=device;t3.__action=action;t3.__env=runtimeEnv;return t3.evaluate().getContent();
  }
  return HtmlService.createHtmlOutput('Unhandled action').getContent();
}

function RUN_ENTRY_ENV_SMOKE(){var result={ok:true,build:'2026-05-14_ENTRY_RESTORE_DOGET_R8',entryEnv:V5_ENTRY_captureEnv_({}),sysEnv:SYS_getRuntimeEnv_(),isDev:V5_ENTRY_isDevEnv_(),testLoginAllowed:V5_ENTRY_isDevEnv_(),envGuardAvailable:typeof ENV_getRuntimeEnv_==='function',source:'EntryV5 -> EnvironmentGuardService -> ScriptProperties'};Logger.log(JSON.stringify(result,null,2));return result;}
function RUN_ENTRY_TEST_LOGIN_DIAG(){var env=V5_ENTRY_captureEnv_({});var result={ok:true,build:'2026-05-14_ENTRY_RESTORE_DOGET_R8',runtimeEnv:env,testAuthEnabledConfig:!!(V5_TEST_AUTH&&V5_TEST_AUTH.enabled===true),testLoginUiShouldShow:!!(env==='DEV'&&V5_TEST_AUTH&&V5_TEST_AUTH.enabled===true),testBypassAllowedNow:V5_ENTRY_isDevEnv_(),testAuditorEmail:'romboutsrwj@gmail.com',testManagerEmail:'planning@agriqa.es'};Logger.log(JSON.stringify(result,null,2));return result;}
function RUN_ENTRY_ENV_ASSERT_DEV(){var env=V5_ENTRY_captureEnv_({});if(env!=='DEV')throw new Error('ENTRY_ENV_ASSERT_DEV_FAILED: current='+env);var result={ok:true,runtimeEnv:env,assertion:'DEV'};Logger.log(JSON.stringify(result,null,2));return result;}
function RUN_ENTRY_ENV_ASSERT_PROD(){var env=V5_ENTRY_captureEnv_({});if(env!=='PROD')throw new Error('ENTRY_ENV_ASSERT_PROD_FAILED: current='+env);var result={ok:true,runtimeEnv:env,assertion:'PROD'};Logger.log(JSON.stringify(result,null,2));return result;}

function RUN_EXTERNAL_MANAGER_ACTION_BRIDGE_CONTRACT_ACCEPTANCE() {
  var out={ok:true,build:'2026-10-01_EXTERNAL_MANAGER_GRID2_BRIDGE_CONTRACT_R7',writesPerformed:false,checks:[]};
  function check_(name,ok,detail){out.checks.push({name:name,ok:!!ok,detail:detail||''});if(!ok)out.ok=false;}
  check_('devEnvironment',V5_ENTRY_isDevEnv_(),'Bridge is DEV-only'); check_('managerAdapterAvailable',typeof managerV5Action==='function',''); check_('statusOwnerAvailable',typeof Status_applyTransition_==='function','');
  try{var adapterSource=String(managerV5Action);check_('adapterSupportsCancel',adapterSource.indexOf("cancel: 'CANCEL'")>=0,'');check_('adapterSupportsReject',adapterSource.indexOf("reject: 'REJECT'")>=0,'');}catch(eSource){check_('adapterSourceInspectable',false,String(eSource&&eSource.message?eSource.message:eSource));}
  try{var postSource=String(doPost);check_('externalBridgeRoutePresent',postSource.indexOf('externalmanageraction')>=0,'');check_('grid2EnrichmentBridgePresent',postSource.indexOf('externalmanageropenenriched')>=0,'');check_('grid2ExtensionBridgePresent',postSource.indexOf('externalmanagerextension')>=0,'');check_('externalBridgeRejectsLegacyDeny',postSource.indexOf("managerAction !== 'approve' && managerAction !== 'cancel' && managerAction !== 'reject'")>=0,'');check_('externalBridgeRequiresReason',postSource.indexOf('ACTION_REASON_REQUIRED')>=0,'');}catch(ePostSource){check_('externalBridgeSourceInspectable',false,String(ePostSource&&ePostSource.message?ePostSource.message:ePostSource));}
  if(typeof Status_applyTransition_==='function'){var a=Status_applyTransition_({status:'Pending Approval',action:'CANCEL',role:'MANAGER'}),b=Status_applyTransition_({status:'Approved',action:'CANCEL',role:'MANAGER'}),c=Status_applyTransition_({status:'Accepted',action:'CANCEL',role:'MANAGER'}),d=Status_applyTransition_({status:'Pending Planning',action:'REJECT',role:'MANAGER'}),f=Status_applyTransition_({status:'Accepted',action:'REJECT',role:'MANAGER'});check_('cancelPendingApprovalToPlanning',!!(a&&a.ok&&a.afterStatus==='PENDING_PLANNING'),JSON.stringify(a||{}));check_('cancelApprovedToPlanning',!!(b&&b.ok&&b.afterStatus==='PENDING_PLANNING'),JSON.stringify(b||{}));check_('cancelAcceptedToPlanning',!!(c&&c.ok&&c.afterStatus==='PENDING_PLANNING'),JSON.stringify(c||{}));check_('rejectPendingPlanningToRejected',!!(d&&d.ok&&d.afterStatus==='REJECTED'),JSON.stringify(d||{}));check_('rejectAcceptedToRejected',!!(f&&f.ok&&f.afterStatus==='REJECTED'),JSON.stringify(f||{}));}
  var props=PropertiesService.getScriptProperties();var bridgeKey=String(props.getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')||'').trim();check_('bridgeKeyConfigured',bridgeKey.length>=32,bridgeKey?'configured':'missing');try{Logger.log(JSON.stringify(out,null,2));}catch(eLog){}return out;
}

function V5_ENTRY_externalBridgeBody_(e) {
  var props=PropertiesService.getScriptProperties(),expectedKey=String(props.getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')||'').trim(),body={};
  try{body=JSON.parse(String((e&&e.postData&&e.postData.contents)||'{}'));}catch(eJson){return{ok:false,response:ContentService.createTextOutput(JSON.stringify({success:false,error:'BAD_JSON'})).setMimeType(ContentService.MimeType.JSON)};}
  var suppliedKey=String(body.bridgeKey||'').trim();
  if(!expectedKey||!suppliedKey||expectedKey!==suppliedKey)return{ok:false,response:ContentService.createTextOutput(JSON.stringify({success:false,error:'BRIDGE_UNAUTHORIZED'})).setMimeType(ContentService.MimeType.JSON)};
  delete body.bridgeKey;
  return{ok:true,body:body};
}

function doPost(e) {
  var p=(e&&e.parameter)?e.parameter:{};
  var rawAction=String(p.action||'').trim().toLowerCase();
  // Cloud Run is the only browser-facing login surface. This endpoint is a DEV-only
  // server-to-server bridge; requests require the configured write-bridge key.
  if(rawAction==='externalauthrequestcode'||rawAction==='externalauthverifycode') {
    var authResponse=function(payload){return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);};
    if(!V5_ENTRY_isDevEnv_())return authResponse({ok:false,error:'DEV_ONLY'});
    var bridge=V5_ENTRY_externalBridgeBody_(e);
    if(!bridge.ok)return bridge.response;
    var body=bridge.body||{},email=String(body.email||'').trim().toLowerCase();
    if(!email||email.length>254)return authResponse({ok:false,error:'EMAIL_REQUIRED'});
    try {
      if(rawAction==='externalauthrequestcode'){
        var requested=V5_AUTH.requestLoginCode(email);
        return authResponse({ok:requested.ok===true,error:requested.error||'',role:requested.role||'',retryAfterSeconds:requested.retryAfterSeconds||0,throttled:requested.throttled===true});
      }
      var code=String(body.code||'').trim(),role=String(body.role||'').trim(),deviceId=String(body.deviceId||'').trim();
      if(!/^\d{6}$/.test(code)||!deviceId||deviceId.length>200)return authResponse({ok:false,error:'INVALID_LOGIN_INPUT'});
      var verified=V5_AUTH.verifyLoginCode(email,code,'',body.remember===true,deviceId,'Cloud Run portal 2.0');
      if(verified.ok!==true)return authResponse({ok:false,error:verified.error||'INVALID_OR_EXPIRED_CODE'});
      return authResponse({ok:true,role:verified.role,token:verified.token,expiresAt:verified.expiresAt});
    }catch(authError){return authResponse({ok:false,error:'AUTHENTICATION_UNAVAILABLE'});}
  }
  if(rawAction==='externalnotification20'){
    var reply=function(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);};
    if(!V5_ENTRY_isDevEnv_())return reply({ok:false,error:'DEV_ONLY'});
    var bridge=V5_ENTRY_externalBridgeBody_(e);
    if(!bridge.ok)return bridge.response;
    var b=bridge.body||{};
    if(String(b.actorRole||'').toLowerCase()!=='manager'||!String(b.actorEmail||'').includes('@'))return reply({ok:false,error:'MANAGER_REQUIRED'});
    try{
      if(b.operation==='preview')return reply({ok:true,preview:NotificationTestMail20_Preview(b.eventKey)});
      if(b.operation==='sendTest')return reply(NotificationTestMail20_Send(b.eventKey));
      if(b.operation==='updateEvent')return reply(NotificationManagement20_UpdateEvent(b.eventKey,b.changes,b.expected));
      if(b.operation==='updateRule')return reply(NotificationManagement20_UpdateRule(b.ruleKey,b.value,b.expected,b.actorEmail));
      if(b.operation==='updateDigestBuffer')return reply(NotificationManagement20_UpdateDigestBuffer(b.eventKey,b.minutes,b.expected,b.actorEmail));
      if(b.operation==='updateDevMode')return reply(NotificationManagement20_UpdateDevMode(b.mode,b.expected,b.actorEmail));
      return reply({ok:false,error:'INVALID_OPERATION'});
    }catch(err){return reply({ok:false,error:String(err.message||'NOTIFICATION_FAILED').slice(0,120)});}
  }
  if(rawAction==='versioncheck')return ContentService.createTextOutput(JSON.stringify({ok:true,build:'2026-10-01_ENTRYV5_GRID2_BRIDGES_R2',runtimeEnv:V5_ENTRY_readProjectEnv_()})).setMimeType(ContentService.MimeType.JSON);

  if (rawAction === 'externalplanningworkspace') {
    var planningMode = String(p.mode || '').trim().toLowerCase();
    if (planningMode === 'commit') {
      if(!V5_ENTRY_isDevEnv_())return ContentService.createTextOutput(JSON.stringify({success:false,error:'DEV_ONLY'})).setMimeType(ContentService.MimeType.JSON);
      if (typeof ExternalPlanningWorkspaceHandoff_verify_ !== 'function' || typeof ExternalPlanningWorkspaceHandoff_render_ !== 'function') return ContentService.createTextOutput(JSON.stringify({success:false,error:'HANDOFF_OWNER_UNAVAILABLE'})).setMimeType(ContentService.MimeType.JSON);
      var commitVerified = ExternalPlanningWorkspaceHandoff_verify_(p);
      if (!commitVerified || commitVerified.ok !== true) return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><title>AMS - Planning commit RCA</title><h3>Planning Workspace handoff failed</h3><pre>'+String((commitVerified&&commitVerified.error)||'HANDOFF_FAILED').replace(/[<>]/g,'')+'\nkeyFingerprint='+String((commitVerified&&commitVerified.keyFingerprint)||'').replace(/[<>]/g,'')+'\nmode='+String((commitVerified&&commitVerified.mode)||planningMode).replace(/[<>]/g,'')+'</pre>').setTitle('AMS - Planning commit RCA');
      try { return ExternalPlanningWorkspaceHandoff_render_(commitVerified); }
      catch (errCommit) { return ContentService.createTextOutput(JSON.stringify({success:false,error:'PLANNING_WORKSPACE_COMMIT_FAILED',message:String(errCommit&&errCommit.message?errCommit.message:errCommit)})).setMimeType(ContentService.MimeType.JSON); }
    }
    if (typeof ExternalPlanningWorkspaceHandoff_verify_ !== 'function' || typeof ExternalPlanningWorkspaceHandoff_render_ !== 'function') return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title><h3>Planning Workspace handoff failed</h3><pre>HANDOFF_OWNER_UNAVAILABLE</pre>').setTitle('AMS - Planning Workspace');
    var verified = ExternalPlanningWorkspaceHandoff_verify_(p);
    if (!verified || verified.ok !== true) return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title><h3>Planning Workspace handoff failed</h3><pre>'+String((verified&&verified.error)||'HANDOFF_FAILED').replace(/[<>]/g,'')+'</pre>').setTitle('AMS - Planning Workspace');
    try { return ExternalPlanningWorkspaceHandoff_render_(verified); }
    catch (errPlanning) {
      if (verified && (verified.mode === 'commit' || verified.mode === 'rotation')) return ContentService.createTextOutput(JSON.stringify({success:false,error:'PLANNING_WORKSPACE_'+String(verified.mode||'REQUEST').toUpperCase()+'_FAILED',message:String(errPlanning&&errPlanning.message?errPlanning.message:errPlanning)})).setMimeType(ContentService.MimeType.JSON);
      return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><title>AMS - Planning Workspace</title><h3>Planning Workspace failed to open</h3><pre>'+String(errPlanning&&errPlanning.message?errPlanning.message:errPlanning).replace(/[<>]/g,'')+'</pre>').setTitle('AMS - Planning Workspace');
    }
  }

  if(rawAction==='externalmanageropenenriched'||rawAction==='externalmanagerextension') {
    if(!V5_ENTRY_isDevEnv_())return ContentService.createTextOutput(JSON.stringify({success:false,error:'DEV_ONLY'})).setMimeType(ContentService.MimeType.JSON);
    var bridge=V5_ENTRY_externalBridgeBody_(e);if(!bridge.ok)return bridge.response;var gridBody=bridge.body||{},actorEmail=String(gridBody.actorEmail||'').trim().toLowerCase();
    if(!actorEmail)return ContentService.createTextOutput(JSON.stringify({success:false,error:'MISSING_ACTOR_EMAIL'})).setMimeType(ContentService.MimeType.JSON);
    if(rawAction==='externalmanageropenenriched') {
      var auditIds=Array.isArray(gridBody.auditIds)?gridBody.auditIds:[];
      if(typeof OpenAuditsGrid2_getEnriched!=='function')return ContentService.createTextOutput(JSON.stringify({success:false,error:'GRID2_ENRICHMENT_OWNER_UNAVAILABLE'})).setMimeType(ContentService.MimeType.JSON);
      var enriched=OpenAuditsGrid2_getEnriched(auditIds);return ContentService.createTextOutput(JSON.stringify(enriched||{success:false,error:'EMPTY_RESULT'})).setMimeType(ContentService.MimeType.JSON);
    }
    var extAuditId=String(gridBody.auditId||'').trim(),command=String(gridBody.command||'').trim().toLowerCase();
    if(!extAuditId||!command)return ContentService.createTextOutput(JSON.stringify({success:false,error:'MISSING_REQUIRED_FIELDS'})).setMimeType(ContentService.MimeType.JSON);
    if(command!=='apply'&&command!=='undo')return ContentService.createTextOutput(JSON.stringify({success:false,error:'EXTENSION_COMMAND_NOT_ALLOWED'})).setMimeType(ContentService.MimeType.JSON);
    if(typeof OpenAuditsGrid2_applyExtension!=='function')return ContentService.createTextOutput(JSON.stringify({success:false,error:'GRID2_EXTENSION_OWNER_UNAVAILABLE'})).setMimeType(ContentService.MimeType.JSON);
    var extResult=OpenAuditsGrid2_applyExtension(extAuditId,command);return ContentService.createTextOutput(JSON.stringify(extResult||{success:false,error:'EMPTY_RESULT'})).setMimeType(ContentService.MimeType.JSON);
  }


  // Notifications 2.0: authenticated Cloud Run Auditor action writer.
  // Cloud Run verifies its Remember-me session, role, visibility and capability.
  // GAS independently verifies DEV ownership, current Auditor UID, assignment,
  // canonical state and optimistic revision before invoking StatusMachine.
  if (rawAction==='externalauditoraction20') {
    var acceptT020=Date.now(),acceptStages20={},acceptPhase20='start';
    var respond20=function(x){if(String(typeof action20==='undefined'?'':action20)==='ACCEPT'){x=x||{};x.acceptPerf={totalMs:Date.now()-acceptT020,phase:acceptPhase20,stages:acceptStages20};console.log(JSON.stringify({event:'AMS_ACCEPT_GAS_TIMING_20',auditId:id20||'',success:x.success===true,error:x.error||'',...x.acceptPerf}));}return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);};
    if(!V5_ENTRY_isDevEnv_())return respond20({success:false,error:'DEV_ONLY'});
    var auth20=V5_ENTRY_externalBridgeBody_(e);if(!auth20.ok)return auth20.response;
    var req20=auth20.body||{},email20=String(req20.actorEmail||'').trim().toLowerCase(),
      uid20=String(req20.auditorUid||'').trim(),id20=String(req20.auditId||'').trim(),
      action20=String(req20.action||'').trim().toUpperCase(),revision20=String(req20.expectedRevision||'').trim(),
      reason20=String(req20.comment||'').trim();
    if(!email20||!uid20||!id20||!revision20||!(/^[a-f0-9]{24}$/.test(revision20))||!['ACCEPT','CANCEL'].includes(action20))return respond20({success:false,error:'INVALID_AUDITOR_ACTION_REQUEST'});
    if(action20==='CANCEL'&&!reason20)return respond20({success:false,error:'CANCEL_REASON_REQUIRED'});
    var lock20=LockService.getScriptLock();
    if(!lock20.tryLock(10000))return respond20({success:false,error:'ACTION_BUSY'});
    acceptStages20.lockWaitMs=Date.now()-acceptT020;acceptPhase20='locked';
    AMS_EXTERNAL_AUDITOR_ACTION_LOCK_HELD_=true;
    try{
      var ss20=SpreadsheetApp.getActiveSpreadsheet();
      if(!ss20||ss20.getId()!=='1NhgaGxCU3BsEPMlKk14Iiz2XbPedS3e9sXI7OzeOJRs')return respond20({success:false,error:'DEV_SPREADSHEET_MISMATCH'});
      var a20=ss20.getSheetByName('Auditors'),p20=ss20.getSheetByName('Audit planning');
      if(!a20||!p20)return respond20({success:false,error:'CANONICAL_SHEET_MISSING'});
      // Resolve one canonical Auditor row by immutable UID; never transfer the full roster.
      var ah20=a20.getRange(1,1,1,a20.getLastColumn()).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
      var aix20=function(n){return ah20.indexOf(n);};
      var auidCol20=aix20('Auditor_UID');
      if([auidCol20,aix20('E-mail'),aix20('Active'),aix20('Role')].some(function(i){return i<0;}))return respond20({success:false,error:'AUDITOR_IDENTITY_HEADERS_MISSING'});
      var auditorHits20=a20.getRange(2,auidCol20+1,Math.max(1,a20.getLastRow()-1),1).createTextFinder(uid20).matchEntireCell(true).matchCase(true).findAll();
      acceptStages20.auditorLookupMs=Date.now()-acceptT020-acceptStages20.lockWaitMs;
      if(auditorHits20.length!==1)return respond20({success:false,error:'AUDITOR_IDENTITY_NOT_CURRENT'});
      var rowAud20=a20.getRange(auditorHits20[0].getRow(),1,1,ah20.length).getDisplayValues()[0];
      if(String(rowAud20[aix20('E-mail')]||'').trim().toLowerCase()!==email20||String(rowAud20[aix20('Active')]||'').trim().toUpperCase()!=='YES'||String(rowAud20[aix20('Role')]||'').trim().toUpperCase()!=='AUDITOR')return respond20({success:false,error:'AUDITOR_IDENTITY_NOT_CURRENT'});
      // Audit-ID lookup uses an exact text finder, then only one row is read.
      var ph20=p20.getRange(1,1,1,p20.getLastColumn()).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
      var ix20=function(names){for(var i=0;i<names.length;i++){var j=ph20.indexOf(names[i]);if(j>=0)return j;}return -1;};
      var ai20=ix20(['Audit ID','Audit_ID','AuditId','Audit Id']),si20=ix20(['Status']),as20=ix20(['Assigned to','Assigned auditor','Auditor']),pi20=ix20(['Planning JSON','Planning_JSON']),di20=ix20(['Last decision timestamp']),ti20=ix20(['Status since']);
      if([ai20,si20,as20,pi20,di20,ti20,ix20(['Auditor_UID','Auditor UID'])].some(function(x){return x<0;}))return respond20({success:false,error:'REVISION_HEADERS_MISSING'});
      var auditHits20=p20.getRange(2,ai20+1,Math.max(1,p20.getLastRow()-1),1).createTextFinder(id20).matchEntireCell(true).matchCase(true).findAll();
      acceptStages20.auditLookupMs=Date.now()-acceptT020-acceptStages20.lockWaitMs-acceptStages20.auditorLookupMs;
      if(auditHits20.length!==1)return respond20({success:false,error:'AUDIT_UNAVAILABLE'});
      var current20=p20.getRange(auditHits20[0].getRow(),1,1,ph20.length).getDisplayValues()[0],
        assigned20=String(current20[as20]||'').trim().toLowerCase(),
        identities20=[email20,uid20,String(rowAud20[aix20('Name')]||'').trim().toLowerCase(),String(rowAud20[aix20('Abbreviation')]||'').trim().toLowerCase()];
      if(!assigned20||identities20.indexOf(assigned20)<0)return respond20({success:false,error:'AUDITOR_ASSIGNMENT_MISMATCH'});
      if(String(current20[ix20(['Auditor_UID','Auditor UID'])]||'').trim()!==uid20)return respond20({success:false,error:'AUDITOR_UID_ASSIGNMENT_MISMATCH'});
      var status20=String(current20[si20]||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
      if(!((action20==='ACCEPT'&&status20==='APPROVED')||(action20==='CANCEL'&&status20==='PENDING_APPROVAL')))return respond20({success:false,error:'ACTION_NOT_ALLOWED_FOR_STATUS'});
      var snapshot20=[id20,String(current20[si20]||'').trim(),String(current20[as20]||'').trim(),String(current20[pi20]||'').trim(),String(current20[di20]||'').trim(),String(current20[ti20]||'').trim()].join('|');
      var digest20=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,snapshot20,Utilities.Charset.UTF_8);
      var currentRevision20=digest20.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('').slice(0,24);
      if(currentRevision20!==revision20)return respond20({success:false,error:'AUDIT_REVISION_CONFLICT'});
      if(typeof Status_applyAction!=='function')return respond20({success:false,error:'CANONICAL_STATUS_MACHINE_UNAVAILABLE'});
      AMS_EXTERNAL_AUDITOR_VERIFIED_ROW_={auditId:id20,rowNumber:auditHits20[0].getRow(),sheet:p20,hdr:ph20,row:current20,lastCol:ph20.length};
      acceptPhase20='status_machine';
      var statusT020=Date.now();
      var outcome20=Status_applyAction('AUDITOR',action20,id20,{actorRole:'AUDITOR',actorEmail:email20,auditorUid:uid20,reason:reason20,comment:reason20,rowIndex:auditHits20[0].getRow()});
      acceptStages20.statusMachineMs=Date.now()-statusT020;if(action20==='ACCEPT'&&outcome20&&outcome20.canonicalWriteTiming){acceptStages20.canonicalWrite=outcome20.canonicalWriteTiming;acceptStages20.statusNotificationMs=outcome20.statusPerf&&outcome20.statusPerf.notificationOnlyMs;acceptStages20.statusCoreMs=outcome20.statusPerf&&outcome20.statusPerf.coreMs;acceptStages20.statusBreakdown=outcome20.statusPerf||null;}acceptPhase20='complete';
      return respond20(outcome20||{success:false,error:'CANONICAL_ACTION_EMPTY'});
    }catch(ex20){return respond20({success:false,error:'AUDITOR_ACTION_FAILED',detail:String(ex20&&ex20.message||ex20).slice(0,160)});}
    finally{AMS_EXTERNAL_AUDITOR_VERIFIED_ROW_=null;AMS_EXTERNAL_AUDITOR_ACTION_LOCK_HELD_=false;lock20.releaseLock();}
  }
  // Issue #45 — DEV-only server-to-server Planning 2.0 canonical commit.
  // Cloud Run authenticates the caller; GAS verifies the independent write bridge key.
  if (rawAction==='externalcanonicalplan20') {
    var replyCanonicalPlan20=function(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);};
    if(!V5_ENTRY_isDevEnv_())return replyCanonicalPlan20({success:false,error:'DEV_ONLY'});
    var verifiedCanonicalPlan20=V5_ENTRY_externalBridgeBody_(e);
    if(!verifiedCanonicalPlan20.ok)return verifiedCanonicalPlan20.response;
    var inputCanonicalPlan20=verifiedCanonicalPlan20.body||{},planActor20=String(inputCanonicalPlan20.actorRole||'').trim().toUpperCase();
    if(planActor20!=='MANAGER'&&planActor20!=='AUDITOR')return replyCanonicalPlan20({success:false,error:'ACTOR_ROLE_FORBIDDEN'});
    if(!String(inputCanonicalPlan20.actorEmail||'').trim()||!String(inputCanonicalPlan20.auditId||'').trim()||!String(inputCanonicalPlan20.expectedRevision||'').trim())return replyCanonicalPlan20({success:false,error:'CANONICAL_PLAN_REQUIRED_FIELDS_MISSING'});
    if(planActor20==='AUDITOR'&&String(inputCanonicalPlan20.auditorEmail||'').trim().toLowerCase()!==String(inputCanonicalPlan20.actorEmail||'').trim().toLowerCase())return replyCanonicalPlan20({success:false,error:'AUDITOR_CANNOT_PLAN_FOR_OTHER_AUDITOR'});
    if(!/^PRT1-[a-f0-9]{40}$/i.test(String(inputCanonicalPlan20.expectedRevision||'')))return replyCanonicalPlan20({success:false,error:'CANONICAL_PLAN_REVISION_FORMAT_REQUIRED'});
    if(typeof PlanningCanonicalCommitService_commit!=='function')return replyCanonicalPlan20({success:false,error:'CANONICAL_PLANNING_OWNER_UNAVAILABLE'});
    try{return replyCanonicalPlan20(PlanningCanonicalCommitService_commit(inputCanonicalPlan20));}
    catch(canonicalPlan20Error){return replyCanonicalPlan20({success:false,error:'CANONICAL_PLAN_COMMIT_FAILED',detail:String(canonicalPlan20Error&&canonicalPlan20Error.message||canonicalPlan20Error).slice(0,180)});}
  }

  if (rawAction==='externalmanageraction') {
    if(!V5_ENTRY_isDevEnv_())return ContentService.createTextOutput(JSON.stringify({success:false,error:'DEV_ONLY'})).setMimeType(ContentService.MimeType.JSON);
    var actionBridge=V5_ENTRY_externalBridgeBody_(e);if(!actionBridge.ok)return actionBridge.response;var body=actionBridge.body||{};
    var actorEmail=String(body.actorEmail||'').trim().toLowerCase();var auditId=String(body.auditId||'').trim();var managerAction=String(body.managerAction||body.action||'').trim().toLowerCase();var options=body.options&&typeof body.options==='object'?body.options:{};
    if(!actorEmail||!auditId||!managerAction)return ContentService.createTextOutput(JSON.stringify({success:false,error:'MISSING_REQUIRED_FIELDS'})).setMimeType(ContentService.MimeType.JSON);
    if(managerAction!=='approve'&&managerAction!=='cancel'&&managerAction!=='reject'&&managerAction!=='edit_realized_hours')return ContentService.createTextOutput(JSON.stringify({success:false,error:'MANAGER_PORTAL_ACTION_NOT_ALLOWED'})).setMimeType(ContentService.MimeType.JSON);
    if((managerAction==='cancel'||managerAction==='reject')&&!String(options.reason||options.comment||'').trim())return ContentService.createTextOutput(JSON.stringify({success:false,error:'ACTION_REASON_REQUIRED'})).setMimeType(ContentService.MimeType.JSON);
    options.actorEmail=actorEmail;options.managerEmail=actorEmail;options.externalSession=true;var result=managerV5Action(auditId,managerAction,options);return ContentService.createTextOutput(JSON.stringify(result||{success:false,error:'EMPTY_RESULT'})).setMimeType(ContentService.MimeType.JSON);
  }
  if(rawAction==='manageroverviewcommand'||rawAction==='overviewcommand')return ContentService.createTextOutput(JSON.stringify({success:false,error:'OVERVIEW_COMMAND_DEPRECATED',redirectAction:'manager'})).setMimeType(ContentService.MimeType.JSON);
  return ContentService.createTextOutput(JSON.stringify({success:false,error:'UNHANDLED_POST'})).setMimeType(ContentService.MimeType.JSON);
}
