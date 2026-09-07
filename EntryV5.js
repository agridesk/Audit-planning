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
  if (a === 'auditoravailability' || a === 'availability') return 'auditoravailability';
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
  if (typeof ENV_getRuntimeEnv_ === 'function') {
    return ENV_getRuntimeEnv_();
  }

  var env = '';
  try {
    env = V5_ENTRY_normEnv_(PropertiesService.getScriptProperties().getProperty(V5_ENTRY_ENV_PROP_KEY));
  } catch (err) {
    throw new Error('ENTRY_ENV_SCRIPT_PROPERTIES_UNAVAILABLE: ' + String(err && err.message ? err.message : err));
  }

  if (!env) {
    throw new Error('ENTRY_ENV_MISSING_RUNTIME_ENV: set Script Property ' + V5_ENTRY_ENV_PROP_KEY + ' to DEV or PROD');
  }

  return env;
}

function V5_ENTRY_readStoredEnv_() {
  // Legacy compatibility shim.
  // Runtime ENV is no longer read from cache or user properties.
  return V5_ENTRY_readProjectEnv_();
}

function V5_ENTRY_storeEnv_(env) {
  // Legacy compatibility shim.
  // Runtime ENV is owned only by Script Properties via EnvironmentGuardService.
  var runtimeEnv = V5_ENTRY_readProjectEnv_();
  var requested = V5_ENTRY_normEnv_(env);

  if (requested && requested !== runtimeEnv) {
    throw new Error('ENTRY_ENV_OVERRIDE_BLOCKED: requested=' + requested + ', runtime=' + runtimeEnv);
  }

  return runtimeEnv;
}

function V5_ENTRY_captureEnv_(p) {
  p = p || {};

  // URL/env parameters no longer own runtime.
  // If present and conflicting, fail loud.
  var explicitEnv = V5_ENTRY_normEnv_(p.env || p.environment || p.runtimeEnv || p.__env);
  var runtimeEnv = V5_ENTRY_readProjectEnv_();

  if (explicitEnv && explicitEnv !== runtimeEnv) {
    throw new Error('ENTRY_ENV_URL_OVERRIDE_BLOCKED: requested=' + explicitEnv + ', runtime=' + runtimeEnv);
  }

  return runtimeEnv;
}

function V5_ENTRY_appendEnvToUrl_(url, env) {
  // With separated DEV/PROD URLs the URL itself is already the environment.
  // Do not append ?env=... anymore.
  return String(url || '').trim();
}

/**
 * Runtime environment bridge used by backend/config/diagnostics code.
 * Kept for compatibility; delegates to EnvironmentGuardService.
 */
function V5_SYS_setRequestEnv_(env) {
  return V5_ENTRY_storeEnv_(env);
}

function V5_SYS_getRequestEnv_() {
  return V5_ENTRY_readProjectEnv_();
}

function V5_SYS_resolveRuntimeEnv_(fallback) {
  var runtimeEnv = V5_ENTRY_readProjectEnv_();
  var fb = V5_ENTRY_normEnv_(fallback);

  if (fb && fb !== runtimeEnv) {
    throw new Error('ENTRY_ENV_FALLBACK_CONFLICT: fallback=' + fb + ', runtime=' + runtimeEnv);
  }

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
  if (action === 'auditoravailability') return 'AMS - Availability';
  if (action === 'planningtoolkit') return role === 'auditor' ? 'AMS - Auditor Plan' : 'AMS - Planning';
  if (action === 'companies') return 'AMS - Companies';
  if (action === 'companymap') return 'AMS - Map';
  if (action === 'diag') return 'AMS - Diagnose';
  return 'AMS - Opening';
}

function V5_ENTRY_expectedRole_(action, roleHint) {
  if (action === 'manager') return 'Manager';
  if (action === 'auditorportal') return 'Auditor';
  if (action === 'auditoravailability') return 'Auditor';
  if (action === 'planningtoolkit') {
    var rh = String(roleHint || '').trim().toLowerCase();
    return (rh === 'auditor') ? 'Auditor' : 'Manager';
  }
  if (action === 'companies') return 'Manager';
  if (action === 'companymap') return roleHint === 'Auditor' ? 'Auditor' : 'Manager';
  if (action === 'diag') return 'Manager';
  return '';
}

var V5_TEST_AUTH = {
  enabled: true, // DEV ONLY — additionally guarded by runtime environment
  token: 'TEST_BYPASS_TOKEN_V5',
  deviceId: 'TEST_BYPASS_DEVICE_V5',
  testCode: '654321',
  users: {
    'romboutsrwj@gmail.com': 'Auditor',
    'planning@agriqa.es': 'Manager'
  }
};

