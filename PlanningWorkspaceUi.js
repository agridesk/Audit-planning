/***********************************************************************
 * PlanningWorkspaceUi.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_UI_RENDERER_R1
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_RENDERER_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_UI_RENDERER_R1';
function PlanningWorkspaceUi_render(){return HtmlService.createTemplateFromFile('PlanningWorkspace').evaluate().setTitle('AMS - Planning Workspace');}
function PlanningWorkspaceUi_contract(){return{build:PLANNING_WORKSPACE_UI_RENDERER_BUILD,template:'PlanningWorkspace',clientInclude:'PlanningWorkspaceClient.js',evaluatedTemplate:true,directSheetReads:false,directSheetWrites:false};}
