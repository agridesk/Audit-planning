/***********************************************************************
 * PlanningWorkspaceDevRoute.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_R1
 *
 * DEV-only route helper. Authentication remains owned by EntryV5.
 ***********************************************************************/
var PLANNING_WORKSPACE_DEV_ROUTE_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_DEV_ROUTE_R1';
function PlanningWorkspaceDevRoute_isEnabled(){
  return typeof V5_ENTRY_isDevEnv_==='function' && V5_ENTRY_isDevEnv_()===true;
}
function PlanningWorkspaceDevRoute_render(ctx){
  if(!PlanningWorkspaceDevRoute_isEnabled()) throw new Error('PLANNING_WORKSPACE_DEV_ONLY');
  ctx=ctx||{};
  return PlanningWorkspaceRenderer_render({
    email:String(ctx.email||'').trim().toLowerCase(),
    role:String(ctx.role||'').trim(),
    env:'DEV'
  });
}
function PlanningWorkspaceDevRoute_contract(){
  return {build:PLANNING_WORKSPACE_DEV_ROUTE_BUILD,devOnly:true,authenticatedEntryOwner:'EntryV5',renderer:'PlanningWorkspaceRenderer_render',newSsot:false};
}