function V5_ENTRY_isAllowedTestUser_(email, expectedRole) {
  email = String(email || '').trim().toLowerCase();
  expectedRole = String(expectedRole || '').trim();
  if (!V5_TEST_AUTH || V5_TEST_AUTH.enabled !== true) return false;
  if (!email || !expectedRole) return false;
  return String(V5_TEST_AUTH.users[email] || '') === expectedRole;
}

function V5_ENTRY_isTestBypass_(email, expectedRole, token, deviceId) {
  email = String(email || '').trim().toLowerCase();
  expectedRole = String(expectedRole || '').trim();
  token = String(token || '').trim();
  deviceId = String(deviceId || '').trim();

  // Hard guard: test bypass is never accepted outside DEV.
  if (!V5_ENTRY_isDevEnv_()) return false;

  if (!V5_ENTRY_isAllowedTestUser_(email, expectedRole)) return false;
  return token === String(V5_TEST_AUTH.token || '') && deviceId === String(V5_TEST_AUTH.deviceId || '');
}

function V5_ENTRY_readAuthParams_(p) {
  p = p || {};
  return {
    email: String(p.email || '').trim().toLowerCase(),
    token: String(p.trustedToken || p.token || '').trim(),
    deviceId: String(p.deviceFingerprint || p.deviceId || '').trim()
  };
}

