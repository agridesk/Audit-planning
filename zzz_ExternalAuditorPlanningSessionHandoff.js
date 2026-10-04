/***********************************************************************
 * FILE: zzz_ExternalAuditorPlanningSessionHandoff.js
 * BUILD: 2026-10-04_EXTERNAL_AUDITOR_PLANNING_SESSION_HANDOFF_R1
 * PURPOSE:
 * - DEV-only signed handoff from authenticated Auditor Portal to the shared
 *   Cloud Run Planning Toolkit 2.0.
 * - Reuses canonical trusted-device validation in GAS.
 * - Creates no planning truth and performs no planning write.
 ***********************************************************************/
var EXTERNAL_AUDITOR_PLANNING_HANDOFF_BUILD='2026-10-04_EXTERNAL_AUDITOR_SHARED_GRID_HANDOFF_R2';
var EXTERNAL_AUDITOR_PLANNING_HANDOFF_URL='https://ams-transport-proof-510075419067.europe-west1.run.app/auth/signed-handoff';
var EXTERNAL_AUDITOR_PLANNING_HANDOFF_TTL_MS=60*1000;

function ExternalAuditorPlanningHandoff_escape_(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
function ExternalAuditorPlanningHandoff_b64url_(bytes){
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g,'');
}
function ExternalAuditorPlanningHandoff_payload_(email,auditId,expMs){
  var purpose=String(auditId||'').trim()?'AUDITOR_PLANNING_SESSION':'AUDITOR_PORTAL_SESSION';
  return String(auditId||'').trim()
    ? ['v1',purpose,String(email||'').trim().toLowerCase(),'Auditor',String(auditId||'').trim(),String(expMs||'').trim()].join('\n')
    : ['v1',purpose,String(email||'').trim().toLowerCase(),'Auditor',String(expMs||'').trim()].join('\n');
}
function ExternalAuditorPlanningHandoff_sign_(payload,key){
  return ExternalAuditorPlanningHandoff_b64url_(Utilities.computeHmacSha256Signature(String(payload||''),String(key||'')));
}
function ExternalAuditorPlanningHandoff_buildAssertion_(email,auditId){
  email=String(email||'').trim().toLowerCase();
  auditId=String(auditId||'').trim();
  if(!email)throw new Error('EXTERNAL_AUDITOR_PLANNING_EMAIL_REQUIRED');
  var key=String(PropertiesService.getScriptProperties().getProperty('AMS_EXTERNAL_WRITE_BRIDGE_KEY')||'').trim();
  if(key.length<32)throw new Error('EXTERNAL_AUDITOR_PLANNING_HANDOFF_KEY_NOT_CONFIGURED');
  var expMs=Date.now()+EXTERNAL_AUDITOR_PLANNING_HANDOFF_TTL_MS;
  var payload=ExternalAuditorPlanningHandoff_payload_(email,auditId,expMs);
  return{email:email,role:'Auditor',auditId:auditId,exp:String(expMs),signature:ExternalAuditorPlanningHandoff_sign_(payload,key)};
}
function ExternalAuditorPlanningHandoff_renderPost_(email,auditId){
  var a=ExternalAuditorPlanningHandoff_buildAssertion_(email,auditId);
  return ['<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>AMS - Opening Audit Grid 2.0</title></head><body>',
    '<form id="handoff" method="post" target="_top" action="',ExternalAuditorPlanningHandoff_escape_(EXTERNAL_AUDITOR_PLANNING_HANDOFF_URL),'">',
    '<input type="hidden" name="email" value="',ExternalAuditorPlanningHandoff_escape_(a.email),'">',
    '<input type="hidden" name="role" value="Auditor">',
    '<input type="hidden" name="auditId" value="',ExternalAuditorPlanningHandoff_escape_(a.auditId),'">',
    '<input type="hidden" name="exp" value="',ExternalAuditorPlanningHandoff_escape_(a.exp),'">',
    '<input type="hidden" name="signature" value="',ExternalAuditorPlanningHandoff_escape_(a.signature),'">',
    '</form><script>document.getElementById("handoff").submit();</script>',
    '<noscript><button type="submit" form="handoff">Open Audit Grid 2.0</button></noscript></body></html>'
  ].join('');
}

