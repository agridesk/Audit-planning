/***********************************************************************
 * AMS03_Phase10LegacyCallerInventory.js
 * BUILD: 2026-09-23_AMS03_PHASE10_CALLER_INVENTORY_R2_CALLER_EVIDENCE
 * Explicit migration map; no automatic retirement.
 ***********************************************************************/
function RUN_AMS03_PHASE10_LEGACY_CALLER_INVENTORY(){
 var items=[
  {surface:'AuditManagerToolsLegacyCreate.manageScopesCreateAudit',classification:'ISOLATED_LEGACY_CREATE',replacement:'Planning Workspace canonical commit chain',retireNow:false,reason:'Caller migration not proven.'},
  {surface:'AuditManagerToolsShared.m5t_createAuditRowFromCompaniesPool_',classification:'COMPATIBILITY_VISIT_MATERIALIZATION',replacement:'Model C visit materialization / canonical planning',retireNow:false,reason:'Still required by Model C ECAS materialization and compatibility scope UI.'},
  {surface:'AuditManagerToolsScopes.m5t_upsertScopes',classification:'ACTIVE_COMPATIBILITY_UI',replacement:'ModelCScopeOwner_commit already owns lifecycle mutation',retireNow:false,reason:'Scope UI still active; legacy row creation remains compatibility bridge.'},
  {surface:'AuditTimeV5_RebuildTotalHours',classification:'DERIVED_LEGACY_PROJECTION_FULL_REBUILD_ADMIN_ONLY',replacement:'AuditTimeV5_RebuildTotalHoursForAuditId for operational single-audit actions; Model C obligations + visit projection remains lifecycle owner',retireNow:false,reason:'Operational Auditor completion is migrated to audit-scoped rebuild; full rebuild retained as explicit fallback/admin repair.'},
  {surface:'AuditManagerHelpers extension projection',classification:'DERIVED_LEGACY_LIFECYCLE_PROJECTION',replacement:'Model C obligation planning window',retireNow:false,reason:'Consumer migration evidence required.'},
  {surface:'RejectedAuditsV5',classification:'ACTIVE_COMPATIBILITY_STATUS_SIDE_EFFECT',replacement:'CoreStatusMachine canonical transition plus indexed compatibility projection',retireNow:false,reason:'CoreStatusMachine still invokes V5_MoveAuditToRejected; lookup and planning-field clear are now Audit-ID indexed/single-row.'},
  {surface:'Audit planning',classification:'OPERATIONAL_COMPATIBILITY_PROJECTION',replacement:'Model C lifecycle plus canonical planning services',retireNow:false,reason:'Operational projection remains required during migration.'}
 ];
 var out={ok:true,build:'2026-09-23_AMS03_PHASE10_CALLER_INVENTORY_R2_CALLER_EVIDENCE',total:items.length,automaticRetirementAllowed:0,items:items,governance:{deleteHistory:false,bigBangRetirement:false,proveCallerMigrationBeforeRetire:true,newSsot:false},meta:{nonDestructive:true,liveReadsPerformed:false,liveWritesPerformed:false}};Logger.log(JSON.stringify(out,null,2));return out;
}
