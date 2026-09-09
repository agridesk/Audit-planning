/***********************************************************************
 * PlanningCanonicalAvailabilityOwnerGuard.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_OWNER_GUARD_R1
 *
 * Canonical Workspace commit must not depend on the direct Availability
 * fallback when no canonical Availability reservation service is available.
 * This guard is read-only and runs before the canonical writer.
 ***********************************************************************/
var PLANNING_CANONICAL_AVAILABILITY_OWNER_GUARD_BUILD='2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_OWNER_GUARD_R1';
function PlanningCanonicalAvailabilityOwnerGuard_evaluate(){
  var candidates=[
    {name:'AvailabilityService_reserveAudit_',available:typeof AvailabilityService_reserveAudit_==='function'},
    {name:'AvailabilityService_applyPlanningBlocks_',available:typeof AvailabilityService_applyPlanningBlocks_==='function'},
    {name:'AV_reserveAudit_',available:typeof AV_reserveAudit_==='function'},
    {name:'V5_availabilityReserveAuditBlocks_',available:typeof V5_availabilityReserveAuditBlocks_==='function'}
  ];
  var selected='';
  for(var i=0;i<candidates.length;i++){if(candidates[i].available){selected=candidates[i].name;break;}}
  return{success:true,build:PLANNING_CANONICAL_AVAILABILITY_OWNER_GUARD_BUILD,canProceed:!!selected,reason:selected?'CANONICAL_AVAILABILITY_OWNER_AVAILABLE':'CANONICAL_AVAILABILITY_OWNER_UNAVAILABLE',selectedOwner:selected,candidates:candidates,meta:{readOnly:true,writes:false,directFallbackAccepted:false,canonicalCommitOnly:true,legacyEntrypointsUntouched:true}};
}
