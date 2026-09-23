/***********************************************************************
 * PlanningWorkspacePhase9ContextRpc.js
 * BUILD: 2026-09-23_AMS03_PHASE9_WORKSPACE_CONTEXT_RPC_R1
 ***********************************************************************/
function PlanningWorkspaceRpc_getHandover(input){return PWR_envelope_('getHandover',function(){return getPlanningHandoverV5(input||{});});}
function PlanningWorkspaceRpc_buildCompanyProposalDraft(input){return PWR_envelope_('buildCompanyProposalDraft',function(){return PlanningCompanyProposalDraft_build(input||{});});}
