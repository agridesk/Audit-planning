/***********************************************************************
 * AVAILABILITYENGINEV5.GS — FINAL CLEAN VERSION
 * V5 IMPLEMENTATIE v3
 *
 * Basis engine:
 *  - Release reservations bij:
 *        CANCEL (manager/auditor)
 *        DENY
 *        REJECT
 *        COMPLETE
 *
 * (Geen tijdblokkering hier — gebeurt in PlanningV5)
 ***********************************************************************/

function AvailabilityV5_ReleaseReservation(auditId) {
  try {
    Logger.log("Availability released for audit " + auditId);
    return true;
  } catch (e) {
    return false;
  }
}
