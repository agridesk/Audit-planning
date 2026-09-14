/***********************************************************************
 * PlanningCanonicalAvailabilityAdapter.js
 * BUILD: 2026-09-14_ROADMAP_2_4_CANONICAL_AVAILABILITY_ADAPTER_R2_RELEASE_RECONCILE
 *
 * Thin owner adapter for the canonical commit path.
 * Uses AvailabilityService public API; release may additionally invoke the
 * targeted Availability release reconciler for legacy anonymous NO rows on
 * the old canonical planning dates.
 ***********************************************************************/
var PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD='2026-09-14_ROADMAP_2_4_CANONICAL_AVAILABILITY_ADAPTER_R2_RELEASE_RECONCILE';
function PCA_clean_(v){return String(v==null?'':v).trim();}
function PlanningCanonicalAvailabilityAdapter_dependencies(){var s=typeof AvailabilityService!=='undefined'&&AvailabilityService;return{service:!!s,validate:!!(s&&typeof s.validate==='function'),writeBack:!!(s&&typeof s.writeBack==='function'),clearAuditId:!!(s&&typeof s.clearAuditId==='function'),releaseReconciler:typeof AvailabilityServiceReleaseReconciler_reconcile==='function'};}
function PlanningCanonicalAvailabilityAdapter_validate(input){input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();if(!d.validate)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_VALIDATE_UNAVAILABLE'};return AvailabilityService.validate(PCA_clean_(input.auditId),PCA_clean_(input.auditorEmail),PCA_clean_(input.auditorName),input.blocks||[]);}
function PlanningCanonicalAvailabilityAdapter_reserve(input){input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();if(!d.writeBack)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_WRITEBACK_UNAVAILABLE'};return AvailabilityService.writeBack(PCA_clean_(input.auditId),PCA_clean_(input.auditorEmail),PCA_clean_(input.auditorName),input.blocks||[],'PLAN');}
function PlanningCanonicalAvailabilityAdapter_release(input){
  input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();
  if(!d.clearAuditId)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_RELEASE_UNAVAILABLE'};
  var cleared=AvailabilityService.clearAuditId(PCA_clean_(input.auditId));
  if(!cleared||cleared.success===false)return cleared||{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_RELEASE_FAILED'};
  var reconcile=null;
  if(d.releaseReconciler&&PCA_clean_(input.auditorEmail)&&Array.isArray(input.blocks)&&input.blocks.length){
    reconcile=AvailabilityServiceReleaseReconciler_reconcile({auditorEmail:PCA_clean_(input.auditorEmail),blocks:input.blocks,auditId:PCA_clean_(input.auditId)});
    if(!reconcile||reconcile.success===false)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'RELEASE_RECONCILE_FAILED',clearResult:cleared,reconcileResult:reconcile||null};
  }
  return{success:true,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,changed:Number(cleared.changed||0),rows:Number(cleared.rows||0),deletedRows:Number(cleared.deletedRows||0),message:PCA_clean_(cleared.message)||'Released',clearResult:cleared,reconcileResult:reconcile,meta:{legacyAnonymousNoRepair:!!reconcile,newSsot:false}};
}
