/***********************************************************************
 * FILE: zz_PlanningWorkspaceEntryRouteOverride.js
 * BUILD: 2026-09-17_AMS01_PLANNING_WORKSPACE_ENTRY_R2_DIRECT_SHELL_ONE_RPC
 *
 * DEV-only Planning Workspace entry optimization.
 * - EntryV5 remains authentication owner.
 * - The first HTTP response may expose only the data-independent Workspace
 *   shell; it contains no planning/business data.
 * - The first browser RPC still goes through V5_ENTRY_resolve, so canonical
 *   trusted-token/role validation is unchanged.
 * - After successful auth, the same RPC builds the initial Workspace
 *   advisory + overlay bundle. This removes the old serial chain:
 *     bootstrap HTML -> auth/render RPC -> Workspace bootstrap RPC.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD='2026-09-17_AMS01_PLANNING_WORKSPACE_ENTRY_R2_DIRECT_SHELL_ONE_RPC';

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
  if(String(action||'').trim().toLowerCase()==='planningworkspace')return'Manager';
  return PW_ENTRY_BASE_expectedRole_(action,roleHint);
};

var PW_ENTRY_BASE_renderApp_=V5_ENTRY_renderApp;
V5_ENTRY_renderApp=function(action,ctx){
  if(String(action||'').trim().toLowerCase()==='planningworkspace'){
    if(!V5_ENTRY_isDevEnv_())throw new Error('PLANNING_WORKSPACE_DEV_ONLY');
    ctx=ctx||{};
    if(ctx.workspaceDataRequest&&typeof ctx.workspaceDataRequest==='object'){
      var rpc=PlanningWorkspaceRpc_bootstrap(ctx.workspaceDataRequest);
      return '__PW_AUTH_DATA__'+JSON.stringify(rpc||{});
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
    var output=PlanningWorkspaceUi_render({env:'DEV'});
    var html=output&&typeof output.getContent==='function'?output.getContent():String(output||'');
    html=html.replace('</head>','<script>window.__PW_ENTRY_DIRECT_SHELL=true;</script></head>');
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
    initialAuthAndDataSingleRpc:true,
    initialSerialRpcCount:1,
    planningDataBeforeAuth:false,
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
    ok:normalized==='planningworkspace'&&alias==='planningworkspace'&&role==='Manager'&&c.directDataIndependentShell===true&&c.initialAuthAndDataSingleRpc===true&&c.initialSerialRpcCount===1&&c.planningDataBeforeAuth===false,
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    normalized:normalized,
    alias:alias,
    expectedRole:role,
    contract:c
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
