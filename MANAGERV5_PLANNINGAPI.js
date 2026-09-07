/***************************************************************
 * MANAGERV5_PLANNINGAPI.GS — CLEAN FINAL VERSION
 * Exclusieve koppellaag tussen UI en backend.
 * V5 Implementatie v3
 ***************************************************************/

function managerV5_getCurrentUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || "";
  } catch (e) {
    return "";
  }
}

function managerV5_planAudit(request) {
  if (!request || !request.auditId) {
    return {
      success: false,
      message: "Missing auditId",
      plannedHours: 0,
      requiredHours: 0,
      softConflicts: [],
      hardConflicts: [{ date: null, reason: "auditId missing" }],
      newStatus: null
    };
  }

  const full = {
    actorRole: "MANAGER",
    actorEmail: managerV5_getCurrentUserEmail_(),
    auditId: request.auditId,
    auditorName: request.auditorName || null,
    auditorEmail: request.auditorEmail || null,
    blocks: request.blocks || [],
    allowSoftCompanyOverride:
      typeof request.allowSoftCompanyOverride === "boolean"
        ? request.allowSoftCompanyOverride
        : true,
    allowSoftAuditorOverride:
      typeof request.allowSoftAuditorOverride === "boolean"
        ? request.allowSoftAuditorOverride
        : true,
    allowWeekendOverride:
      typeof request.allowWeekendOverride === "boolean"
        ? request.allowWeekendOverride
        : true
  };

  return planAuditV5_(full);
}
