/***********************************************************************
 * FILE: zz_PlanningWorkspaceEntryRouteOverride.js
 * BUILD: 2026-09-11_PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_R1
 *
 * DEV route compatibility override. Keeps EntryV5 as the authentication
 * owner and delegates rendering to PlanningWorkspaceDevRoute.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD='2026-09-11_PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_R1';

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
    return PlanningWorkspaceDevRoute_render(ctx||{});
  }
  return PW_ENTRY_BASE_renderApp_(action,ctx);
};

function RUN_PLANNING_WORKSPACE_ENTRY_ROUTE_REGRESSION(){
  var normalized=V5_ENTRY_normAction_('planningworkspace');
  var alias=V5_ENTRY_normAction_('workspace');
  var role=V5_ENTRY_expectedRole_(normalized,'');
  var result={
    ok:normalized==='planningworkspace'&&alias==='planningworkspace'&&role==='Manager',
    build:PLANNING_WORKSPACE_ENTRY_ROUTE_OVERRIDE_BUILD,
    normalized:normalized,
    alias:alias,
    expectedRole:role,
    devOnly:true,
    renderer:'PlanningWorkspaceDevRoute_render'
  };
  Logger.log(JSON.stringify(result,null,2));
  return result;
}