function V5_ENTRY_authJson_(p, expectedRole, onOk) {
  var auth = V5_ENTRY_readAuthParams_(p);
  if (!auth.token || !auth.deviceId) {
    return ContentService.createTextOutput(JSON.stringify({ success:false, error:'AUTH_REQUIRED' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (V5_ENTRY_isTestBypass_(auth.email, expectedRole, auth.token, auth.deviceId)) {
    p = p || {};
    p.email = auth.email;
    p.token = auth.token;
    p.trustedToken = auth.token;
    p.deviceId = auth.deviceId;
    p.deviceFingerprint = auth.deviceId;
    return onOk();
  }

  var authRes = null;
  try {
    authRes = V5_AUTH.validateTrustedTokenByRole(auth.token, expectedRole, auth.deviceId);
  } catch (e) {
    authRes = null;
  }

  if (!authRes || authRes.ok !== true || !authRes.email) {
    return ContentService.createTextOutput(JSON.stringify({ success:false, error:'AUTH_REQUIRED' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  p = p || {};
  p.email = String(authRes.email || '').trim().toLowerCase();
  p.token = auth.token;
  p.trustedToken = auth.token;
  p.deviceId = auth.deviceId;
  p.deviceFingerprint = auth.deviceId;

  return onOk();
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var runtimeEnv = V5_ENTRY_captureEnv_(p);
  p.env = runtimeEnv;
  var action = V5_ENTRY_normAction_(p.action);


  if (action === 'auditoravailability' && String(p.format || '').toLowerCase() === 'json') {
    return V5_ENTRY_authJson_(p, 'Auditor', function() {
      try {
        var jsonEmail = String(p.email || '').trim().toLowerCase();
        var jsonMonthKey = String(p.monthKey || '').trim();

        if (!jsonEmail) {
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            marker: 'AV5_JSON_FAIL',
            reason: 'MISSING_EMAIL',
            auditorEmail: '',
            monthKey: jsonMonthKey
          })).setMimeType(ContentService.MimeType.JSON);
        }

        if (!/^[0-9]{4}-[0-9]{2}$/.test(jsonMonthKey)) {
          return ContentService.createTextOutput(JSON.stringify({
            success: false,
            marker: 'AV5_JSON_FAIL',
            reason: 'INVALID_MONTHKEY',
            auditorEmail: jsonEmail,
            monthKey: jsonMonthKey
          })).setMimeType(ContentService.MimeType.JSON);
        }

        var forceFresh = String(p.forceFresh || '').trim().toLowerCase();
        var result = AV_getAvailabilityMonthJSON_(jsonEmail, jsonMonthKey, (forceFresh === '1' || forceFresh === 'true' || forceFresh === 'yes'));
        if (!result || typeof result !== 'object') {
          result = { success: false, marker: 'AV5_JSON_FAIL', reason: 'BACKEND_EMPTY' };
        }
        if (typeof result.marker === 'undefined') result.marker = 'AV5_JSON_OK';
        if (typeof result.execUrl === 'undefined') {
          try { result.execUrl = ScriptApp.getService().getUrl(); } catch(eU) { result.execUrl = ''; }
        }
        return ContentService.createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);

      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          marker: 'AV5_JSON_FAIL',
          reason: 'EXCEPTION',
          message: String(err && err.message ? err.message : err)
        })).setMimeType(ContentService.MimeType.JSON);
      }
    });
  }

  if (String(p.action || '').trim()) {
    var rawAction = String(p.action || '').trim().toLowerCase();
    if (rawAction === 'manageroverview' || rawAction === 'overview' ||
        rawAction === 'manageroverviewui' || rawAction === 'overviewui' ||
        rawAction === 'manageroverviewcommand' || rawAction === 'overviewcommand') {
      return HtmlService.createHtmlOutput(
        '<script>location.replace(' +
        JSON.stringify((function(){ try { return ScriptApp.getService().getUrl(); } catch(e0){ return ''; } })() + '?action=manager&ts=' + Date.now()) +
        ');</script>'
      ).setTitle(V5_ENTRY_browserTitle_('manager', 'Manager'));
    }
  }

  var expectedRole = V5_ENTRY_expectedRole_(action, p.role);
  if (!action || !expectedRole) {
    return HtmlService.createHtmlOutput('Unknown action').setTitle('AMS - Error');
  }

  var t = HtmlService.createTemplateFromFile('EntryBootstrapV5');
  t.__action = action;
  t.__auditorEmail = '';
  t.__monthKey = '';
  t.__email = String(p.email || '').trim().toLowerCase();
  t.__role = String(p.role || '').trim();
  t.__trustedToken = String(p.trustedToken || p.token || '').trim();
  t.__deviceFingerprint = String(p.deviceFingerprint || p.deviceId || '').trim();
  t.__auditId = String(p.auditId || '').trim();
  t.__env = runtimeEnv;

  return t.evaluate().setTitle(V5_ENTRY_browserTitle_(action, p.role));
}

function V5_ENTRY_resolve(ctx) {
  ctx = ctx || {};
  var runtimeEnv = V5_ENTRY_captureEnv_(ctx);
  ctx.env = runtimeEnv;
  var action = V5_ENTRY_normAction_(ctx.action);
  var expectedRole = V5_ENTRY_expectedRole_(action, ctx.role);

  var email  = String(ctx.email || '').trim().toLowerCase();
  var token  = String(ctx.trustedToken || ctx.token || '').trim();
  var device = String(ctx.deviceFingerprint || ctx.deviceId || '').trim();

  if (!action || !expectedRole) {
    return V5_ENTRY_renderLogin(action, expectedRole);
  }

  if (!V5_ENTRY_isTestBypass_(email, expectedRole, token, device)) {
    var authRes = null;
    try {
      authRes = V5_AUTH.validateTrustedTokenByRole(token, expectedRole, device);
    } catch (errAuth) {
      return V5_ENTRY_renderLogin(action, expectedRole);
    }

    if (!authRes || authRes.ok !== true) {
      return V5_ENTRY_renderLogin(action, expectedRole);
    }

    email = String(authRes.email || '').trim().toLowerCase();
    if (!email) {
      return V5_ENTRY_renderLogin(action, expectedRole);
    }
  }

  try {
    ctx.email = email;
    ctx.token = token;
    ctx.deviceId = device;
    ctx.trustedToken = token;
    ctx.deviceFingerprint = device;
    return V5_ENTRY_renderApp(action, ctx);
  } catch (errRender) {
    var msg = (errRender && errRender.message) ? errRender.message : String(errRender);
    return HtmlService.createHtmlOutput('<h3>Render error</h3><pre>' + msg.replace(/[<>]/g,'') + '</pre>').getContent();
  }
}

function V5_ENTRY_monthKeyNow_() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  return y + '-' + m;
}

function V5_ENTRY_renderLogin(action, expectedRole) {
  var runtimeEnv = V5_ENTRY_captureEnv_({});
  var t = HtmlService.createTemplateFromFile('LoginV5');
  t.__actionAfterLogin = action;
  t.__expectedRole = expectedRole;
  t.__execUrl = (function(){ try { return ScriptApp.getService().getUrl(); } catch(e0){ return ''; } })();
  t.__env = runtimeEnv;
  t.__appEnv = runtimeEnv;
  t.__testAuthEnabled = !!(runtimeEnv === 'DEV' && V5_TEST_AUTH && V5_TEST_AUTH.enabled === true);
  t.__testCode = String((V5_TEST_AUTH && V5_TEST_AUTH.testCode) || '');
  t.__testAuditorEmail = 'romboutsrwj@gmail.com';
  t.__testManagerEmail = 'planning@agriqa.es';
  t.__testToken = String((V5_TEST_AUTH && V5_TEST_AUTH.token) || '');
  t.__testDeviceId = String((V5_TEST_AUTH && V5_TEST_AUTH.deviceId) || '');
  return t.evaluate().getContent();
}

