/***********************************************************************
 * PlanningCanonicalAvailabilityAdapter.js
 * BUILD: 2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_ADAPTER_R1
 *
 * Thin owner adapter for the new canonical commit path only.
 * Uses AvailabilityService public API. No direct Sheet fallback.
 ***********************************************************************/
var PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD='2026-09-09_ROADMAP_2_4_CANONICAL_AVAILABILITY_ADAPTER_R1';
function PCA_clean_(v){return String(v==null?'':v).trim();}
function PlanningCanonicalAvailabilityAdapter_dependencies(){var s=typeof AvailabilityService!=='undefined'&&AvailabilityService;return{service:!!s,validate:!!(s&&typeof s.validate==='function'),writeBack:!!(s&&typeof s.writeBack==='function'),clearAuditId:!!(s&&typeof s.clearAuditId==='function')};}
function PlanningCanonicalAvailabilityAdapter_validate(input){input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();if(!d.validate)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_VALIDATE_UNAVAILABLE'};return AvailabilityService.validate(PCA_clean_(input.auditId),PCA_clean_(input.auditorEmail),PCA_clean_(input.auditorName),input.blocks||[]);}
function PlanningCanonicalAvailabilityAdapter_reserve(input){input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();if(!d.writeBack)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_WRITEBACK_UNAVAILABLE'};return AvailabilityService.writeBack(PCA_clean_(input.auditId),PCA_clean_(input.auditorEmail),PCA_clean_(input.auditorName),input.blocks||[],'PLAN');}
function PlanningCanonicalAvailabilityAdapter_release(input){input=input||{};var d=PlanningCanonicalAvailabilityAdapter_dependencies();if(!d.clearAuditId)return{success:false,build:PLANNING_CANONICAL_AVAILABILITY_ADAPTER_BUILD,reason:'CANONICAL_AVAILABILITY_RELEASE_UNAVAILABLE'};return AvailabilityService.clearAuditId(PCA_clean_(input.auditId));}
