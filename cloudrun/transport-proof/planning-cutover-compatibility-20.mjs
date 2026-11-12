/** Issue #87. Read-only DEV cutover readiness. No secrets, no writes, no gate activation.
 * The names below are explicit live write surfaces; a runtime flag does NOT
 * constitute proof that a route was actually migrated.
 */
export const compositionLiveWriterSurfaces20=Object.freeze([
 '/api/v1/manager/self-planning-direct',
 '/api/v1/manager/extension-obligation-command',
 '/api/v1/manager/extension-reconcile-projection',
 '/api/v1/manager/extension-direct',
 '/api/v1/manager/extension',
 '/api/v1/planning/commit-handoff',
 '/api/v1/manager/approve-direct',
 '/api/v1/manager/cancel-direct',
 '/api/v1/manager/reject-direct',
 '/api/v1/manager/complete-direct',
 '/api/v1/auditor/action',
 '/api/v1/internal/auditor/complete-direct'
]);
export function planningCutoverCompatibility20({environment,atomicEnabled,compositionEnabled,
 legacyRetired,managerOwnerShared,backfillParity,legacyWritersFrozen,liveWriterRouteParityVerified,
 migratedWriterPaths=[],deferredManagementRoutes=[]}={}){
 const isDev=environment==='DEV';
 const migrated=new Set(Array.isArray(migratedWriterPaths)?migratedWriterPaths:[]);
 const pending=compositionLiveWriterSurfaces20.filter(path=>!migrated.has(path));
 const blockers=[];
 if(!isDev)blockers.push('DEV_ONLY');
 if(!atomicEnabled)blockers.push('FIRESTORE_ATOMIC_AUTHORITY_DISABLED');
 if(!compositionEnabled)blockers.push('COMPOSITION_WRITE_DISABLED');
 if(!legacyRetired)blockers.push('GAS_LIFECYCLE_WRITER_RETIREMENT_UNVERIFIED');
 if(!managerOwnerShared)blockers.push('MANAGER_LIFECYCLE_OWNER_UNVERIFIED');
 if(!backfillParity)blockers.push('BACKFILL_PARITY_UNVERIFIED');
 if(!legacyWritersFrozen)blockers.push('LEGACY_WRITER_FREEZE_UNVERIFIED');
 if(!liveWriterRouteParityVerified)blockers.push('LIVE_WRITER_ROUTE_PARITY_UNVERIFIED');
 if(pending.length)blockers.push('LIVE_WRITER_MIGRATION_INCOMPLETE');
 if(deferredManagementRoutes.length)blockers.push('MANAGEMENT_WRITER_MIGRATION_INCOMPLETE');
 return {ready:blockers.length===0,blockers,pendingWriterRoutes:pending,
  deferredManagementRoutes:deferredManagementRoutes.slice(),
  inspectedWriterRoutes:compositionLiveWriterSurfaces20.length,
  note:'Readiness inventory is not a substitute for transaction, parity and E2E evidence.'};
}