function V5_ENTRY_renderApp(action, ctx) {
  var runtimeEnv = V5_ENTRY_captureEnv_(ctx);
  var execUrl = V5_ENTRY_appendEnvToUrl_((function(){ try { return ScriptApp.getService().getUrl(); } catch(e0){ return ''; } })(), runtimeEnv);

  var email  = String(ctx.email || '').trim().toLowerCase();
  var role   = V5_ENTRY_expectedRole_(action, ctx.role);
  var token  = String(ctx.trustedToken || ctx.token || '').trim();
  var device = String(ctx.deviceFingerprint || ctx.deviceId || '').trim();

  if (action === 'manager') {
    var tm = HtmlService.createTemplateFromFile('ManagerV5UI');
    tm.__execUrl = execUrl;
    tm.__email = email;
    tm.__role = role;
    tm.__trustedToken = token;
    tm.__deviceFingerprint = device;
    tm.__action = action;
    tm.__env = runtimeEnv;
    return tm.evaluate().getContent();
  }

  if (action === 'planningtoolkit') {
    var tp = HtmlService.createTemplateFromFile('ManagerPlanningV5UI');
    tp.__execUrl = execUrl;
    tp.__email = email;
    tp.__role = role;
    tp.__trustedToken = token;
    tp.__deviceFingerprint = device;
    tp.__action = action;
    tp.__env = runtimeEnv;
    tp.auditId = String(ctx.auditId || '').trim();
    return tp.evaluate().getContent();
  }

  if (action === 'companies') {
    var tc = HtmlService.createTemplateFromFile('CompaniesUI');
    tc.__execUrl = execUrl;
    tc.__email = email;
    tc.__role = role;
    tc.__trustedToken = token;
    tc.__deviceFingerprint = device;
    tc.__action = action;
    tc.__env = runtimeEnv;
    return tc.evaluate().getContent();
  }

  if (action === 'companymap') {
    var tmx = HtmlService.createTemplateFromFile('CompanyMap');
    tmx.__execUrl = execUrl;
    tmx.__email = email;
    tmx.__role = role;
    tmx.__trustedToken = token;
    tmx.__deviceFingerprint = device;
    tmx.__action = action;
    tmx.__env = runtimeEnv;
    return tmx.evaluate().getContent();
  }



  if (action === 'diag') {
    var td = HtmlService.createTemplateFromFile('ManagerDiagnosticsUI');
    td.__execUrl = execUrl;
    td.__email = email;
    td.__role = role;
    td.__trustedToken = token;
    td.__deviceFingerprint = device;
    td.__action = action;
    td.__env = runtimeEnv;
    return td.evaluate().getContent();
  }

  if (action === 'auditorportal') {
    var t2 = HtmlService.createTemplateFromFile('AuditorPortalV5');
    t2.__UI_MODE = 'full';
    t2.__PAGE = 'audits';
    t2.__auditorEmail = email;
    t2.__token = token;
    t2.__execUrl = execUrl;
    t2.__email = email;
    t2.__role = role;
    t2.__trustedToken = token;
    t2.__deviceFingerprint = device;
    t2.__action = action;
    t2.__env = runtimeEnv;
    return t2.evaluate().getContent();
  }

  if (action === 'auditoravailability') {
    var t3 = HtmlService.createTemplateFromFile('AuditorAvailabilityV5');
    var avMonthKey = String(ctx.monthKey || '').trim() || V5_ENTRY_monthKeyNow_();

    // d4 MULTI-MONTH BOOTSTRAP — 20260517
    // Best-effort bootstrap seed for previous/current/next month via the canonical AV route.
    // No new cache owner, no new route, no parallelism, no Toolkit/OpenWarmer dependency.
    var avBootstrapPayload = {
      primaryMonthKey: avMonthKey,
      months: {}
    };

    function V5_ENTRY_addMonthsToMonthKey_(monthKey, addMonths) {
      var m = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
      if (!m) return '';
      var y = Number(m[1]);
      var mo = Number(m[2]) - 1 + Number(addMonths || 0);
      while (mo < 0) { mo += 12; y--; }
      while (mo > 11) { mo -= 12; y++; }
      return y + '-' + String(mo + 1).padStart(2, '0');
    }

    try {
      [-1, 0, 1].forEach(function (offset) {
        var mk = V5_ENTRY_addMonthsToMonthKey_(avMonthKey, offset);
        if (!mk) return;
        try {
          var monthPayload = AV_getAvailabilityMonthJSON_(email, mk, false);
          if (monthPayload && typeof monthPayload === 'object') {
            avBootstrapPayload.months[mk] = {
              success: monthPayload.success === true,
              monthKey: String(monthPayload.monthKey || mk),
              days: monthPayload.days || {},
              blockedWeekdaysCsv: String(monthPayload.blockedWeekdaysCsv || '')
            };
          }
        } catch (eMonthBoot) {
          try {
            Logger.log('[AV_BOOTSTRAP_WARN] month=' + mk + ' error=' + String(eMonthBoot && eMonthBoot.message ? eMonthBoot.message : eMonthBoot));
          } catch (_eLogMonthBoot) {}
        }
      });
    } catch (eBoot) {
      try {
        Logger.log('[AV_BOOTSTRAP_FAIL] ' + String(eBoot && eBoot.message ? eBoot.message : eBoot));
      } catch (_eLogBoot) {}
    }

    t3.AV5_EXEC_URL = execUrl;
    t3.AV5_AUDITOR_EMAIL = email;
    t3.AV5_MONTHKEY = avMonthKey;
    t3.AV5_BOOTSTRAP_JSON = JSON.stringify(avBootstrapPayload);
    t3.AV5_BUILD_TS = '20260517_D4_MULTIMONTH_BOOTSTRAP';
    t3.__UI_MODE = 'AVAILABILITY_ONLY';
    t3.__PAGE = 'myavailability';
    t3.__auditorEmail = email;
    t3.__token = token;
    t3.__execUrl = execUrl;
    t3.__email = email;
    t3.__role = role;
    t3.__trustedToken = token;
    t3.__deviceFingerprint = device;
    t3.__action = action;
    t3.__env = runtimeEnv;
    return t3.evaluate().getContent();
  }

  return HtmlService.createHtmlOutput('Unhandled action').getContent();
}


