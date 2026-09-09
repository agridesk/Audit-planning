/***********************************************************************
 * PlanningWorkspaceUiContract.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_UI_SHELL_CONTRACT_R1
 *
 * Pure UI-shell contract. No rendering and no data access.
 ***********************************************************************/
var PLANNING_WORKSPACE_UI_CONTRACT_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_UI_SHELL_CONTRACT_R1';
function PlanningWorkspaceUiContract_get(){return{build:PLANNING_WORKSPACE_UI_CONTRACT_BUILD,title:'Planning Workspace',layout:{header:true,filters:true,demandPane:true,planningPane:true,auditEditor:'internal-panel',statusBar:true},bootstrapRpc:'PlanningWorkspaceRpc_bootstrap',actions:{saveConcept:'PlanningWorkspaceRpc_saveConcept',releaseConcept:'PlanningWorkspaceRpc_releaseConcept',commit:'PlanningWorkspaceRpc_commit'},behavior:{singleSharedWorkspace:true,managerAndAuditor:true,loadedPeriodReusableClientSide:true,auditEditorInternal:true,successfulSaveClosesEditor:true,conceptPlanningDistinctFromCanonicalPlanning:true,commitRevalidatesCanonically:true,bulkPlanningCompatible:true},governance:{newSsot:false,directSheetReads:false,directSheetWrites:false,legacyPlanningWriterDirect:false}};}
