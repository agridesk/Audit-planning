/***********************************************************************
 * PlanningWorkspaceTripConceptRpc.js
 * BUILD: 2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_RPC_R1
 ***********************************************************************/
function PlanningWorkspaceRpc_getTripConcept(input){return PWR_envelope_('getTripConcept',function(){return PlanningTripConceptReadModel_get(input||{});});}
function PlanningWorkspaceTripConceptRpc_contract(){return{build:'2026-09-23_AMS03_PHASE8_TRIP_CONCEPT_RPC_R1',endpoint:'PlanningWorkspaceRpc_getTripConcept',owner:'PlanningTripConceptReadModel_get',meta:{readOnly:true,onDemand:true,bootstrapInflation:false,directSheetWrites:false,newSsot:false}};}