/* ============================================================================
 * PUBLIC ENTRY / ENV DIAGNOSTICS
 * ========================================================================== */

function RUN_ENTRY_ENV_SMOKE() {
  var result = {
    ok: true,
    build: '2026-05-14_ENTRY_RESTORE_DOGET_R8',
    entryEnv: V5_ENTRY_captureEnv_({}),
    sysEnv: SYS_getRuntimeEnv_(),
    isDev: V5_ENTRY_isDevEnv_(),
    testLoginAllowed: V5_ENTRY_isDevEnv_(),
    envGuardAvailable: typeof ENV_getRuntimeEnv_ === 'function',
    source: 'EntryV5 -> EnvironmentGuardService -> ScriptProperties'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENTRY_TEST_LOGIN_DIAG() {
  var env = V5_ENTRY_captureEnv_({});
  var result = {
    ok: true,
    build: '2026-05-14_ENTRY_RESTORE_DOGET_R8',
    runtimeEnv: env,
    testAuthEnabledConfig: !!(V5_TEST_AUTH && V5_TEST_AUTH.enabled === true),
    testLoginUiShouldShow: !!(env === 'DEV' && V5_TEST_AUTH && V5_TEST_AUTH.enabled === true),
    testBypassAllowedNow: V5_ENTRY_isDevEnv_(),
    testAuditorEmail: 'romboutsrwj@gmail.com',
    testManagerEmail: 'planning@agriqa.es'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENTRY_ENV_ASSERT_DEV() {
  var env = V5_ENTRY_captureEnv_({});
  if (env !== 'DEV') {
    throw new Error('ENTRY_ENV_ASSERT_DEV_FAILED: current=' + env);
  }

  var result = {
    ok: true,
    runtimeEnv: env,
    assertion: 'DEV'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function RUN_ENTRY_ENV_ASSERT_PROD() {
  var env = V5_ENTRY_captureEnv_({});
  if (env !== 'PROD') {
    throw new Error('ENTRY_ENV_ASSERT_PROD_FAILED: current=' + env);
  }

  var result = {
    ok: true,
    runtimeEnv: env,
    assertion: 'PROD'
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function doPost(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var rawAction = String(p.action || '').trim().toLowerCase();

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
