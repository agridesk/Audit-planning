/***********************************************************************
 * zz_PlanningWorkspaceEntryV5Override.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_ENTRY_V5_OVERRIDE_R1
 *
 * DEV-only late-load route integration while EntryV5 remains auth owner.
 * Existing routes delegate untouched to their original EntryV5 functions.
 * PROD is hard-blocked before bootstrap/auth for planningworkspace.
 ***********************************************************************/
var PLANNING_WORKSPACE_ENTRY_V5_OVERRIDE_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_ENTRY_V5_OVERRIDE_R1';
var PW_ENTRY_BASE_normAction_=V5_ENTRY_normAction_;
var PW_ENTRY_BASE_browserTitle_=V5_ENTRY_browserTitle_;
var PW_ENTRY_BASE_expectedRole_=V5_ENTRY_expectedRole_;
var PW_ENTRY_BASE_renderApp_=V5_ENTRY_renderApp;
var PW_ENTRY_BASE_doGet_=doGet;

V5_ENTRY_normAction_=function(raw){
  var a=String(raw||'').trim().toLowerCase();
  if(a==='planningworkspace'||a==='workspace')return'planningworkspace';
  return PW_ENTRY_BASE_normAction_(raw);
};

V5_ENTRY_browserTitle_=function(action,roleHint){
  action=V5_ENTRY_normAction_(action);
  if(action==='planningworkspace')return'AMS - Planning Workspace';
  return PW_ENTRY_BASE_browserTitle_(action,roleHint);
};

V5_ENTRY_expectedRole_=function(action,roleHint){
  action=V5_ENTRY_normAction_(action);
  if(action==='planningworkspace'){
    var rh=String(roleHint||'').trim().toLowerCase();
    return rh==='auditor'?'Auditor':'Manager';
  }
  return PW_ENTRY_BASE_expectedRole_(action,roleHint);
};

V5_ENTRY_renderApp=function(action,ctx){
  action=V5_ENTRY_normAction_(action);
  if(action==='planningworkspace'){
    if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true)throw new Error('PLANNING_WORKSPACE_DEV_ONLY');
    if(typeof PlanningWorkspaceDevRoute_render!=='function')throw new Error('PLANNING_WORKSPACE_ROUTE_UNAVAILABLE');
    return PlanningWorkspaceDevRoute_render(ctx||{});
  }
  return PW_ENTRY_BASE_renderApp_(action,ctx);
};

doGet=function(e){
  var p=(e&&e.parameter)?e.parameter:{};
  var raw=String(p.action||'').trim().toLowerCase();
  if(raw==='planningworkspace'||raw==='workspace'){
    if(typeof V5_ENTRY_isDevEnv_!=='function'||V5_ENTRY_isDevEnv_()!==true){
      return HtmlService.createHtmlOutput('Planning Workspace is not available in this environment.').setTitle('AMS - Planning Workspace');
    }
  }
  return PW_ENTRY_BASE_doGet_(e);
};

function PlanningWorkspaceEntryV5Override_contract(){return{
  build:PLANNING_WORKSPACE_ENTRY_V5_OVERRIDE_BUILD,
  canonicalAction:'planningworkspace',
  aliases:['planningworkspace','workspace'],
  planningAliasReservedForToolkit:true,
  title:'AMS - Planning Workspace',
  defaultRole:'Manager',
  auditorRoleHint:'Auditor',
  authOwner:'EntryV5',
  renderer:'PlanningWorkspaceDevRoute_render',
  prodHardBlockBeforeBootstrap:true,
  devOnly:true,
  existingRoutesDelegated:true,
  newSsot:false
};}
