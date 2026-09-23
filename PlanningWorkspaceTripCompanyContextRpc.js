/***********************************************************************
 * PlanningWorkspaceTripCompanyContextRpc.js
 * BUILD: 2026-09-23_AMS03_PHASE8_9_WORKSPACE_CONTEXT_RPC_R1
 * Thin read-only Workspace integration; no new truth / no mutations.
 ***********************************************************************/
var PW_CONTEXT_RPC_BUILD='2026-09-23_AMS03_PHASE8_9_WORKSPACE_CONTEXT_RPC_R1';
function PlanningWorkspaceRpc_getTripWorkweek(input){return PWR_envelope_('getTripWorkweek',function(){return getPlanningTripWorkweekV5(input||{});});}
function PlanningWorkspaceRpc_getCompanyCommunication(input){return PWR_envelope_('getCompanyCommunication',function(){return getPlanningCompanyCommunicationV5(input||{});});}
function PlanningWorkspaceTripCompanyContext_contract(){return{build:PW_CONTEXT_RPC_BUILD,endpoints:['PlanningWorkspaceRpc_getTripWorkweek','PlanningWorkspaceRpc_getCompanyCommunication'],owners:{trip:'getPlanningTripWorkweekV5',company:'getPlanningCompanyCommunicationV5'},meta:{readOnly:true,directSheetReads:false,directSheetWrites:false,newSsot:false,onDemand:true,bootstrapInflation:false}};}
