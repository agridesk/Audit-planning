/** FILE: BatchPlanningAtomicCommitArchitecture.gs
 * BUILD: 2026-09-18_BATCH_PLANNING_ATOMIC_COMMIT_ARCH_R1
 * Safety architecture only. Public Batch commit remains disabled.
 *
 * DECISION:
 * Current managerV5_planAudit / Planning_executeWrite_ mutates Availability before
 * Audit planning and is single-audit transactional only. A loop cannot guarantee
 * all-or-none semantics. LockService prevents concurrent commits but is not rollback.
 *
 * Required definitive Batch transaction:
 * 1. Build requests from server-validated concept.
 * 2. Acquire script lock.
 * 3. Re-run whole-batch canonical preflight under lock.
 * 4. Snapshot every affected Audit planning row and every affected Availability row.
 * 5. Commit through a batch-aware canonical Planning owner (not a UI-side loop).
 * 6. On any mutation failure restore both owners from snapshots before releasing lock.
 * 7. Queue PLAN notifications only after the entire batch commit succeeds.
 * 8. Invalidate caches once after commit/rollback.
 *
 * Until that owner exists and rollback is behaviorally verified,
 * confirmBatchPlanningV5 MUST return BATCH_COMMIT_NOT_ENABLED.
 */
var BATCH_PLANNING_ATOMIC_COMMIT_ARCH_BUILD='2026-09-18_BATCH_PLANNING_ATOMIC_COMMIT_ARCH_R1';
function BatchPlanningAtomicCommit_Architecture(){return{ok:true,build:BATCH_PLANNING_ATOMIC_COMMIT_ARCH_BUILD,publicCommitEnabled:false,lockPurpose:'SERIALIZATION_ONLY',atomicityRequired:true,rollbackRequired:true,notificationAfterCommitRequired:true,canonicalOwners:['AuditPlanningEngine','AvailabilityService','StatusMachine','Notification Queue'],writesPerformed:false};}
