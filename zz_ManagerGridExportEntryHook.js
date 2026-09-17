/***********************************************************************
 * FILE: zz_ManagerGridExportEntryHook.js
 * BUILD: 2026-09-17_MANAGER_GRID_EXPORT_ENTRY_HOOK_R1
 * PURPOSE: manager-only HTML composition hook; no backend/grid read changes.
 ***********************************************************************/
function V5_ENTRY_resolve(ctx) {
  ctx = ctx || {};
  var runtimeEnv = V5_ENTRY_captureEnv_(ctx);
  ctx.env = runtimeEnv;
  var action = V5_ENTRY_normAction_(ctx.action);
  var expectedRole = V5_ENTRY_expectedRole_(action, ctx.role);
  var email = String(ctx.email || '').trim().toLowerCase();
  var token = String(ctx.trustedToken || ctx.token || '').trim();
  var device = String(ctx.deviceFingerprint || ctx.deviceId || '').trim();
  if (!action || !expectedRole) return V5_ENTRY_renderLogin(action, expectedRole);
  if (!V5_ENTRY_isTestBypass_(email, expectedRole, token, device)) {
    var authRes = null;
    try { authRes = V5_AUTH.validateTrustedTokenByRole(token, expectedRole, device); } catch (errAuth) { return V5_ENTRY_renderLogin(action, expectedRole); }
    if (!authRes || authRes.ok !== true) return V5_ENTRY_renderLogin(action, expectedRole);
    email = String(authRes.email || '').trim().toLowerCase();
    if (!email) return V5_ENTRY_renderLogin(action, expectedRole);
  }
  try {
    ctx.email=email;ctx.token=token;ctx.deviceId=device;ctx.trustedToken=token;ctx.deviceFingerprint=device;
    var html=V5_ENTRY_renderApp(action,ctx);
    if(action==='manager'){
      var addon=HtmlService.createHtmlOutputFromFile('ManagerGridExport').getContent();
      html=String(html||'');
      html=html.indexOf('</body>')>=0?html.replace('</body>',addon+'</body>'):html+addon;
    }
    return html;
  } catch (errRender) {
    var msg=(errRender&&errRender.message)?errRender.message:String(errRender);
    return HtmlService.createHtmlOutput('<h3>Render error</h3><pre>'+msg.replace(/[<>]/g,'')+'</pre>').getContent();
  }
}
