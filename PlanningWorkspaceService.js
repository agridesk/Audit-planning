/***********************************************************************
 * PlanningWorkspaceService.js
 * BUILD: 2026-09-13_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_R4_PLANNED_DETAIL
 *
 * Thin RPC/service facade for Planning Workspace 2.0.
 * Delegates exclusively to existing canonical/read-model owners.
 * Workspace planning demand is canonical Pending Planning only.
 ***********************************************************************/
var PLANNING_WORKSPACE_SERVICE_BUILD='2026-09-13_PLANNING_WORKSPACE_2_0_SERVICE_FACADE_R4_PLANNED_DETAIL';

function PWS_dependencies_(){return{
  advisory:typeof ConceptPlanningService_get==='function',
  overlays:typeof PlanningWorkspaceOverlayBundle_get==='function',
  conceptUpsert:typeof ConceptReservationCommandService_upsert==='function',
  conceptRelease:typeof ConceptReservationCommandService_release==='function',
  canonicalCommit:typeof PlanningCanonicalCommitService_commit==='function',
  canonicalModify:typeof PlanningCanonicalModifyService_modify==='function',
  canonicalCancel:typeof PlanningCanonicalCancelService_cancel==='function',
  plannedDetail:typeof PlanningWorkspacePlannedAuditReadService_get==='function'
};}
function PWS_assert_(name){var d=PWS_dependencies_();if(!d[name])throw new Error('PlanningWorkspaceService: dependency unavailable: '+name);}
function PWS_pendingPlanningInput_(input){input=input||{};var out={};for(var k in input)if(Object.prototype.hasOwnProperty.call(input,k))out[k]=input[k];out.status='Pending Planning';return out;}
function PlanningWorkspaceService_getAdvisory(input){PWS_assert_('advisory');return ConceptPlanningService_get(PWS_pendingPlanningInput_(input));}
function PlanningWorkspaceService_getOverlays(input){PWS_assert_('overlays');return PlanningWorkspaceOverlayBundle_get(input||{});}
function PlanningWorkspaceService_saveConcept(input){PWS_assert_('conceptUpsert');return ConceptReservationCommandService_upsert(input||{});}
function PlanningWorkspaceService_releaseConcept(input){PWS_assert_('conceptRelease');return ConceptReservationCommandService_release(input||{});}
function PlanningWorkspaceService_commit(input){PWS_assert_('canonicalCommit');return PlanningCanonicalCommitService_commit(input||{});}
function PlanningWorkspaceService_modifyPlanned(input){PWS_assert_('canonicalModify');return PlanningCanonicalModifyService_modify(input||{});}
function PlanningWorkspaceService_cancelPlanned(input){PWS_assert_('canonicalCancel');return PlanningCanonicalCancelService_cancel(input||{});}
function PlanningWorkspaceService_getPlannedAudit(input){PWS_assert_('plannedDetail');return PlanningWorkspacePlannedAuditReadService_get(input||{});}
function PlanningWorkspaceService_contract(){return{
  build:PLANNING_WORKSPACE_SERVICE_BUILD,
  dependencies:PWS_dependencies_(),
  endpoints:{
    advisory:'ConceptPlanningService_get',
    overlays:'PlanningWorkspaceOverlayBundle_get',
    saveConcept:'ConceptReservationCommandService_upsert',
    releaseConcept:'ConceptReservationCommandService_release',
    commit:'PlanningCanonicalCommitService_commit',
    modifyPlanned:'PlanningCanonicalModifyService_modify',
    cancelPlanned:'PlanningCanonicalCancelService_cancel',
    plannedDetail:'PlanningWorkspacePlannedAuditReadService_get'
  },
  meta:{thinFacade:true,workspaceDemandStatus:'Pending Planning',plannedAuditsExcludedFromAdvisory:true,newSsot:false,directSheetReads:false,directSheetWrites:false,canonicalCommitOnly:true,canonicalModifyCommand:true,canonicalCancelCommand:true,plannedDetailOnDemand:true,legacyPlanningWriterCalledDirectly:false}
};}
