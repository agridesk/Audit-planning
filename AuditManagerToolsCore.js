// BUILD: AuditManagerToolsCore_20260425
// Final bootstrap only. Keep m5t_bootstrap name for UI compatibility.

function m5t_bootstrap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    if (typeof CompaniesIndex_ClearCache === 'function') {
      CompaniesIndex_ClearCache();
    }
  } catch (eCompaniesCache) {}

  return {
    success: true,
    existingCompanies: m5t_listExistingAuditCompanies_(ss),
    newCompanies: m5t_listNewCompaniesPool_(ss),
    scopesCatalog: m5t_listScopeCatalog_(ss),
    refreshedAt: new Date().toISOString()
  };
}



/***********************************************************************
 * FINAL OVERRIDE — ROTATION GLOBAL CACHE/REFRESH FIX 2026-04-25
 *
 * PURPOSE
 * - Rotation Overview Refresh must read current Log realized audits.
 * - Kill all old cache keys (V1/V2/V3/V4/V5) that could keep stale output alive.
 * - Make cached entrypoint a correctness wrapper, not a stale cache source.
 * - No status/action/availability/planning mutation changes.
 ***********************************************************************/

