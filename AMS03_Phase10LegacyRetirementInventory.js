/***********************************************************************
 * AMS03_Phase10LegacyRetirementInventory.js
 * BUILD: 2026-09-23_AMS03_PHASE10_LEGACY_RETIREMENT_INVENTORY_R1
 * Static governance inventory. No runtime mutation.
 ***********************************************************************/
var AMS03_PHASE10_LEGACY_BUILD='2026-09-23_AMS03_PHASE10_LEGACY_RETIREMENT_INVENTORY_R1';
function RUN_AMS03_PHASE10_LEGACY_RETIREMENT_INVENTORY(){
 var owners={workspaceCommit:'PlanningCanonicalCommitService_commit',workspaceModify:'PlanningCanonicalModifyService_modify',workspaceCancel:'PlanningCanonicalCancelService_cancel',scopeLifecycle:'ModelCScopeOwner_commit',companyScopes:'Company_Scopes',obligations:'Audit_Obligations',visitLinks:'Audit_Visit_Obligations',availability:'Auditor Availability'};
 var legacy=[
  {surface:'AuditPlanningEngine',classification:'COMPATIBILITY_WRITE_PATH',retireWhen:'all callers routed through canonical Planning 2.0 commands'},
  {surface:'AuditManagerToolsLegacyCreate',classification:'LEGACY_CREATE_PATH',retireWhen:'scope/create UI fully Model C materialized'},
  {surface:'AuditManagerToolsShared.m5t_createAuditRowFromCompaniesPool_',classification:'COMPATIBILITY_VISIT_MATERIALIZATION',retireWhen:'Model C visit creation owns all creation cases'},
  {surface:'AuditManagerToolsScopes',classification:'LEGACY_SCOPE_UI_WRITE_PATH',retireWhen:'Scope Manager exclusively uses ModelCScopeOwner_commit'},
  {surface:'AuditManagerHelpers extension projection',classification:'LEGACY_LIFECYCLE_PROJECTION_WRITE',retireWhen:'all consumers read Model C expiry projection'},
  {surface:'AuditTimeV5',classification:'DERIVED_LEGACY_PROJECTION_WRITE',retireWhen:'formal hours consumers use Audit_Obligations'},
  {surface:'RejectedAuditsV5',classification:'LEGACY_STATUS_WRITE_PATH',retireWhen:'all cancel/reject flows use canonical status commands'}
 ];
 var out={ok:true,build:AMS03_PHASE10_LEGACY_BUILD,canonicalOwners:owners,legacyInventory:legacy,summary:{legacySurfaces:legacy.length,automaticRetirementAllowed:0},meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false,newSsot:false,retirementPolicy:'INVENTORY_FIRST_NO_BIG_BANG',auditPlanningRole:'OPERATIONAL_COMPATIBILITY_PROJECTION'}};Logger.log(JSON.stringify(out,null,2));return out;
}
