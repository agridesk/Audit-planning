/***********************************************************************
 * FILE: zz_PlanningWorkspaceEntryRouteOverride.js
 * BUILD: 2026-09-24_AMS03_PLANNING_WORKSPACE_ENTRY_R5_SERVER_BOOTSTRAP
 *
 * DEV-only Planning Workspace entry optimization.
 * - EntryV5 remains authentication owner.
 * - First HTTP response is a data-independent Workspace shell.
 * - First browser RPC still goes through V5_ENTRY_resolve.
 * - After successful auth, the same RPC builds Workspace decision data.
 * - Authenticated Workspace data is returned as a native Apps Script RPC
 *   object instead of JSON.stringify -> marker string -> JSON.parse.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD='2026-09-24_AMS03_PLANNING_WORKSPACE_ENTRY_R5_SERVER_BOOTSTRAP';

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
  if(raw==='planningworkspace'||raw==='workspace'){
    var runtimeEnv=V5_ENTRY_captureEnv_(p);
    if(runtimeEnv!=='DEV')return PW_ENTRY_BASE_doGet_(e);
    var auth=V5_ENTRY_readAuthParams_(p),expectedRole=V5_ENTRY_expectedRole_('planningworkspace',p.role),email=auth.email,authorized=false;
    if(V5_ENTRY_isTestBypass_(email,expectedRole,auth.token,auth.deviceId)){authorized=true;}else{try{var ar=V5_AUTH.validateTrustedTokenByRole(auth.token,expectedRole,auth.deviceId);if(ar&&ar.ok===true&&ar.email){email=String(ar.email||'').trim().toLowerCase();authorized=true;}}catch(eAuth){authorized=false;}}
    if(!authorized)return PW_ENTRY_BASE_doGet_(e);
    var output=PlanningWorkspaceUi_render({env:'DEV'}),html=output&&typeof output.getContent==='function'?output.getContent():String(output||''),boot={email:email,role:expectedRole,token:auth.token,deviceId:auth.deviceId,auditId:String(p.auditId||'').trim()},serverBootstrap=null;
    try{serverBootstrap=PlanningWorkspaceRpc_bootstrap({from:String(p.from||''),to:String(p.to||''),auditId:boot.auditId,role:expectedRole,actorRole:expectedRole,actorEmail:email,auditorEmail:expectedRole==='Auditor'?email:''});}catch(eBoot){serverBootstrap=null;}
    var bootJson=JSON.stringify(boot).replace(/</g,'\\u003c'),dataJson=JSON.stringify(serverBootstrap).replace(/</g,'\\u003c');
    html=html.replace('</head>','<script>window.__PW_ENTRY_DIRECT_SHELL=true;window.__PW_ENTRY_AUTH='+bootJson+';window.__PW_ENTRY_SERVER_BOOTSTRAP='+dataJson+';</script></head>');
    return HtmlService.createHtmlOutput(html).setTitle('AMS - Planning Workspace');
  }
  return PW_ENTRY_BASE_doGet_(e);
};

function PlanningWorkspaceEntryRoute_contract(){
  return{
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    devOnly:true,
    authenticatedEntryOwner:'EntryV5',
    authFunction:'V5_ENTRY_resolve',
    directDataIndependentShell:true,
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
    ok:normalized==='planningworkspace'&&alias==='planningworkspace'&&role==='Manager'&&c.directDataIndependentShell===true&&c.initialAuthAndDataSingleRpc===true&&c.initialSerialRpcCount===1&&c.planningDataBeforeAuth===false&&c.authenticatedDataEnvelope==='NATIVE_OBJECT'&&c.explicitJsonStringify===false&&c.browserJsonParse===false,
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    normalized:normalized,
    alias:alias,
    expectedRole:role,
    contract:c
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
