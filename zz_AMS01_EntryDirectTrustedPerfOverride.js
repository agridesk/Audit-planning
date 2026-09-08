/**
 * FILE: zz_AMS01_EntryDirectTrustedPerfOverride.js
 * BUILD: AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_20260908_R1
 * DEV-only late-load entry optimization.
 *
 * Goal:
 * - When a web-app URL already carries a valid trusted token + device id,
 *   render the requested app directly from doGet().
 * - Avoid the extra EntryBootstrapV5 -> google.script.run(V5_ENTRY_resolve)
 *   roundtrip before the real app HTML is returned.
 *
 * Safety:
 * - Existing authentication remains authoritative.
 * - Invalid/missing trusted credentials fall back to canonical doGet().
 * - No role, environment or authorization semantics are changed.
 */
var AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_BUILD='AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_20260908_R1';

(function(){
  if(typeof doGet!=='function') return;

  var canonicalDoGet_=doGet;

  function clean_(v){ return String(v==null?'':v).trim(); }
  function lower_(v){ return clean_(v).toLowerCase(); }

  doGet=function(e){
    var t0=Date.now();
    try{
      var p=(e&&e.parameter)?e.parameter:{};
      var action=(typeof V5_ENTRY_normAction_==='function')?V5_ENTRY_normAction_(p.action):lower_(p.action);
      var expectedRole=(typeof V5_ENTRY_expectedRole_==='function')?V5_ENTRY_expectedRole_(action,p.role):'';
      var email=lower_(p.email);
      var token=clean_(p.trustedToken||p.token);
      var device=clean_(p.deviceFingerprint||p.deviceId);

      if(!action||!expectedRole||!email||!token||!device){
        return canonicalDoGet_(e);
      }

      var runtimeEnv=(typeof V5_ENTRY_captureEnv_==='function')?V5_ENTRY_captureEnv_(p):'';
      p.env=runtimeEnv;

      var allowed=false;
      var resolvedEmail=email;

      if(typeof V5_ENTRY_isTestBypass_==='function' && V5_ENTRY_isTestBypass_(email,expectedRole,token,device)){
        allowed=true;
      }else if(typeof V5_AUTH!=='undefined' && V5_AUTH && typeof V5_AUTH.validateTrustedTokenByRole==='function'){
        var authRes=V5_AUTH.validateTrustedTokenByRole(token,expectedRole,device);
        if(authRes&&authRes.ok===true&&authRes.email){
          allowed=true;
          resolvedEmail=lower_(authRes.email);
        }
      }

      if(!allowed){
        return canonicalDoGet_(e);
      }

      var ctx={
        action:action,
        email:resolvedEmail,
        role:clean_(p.role),
        token:token,
        trustedToken:token,
        deviceId:device,
        deviceFingerprint:device,
        auditorEmail:clean_(p.auditorEmail),
        monthKey:clean_(p.monthKey),
        auditId:clean_(p.auditId),
        env:runtimeEnv
      };

      if(typeof V5_ENTRY_renderApp_==='function'){
        // Reserved compatibility path if render owner is ever renamed.
        var html0=V5_ENTRY_renderApp_(action,ctx);
        return HtmlService.createHtmlOutput(html0).setTitle(typeof V5_ENTRY_browserTitle_==='function'?V5_ENTRY_browserTitle_(action,p.role):'AMS');
      }

      if(typeof V5_ENTRY_renderApp==='function'){
        var html=V5_ENTRY_renderApp(action,ctx);
        try{ Logger.log('[AMS01_ENTRY_DIRECT] '+JSON.stringify({build:AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_BUILD,action:action,role:expectedRole,ms:Date.now()-t0,env:runtimeEnv})); }catch(eLog){}
        return HtmlService.createHtmlOutput(html)
          .setTitle(typeof V5_ENTRY_browserTitle_==='function'?V5_ENTRY_browserTitle_(action,p.role):'AMS');
      }
    }catch(err){
      try{ Logger.log('[AMS01_ENTRY_DIRECT_FALLBACK] '+JSON.stringify({build:AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_BUILD,error:String(err&&err.message?err.message:err),ms:Date.now()-t0})); }catch(eLog2){}
    }

    return canonicalDoGet_(e);
  };
})();

function AMS01_EntryDirectTrustedPerfStatus(){
  return {
    success:true,
    active:true,
    build:AMS01_ENTRY_DIRECT_TRUSTED_PERF_ZZ_BUILD
  };
}
