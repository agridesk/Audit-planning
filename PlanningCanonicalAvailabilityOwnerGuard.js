/***********************************************************************
 * PlanningCanonicalAvailabilityOwnerGuard.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_OWNER_GUARD_R2_ACTUAL_API
 *
 * AvailabilityService is the canonical owner. Its actual public write API is
 * validate + writeBack + clearAuditId; legacy reserve aliases are not required.
 ***********************************************************************/
var PLANNING_CANONICAL_AVAILABILITY_OWNER_GUARD_BUILD='2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_OWNER_GUARD_R2_ACTUAL_API';
function PlanningCanonicalAvailabilityOwnerGuard_evaluate(){
  var serviceObject=typeof AvailabilityService!=='undefined'&&AvailabilityService;
  var canonicalAvailable=!!(serviceObject&&typeof serviceObject.validate==='function'&&typeof serviceObject.writeBack==='function'&&typeof serviceObject.clearAuditId==='function');
  var candidates=[
    {name:'AvailabilityService.validate',available:!!(serviceObject&&typeof serviceObject.validate==='function')},
    {name:'AvailabilityService.writeBack',available:!!(serviceObject&&typeof serviceObject.writeBack==='function')},
    {name:'AvailabilityService.clearAuditId',available:!!(serviceObject&&typeof serviceObject.clearAuditId==='function')}
  ];
  return{success:true,build:PLANNING_CANONICAL_AVAILABILITY_OWNER_GUARD_BUILD,canProceed:canonicalAvailable,reason:canonicalAvailable?'CANONICAL_AVAILABILITY_OWNER_AVAILABLE':'CANONICAL_AVAILABILITY_OWNER_UNAVAILABLE',selectedOwner:canonicalAvailable?'AvailabilityService.writeBack':'',candidates:candidates,meta:{readOnly:true,writes:false,directFallbackAccepted:false,canonicalCommitOnly:true,legacyEntrypointsUntouched:true,canonicalOwner:'AvailabilityService',actualPublicWriteApi:'AvailabilityService.writeBack'}};
}
