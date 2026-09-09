/***********************************************************************
 * PlanningWorkspaceService.js
 * BUILD: 2026-09-09_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_R1
 *
 * Thin RPC/service facade for Planning Workspace 2.0.
 * Delegates exclusively to existing canonical/read-model owners.
 ***********************************************************************/
var PLANNING_WORKSPACE_SERVICE_BUILD='2026-09-09_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_R1';

function PWS_dependencies_(){return{
  advisory:typeof ConceptPlanningService_get==='function',
  overlays:typeof PlanningWorkspaceOverlayBundle_get==='function',
  conceptUpsert:typeof ConceptReservationCommandService_upsert==='function',
  conceptRelease:typeof ConceptReservationCommandService_release==='function',
  canonicalCommit:typeof PlanningCanonicalCommitService_commit==='function'
};}
function PWS_assert_(name){var d=PWS_dependencies_();if(!d[name])throw new Error('PlanningWorkspaceService: dependency unavailable: '+name);}
function PlanningWorkspaceService_getAdvisory(input){PWS_assert_('advisory');return ConceptPlanningService_get(input||{});}
function PlanningWorkspaceService_getOverlays(input){PWS_assert_('overlays');return PlanningWorkspaceOverlayBundle_get(input||{});}
function PlanningWorkspaceService_saveConcept(input){PWS_assert_('conceptUpsert');return ConceptReservationCommandService_upsert(input||{});}
function PlanningWorkspaceService_releaseConcept(input){PWS_assert_('conceptRelease');return ConceptReservationCommandService_release(input||{});}
function PlanningWorkspaceService_commit(input){PWS_assert_('canonicalCommit');return PlanningCanonicalCommitService_commit(input||{});}
function PlanningWorkspaceService_contract(){return{
  build:PLANNING_WORKSPACE_SERVICE_BUILD,
  dependencies:PWS_dependencies_(),
  endpoints:{
    advisory:'ConceptPlanningService_get',
    overlays:'PlanningWorkspaceOverlayBundle_get',
    saveConcept:'ConceptReservationCommandService_upsert',
    releaseConcept:'ConceptReservationCommandService_release',
    commit:'PlanningCanonicalCommitService_commit'
  },
  meta:{thinFacade:true,newBusinessRules:false,newSsot:false,directSheetReads:false,directSheetWrites:false,canonicalCommitOnly:true,legacyPlanningWriterCalledDirectly:false}
};}
