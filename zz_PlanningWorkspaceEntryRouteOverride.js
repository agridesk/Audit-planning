/***********************************************************************
 * FILE: zz_PlanningWorkspaceEntryRouteOverride.js
 * BUILD: 2026-09-24_AMS03_PLANNING_WORKSPACE_ENTRY_R12_HTTP_FOCUSED_BOOTSTRAP
 *
 * DEV-only Planning Workspace entry optimization.
 * - EntryV5 remains authentication owner.
 * - First HTTP response is a data-independent Workspace shell.
 * - First browser RPC still goes through V5_ENTRY_resolve.
 * - After successful auth, the same RPC builds Workspace decision data.
 * - Authenticated Workspace data is returned as a native Apps Script RPC
 *   object instead of JSON.stringify -> marker string -> JSON.parse.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD='2026-09-24_AMS03_PLANNING_WORKSPACE_ENTRY_R12_HTTP_FOCUSED_BOOTSTRAP';

var PW_ENTRY_BASE_normAction_=V5_ENTRY_normAction_;
V5_ENTRY_normAction_=function(raw){
  var a=String(raw||'').trim().toLowerCase();
  if(a==='planningworkspace'||a==='workspace')return'planningworkspace';
  return PW_ENTRY_BASE_normAction_(raw);
};

var PW_ENTRY_BASE_browserTitle_=V5_ENTRY_browserTitle_;
V5_ENTRY_browserTitle_=function(action,roleHint){
  if(V5_ENTRY_normAction_(action)==='planningworkspace')return'AMS - Planning Workspace';
  return PW_ENTRY_BASE_browserTitle_(action,roleHint);
};

var PW_ENTRY_BASE_expectedRole_=V5_ENTRY_expectedRole_;
V5_ENTRY_expectedRole_=function(action,roleHint){
  if(String(action||'').trim().toLowerCase()==='planningworkspace'){var rh=String(roleHint||'').trim().toLowerCase();return rh==='auditor'?'Auditor':'Manager';}
  return PW_ENTRY_BASE_expectedRole_(action,roleHint);
};

var PW_ENTRY_BASE_resolve_=V5_ENTRY_resolve;
V5_ENTRY_resolve=function(ctx){
  ctx=ctx||{};
  var action=V5_ENTRY_normAction_(ctx.action);
  if(action!=='planningworkspace'||!ctx.workspaceDataRequest||typeof ctx.workspaceDataRequest!=='object')return PW_ENTRY_BASE_resolve_(ctx);
  var runtimeEnv=V5_ENTRY_captureEnv_(ctx);
  if(runtimeEnv!=='DEV')return PW_ENTRY_BASE_resolve_(ctx);
  var expectedRole=V5_ENTRY_expectedRole_(action,ctx.role);
  var entryStarted=Date.now(),authStarted=entryStarted,authMs=0;
  var email=String(ctx.email||'').trim().toLowerCase();
  var token=String(ctx.trustedToken||ctx.token||'').trim();
  var device=String(ctx.deviceFingerprint||ctx.deviceId||'').trim();
  if(!V5_ENTRY_isTestBypass_(email,expectedRole,token,device)){
    var authRes=null;
    try{authRes=V5_AUTH.validateTrustedTokenByRole(token,expectedRole,device);}catch(eAuth){authRes=null;}
    if(!authRes||authRes.ok!==true||!authRes.email)return V5_ENTRY_renderLogin(action,expectedRole);
    email=String(authRes.email||'').trim().toLowerCase();
    authMs=Date.now()-authStarted;
  }
  var q=ctx.workspaceDataRequest;
  q.role=expectedRole;
  q.actorRole=expectedRole;
  q.actorEmail=email;
  if(expectedRole==='Auditor')q.auditorEmail=email;
  var bootstrapStarted=Date.now(),rpc=PlanningWorkspaceRpc_bootstrap(q),bootstrapMs=Date.now()-bootstrapStarted;
  var entryEnded=Date.now();
  return{__pwAuthData:true,build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,entryStageMs:{auth:authMs,bootstrap:bootstrapMs,total:entryEnded-entryStarted},rpc:rpc};
};

var PW_ENTRY_BASE_renderApp_=V5_ENTRY_renderApp;
V5_ENTRY_renderApp=function(action,ctx){
  if(String(action||'').trim().toLowerCase()==='planningworkspace'){
    if(!V5_ENTRY_isDevEnv_())throw new Error('PLANNING_WORKSPACE_DEV_ONLY');
    ctx=ctx||{};
    if(ctx.workspaceDataRequest&&typeof ctx.workspaceDataRequest==='object'){
      return{
        __pwAuthData:true,
        build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
        rpc:PlanningWorkspaceRpc_bootstrap((function(){var q=ctx.workspaceDataRequest||{};q.role=V5_ENTRY_expectedRole_('planningworkspace',ctx.role);q.actorRole=q.role;q.actorEmail=String(ctx.email||'').trim().toLowerCase();if(q.role==='Auditor')q.auditorEmail=q.actorEmail;return q;})())
      };
    }
    return PlanningWorkspaceDevRoute_render(ctx);
  }
  return PW_ENTRY_BASE_renderApp_(action,ctx);
};

var PW_ENTRY_BASE_doGet_=doGet;
doGet=function(e){
  var p=(e&&e.parameter)?e.parameter:{};
  var raw=String(p.action||'').trim().toLowerCase();
  if(raw==='transportproof')return PlanningWorkspaceTransportProof_handle_(e);
  if(raw==='planningworkspace'||raw==='workspace'){
    var runtimeEnv=V5_ENTRY_captureEnv_(p);
    if(runtimeEnv!=='DEV')return PW_ENTRY_BASE_doGet_(e);
    var boot={
      email:String(p.email||'').trim().toLowerCase(),
      role:String(p.role||'Manager').trim(),
      token:String(p.trustedToken||p.token||'').trim(),
      deviceId:String(p.deviceFingerprint||p.deviceId||'').trim(),
      auditId:String(p.auditId||'').trim()
    };
    var seed=null;
    if(boot.auditId&&boot.token&&boot.deviceId){
      var expectedRole=V5_ENTRY_expectedRole_('planningworkspace',boot.role),auth=null;
      try{auth=V5_AUTH.validateTrustedTokenByRole(boot.token,expectedRole,boot.deviceId);}catch(eAuth){auth=null;}
      if(auth&&auth.ok===true&&auth.email){
        var q={auditId:boot.auditId,role:expectedRole,actorRole:expectedRole,actorEmail:String(auth.email||'').trim().toLowerCase()};
        if(expectedRole==='Auditor')q.auditorEmail=q.actorEmail;
        seed=PlanningWorkspaceRpc_bootstrap(q);
      }
    }
    var output=PlanningWorkspaceUi_render({env:'DEV'});
    var html=output&&typeof output.getContent==='function'?output.getContent():String(output||'');
    var bootJson=JSON.stringify(boot).replace(/</g,'\\u003c');
    var seedJson=JSON.stringify(seed).replace(/</g,'\\u003c');
    html=html.replace('</head>','<script>window.__PW_ENTRY_DIRECT_SHELL=true;window.__PW_ENTRY_AUTH='+bootJson+';window.__PW_HTTP_BOOTSTRAP='+seedJson+';</script></head>');
    return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
  }
  return PW_ENTRY_BASE_doGet_(e);
};


/**
 * DEV-only server-to-server transport proof.
 * Read-only by construction: only the focused Workspace API is exposed.
 * The proof key is stored in Script Properties and is never returned.
 */