var EXTERNAL_AUDITOR_PLANNING_HANDOFF_BASE_RESOLVE_=V5_ENTRY_resolve;
V5_ENTRY_resolve=function(ctx){
  ctx=ctx||{};
  var runtimeEnv=V5_ENTRY_captureEnv_(ctx);
  var action=V5_ENTRY_normAction_(ctx.action);
  var expectedRole=V5_ENTRY_expectedRole_(action,ctx.role);
  var auditorSharedEntry=(action==='planningworkspace'||action==='auditorportal');
  if(runtimeEnv!=='DEV'||!auditorSharedEntry||expectedRole!=='Auditor'){
    return EXTERNAL_AUDITOR_PLANNING_HANDOFF_BASE_RESOLVE_(ctx);
  }
  var email=String(ctx.email||ctx.auditorEmail||'').trim().toLowerCase();
  var auditId=String(ctx.auditId||'').trim();
  var token=String(ctx.trustedToken||ctx.token||'').trim();
  var device=String(ctx.deviceFingerprint||ctx.deviceId||'').trim();
  if(V5_ENTRY_isTestBypass_(email,expectedRole,token,device)){
    return ExternalAuditorPlanningHandoff_renderPost_(email,auditId);
  }
  if(!token||!device)return V5_ENTRY_renderLogin(action,expectedRole);
  var authRes=null;
  try{authRes=V5_AUTH.validateTrustedTokenByRole(token,'Auditor',device);}catch(errAuth){authRes=null;}
  if(!authRes||authRes.ok!==true||!authRes.email)return V5_ENTRY_renderLogin(action,expectedRole);
  return ExternalAuditorPlanningHandoff_renderPost_(String(authRes.email||'').trim().toLowerCase(),auditId);
};

function RUN_EXTERNAL_AUDITOR_PLANNING_HANDOFF_CONTRACT_ACCEPTANCE(){
  var out={ok:true,build:EXTERNAL_AUDITOR_PLANNING_HANDOFF_BUILD,writesPerformed:false,checks:[]};
  function check_(name,ok,detail){out.checks.push({name:name,ok:!!ok,detail:detail||''});if(!ok)out.ok=false;}
  check_('devEnvironment',V5_ENTRY_isDevEnv_(),'');
  check_('baseResolvePreserved',typeof EXTERNAL_AUDITOR_PLANNING_HANDOFF_BASE_RESOLVE_==='function','');
  check_('canonicalAuditorTokenValidatorAvailable',!!(V5_AUTH&&typeof V5_AUTH.validateTrustedTokenByRole==='function'),'');
  check_('targetIsSharedCloudRunHandoff',/\/auth\/signed-handoff$/.test(EXTERNAL_AUDITOR_PLANNING_HANDOFF_URL),EXTERNAL_AUDITOR_PLANNING_HANDOFF_URL);
  check_('topLevelPost',String(ExternalAuditorPlanningHandoff_renderPost_).indexOf('target="_top"')>=0,'');
  check_('planningAuditIdBoundIntoSignature',String(ExternalAuditorPlanningHandoff_payload_).indexOf('AUDITOR_PLANNING_SESSION')>=0,'');
  check_('auditorPortalPurposeSupported',String(ExternalAuditorPlanningHandoff_payload_).indexOf('AUDITOR_PORTAL_SESSION')>=0,'');
  check_('ttlShort',EXTERNAL_AUDITOR_PLANNING_HANDOFF_TTL_MS>0&&EXTERNAL_AUDITOR_PLANNING_HANDOFF_TTL_MS<=90000,String(EXTERNAL_AUDITOR_PLANNING_HANDOFF_TTL_MS));
  try{Logger.log(JSON.stringify(out,null,2));}catch(eLog){}
  return out;
}
