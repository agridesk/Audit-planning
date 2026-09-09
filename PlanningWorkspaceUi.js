/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_UI_RENDERER_R2_ROUTE_CONTEXT
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_UI_RENDERER_R2_ROUTE_CONTEXT';
function PlanningWorkspaceUi_render(input){input=input||{};var t=HtmlService.createTemplateFromFile('PlanningWorkspace');t.workspaceEnv=String(input.env||'').trim().toUpperCase();t.workspaceRole=String(input.role||'').trim();t.workspaceEmail=String(input.email||'').trim().toLowerCase();return t.evaluate().setTitle('AMS - Planning Workspace');}
function PlanningWorkspaceUi_contract(){return{build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,template:'PlanningWorkspace',clientInclude:'PlanningWorkspaceClient.js',evaluatedTemplate:true,routeContext:true,directSheetReads:false,directSheetWrites:false};}