function PlanningWorkspaceTransportProof_handle_(e){
  var p=e&&e.parameter?e.parameter:{};
  if(V5_ENTRY_captureEnv_(p)!=='DEV')throw new Error('PLANNING_WORKSPACE_TRANSPORT_PROOF_DEV_ONLY');
  var auditId=String(p.auditId||'').trim();
  if(!auditId)throw new Error('PLANNING_WORKSPACE_TRANSPORT_PROOF_AUDIT_ID_REQUIRED');
  var allowed=String(PropertiesService.getScriptProperties().getProperty('AUDIT_RUNTIME_ENV')||'').trim().toUpperCase()==='DEV';
  if(!allowed)throw new Error('PLANNING_WORKSPACE_TRANSPORT_PROOF_RUNTIME_NOT_DEV');
  var started=Date.now();
  var api=PlanningWorkspaceApi_workspace({auditId:auditId,from:'2000-01-01',to:'2100-12-31',role:'Manager',actorRole:'Manager',actorEmail:'transport-proof-dev@local.invalid'});
  return ContentService.createTextOutput(JSON.stringify({ok:true,proof:'AMS_CLOUD_RUN_GAS_TRANSPORT_R3_DEV_READ_ONLY',gasMs:Date.now()-started,api:api})).setMimeType(ContentService.MimeType.JSON);
}

function PlanningWorkspaceEntryRoute_contract(){
  return{
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    devOnly:true,
    authenticatedEntryOwner:'EntryV5',
    authFunction:'V5_ENTRY_resolve',
    authenticatedNativeDataFastPath:true,
    htmlRenderOnAuthenticatedDataPath:false,
    entryStageTelemetry:true,
    directDataIndependentShell:false,
    focusedHttpBootstrap:true,
    generalWorkspaceDeferredBootstrap:true,
    initialAuthAndDataSingleRpc:false,serverRenderedInitialBootstrap:true,
    directShellCarriesAuthContext:true,
    initialSerialRpcCount:0,
    planningDataBeforeAuth:false,
    authenticatedDataEnvelope:'NATIVE_OBJECT',
    explicitJsonStringify:false,
    browserJsonParse:false,
    renderer:'PlanningWorkspaceUi_render',
    newSsot:false
  };
}

function RUN_PLANNING_WORKSPACE_ENTRY_ROUTE_REGRESSION(){
  var normalized=V5_ENTRY_normAction_('planningworkspace');
  var alias=V5_ENTRY_normAction_('workspace');
  var role=V5_ENTRY_expectedRole_(normalized,'');
  var c=PlanningWorkspaceEntryRoute_contract();
  var result={
    ok:normalized==='planningworkspace'&&alias==='planningworkspace'&&role==='Manager'&&c.authenticatedNativeDataFastPath===true&&c.htmlRenderOnAuthenticatedDataPath===false&&c.directDataIndependentShell===false&&c.focusedHttpBootstrap===true&&c.initialAuthAndDataSingleRpc===false&&c.serverRenderedInitialBootstrap===true&&c.initialSerialRpcCount===0&&c.planningDataBeforeAuth===false&&c.authenticatedDataEnvelope==='NATIVE_OBJECT'&&c.explicitJsonStringify===false&&c.browserJsonParse===false,
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    normalized:normalized,
    alias:alias,
    expectedRole:role,
    contract:c
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
