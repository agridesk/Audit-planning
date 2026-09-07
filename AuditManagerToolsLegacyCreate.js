// BUILD: AuditManagerToolsLegacyCreate_20260425
// Legacy create helpers kept unchanged for compatibility.

function getManageScopesOverview() {
  var ss = SpreadsheetApp.getActive();
  var companiesSheet = ss.getSheetByName("Companies");
  var apSheet = ss.getSheetByName("Audit planning");

  if (!companiesSheet || !apSheet) {
    return { success: false, message: "Missing sheet(s) Companies and/or Audit planning" };
  }

  var compData = companiesSheet.getDataRange().getValues();
  if (compData.length < 2) {
    return { success: true, companies: [] };
  }

  var compHdr = compData[0];
  var idxCompName = compHdr.indexOf("Company");

  var apData = apSheet.getDataRange().getValues();
  var apHdr  = apData[0];
  var idxApComp   = apHdr.indexOf("Company");

  var countByCompany = {};

  if (apData.length > 1 && idxApComp >= 0) {
    for (var r = 1; r < apData.length; r++) {
      var row = apData[r];
      var cName = row[idxApComp];
      if (!cName) continue;
      if (!countByCompany[cName]) countByCompany[cName] = 0;
      countByCompany[cName]++;
    }
  }

  var out = [];
  for (var i = 1; i < compData.length; i++) {
    var rowC = compData[i];
    var name = idxCompName >= 0 ? rowC[idxCompName] : "";
    if (!name) continue;

    var total = countByCompany[name] || 0;
    out.push({ companyName: name, totalAudits: total, hasAudits: total > 0 });
  }

  return { success: true, companies: out };
}

/**
 * CREATE (legacy): append new audit row in Audit planning by companyName.
 * NOTE: This remains for backward compatibility. New flow uses Company_UID via m5t_createAuditRowFromCompaniesPool_().
 */
function manageScopesCreateAudit(companyName, location, year) {
  companyName = String(companyName || "").trim();
  location    = String(location || "").trim();

  if (!companyName) {
    return { success: false, message: "Company name is required" };
  }

  var ss = SpreadsheetApp.getActive();
  var companiesSheet = ss.getSheetByName("Companies");
  var apSheet        = ss.getSheetByName("Audit planning");

  if (!companiesSheet || !apSheet) {
    return { success: false, message: "Missing sheet(s) Companies and/or Audit planning" };
  }

  _ms_ensureCompanyRow_(companiesSheet, companyName, location);

  var apHdr = apSheet.getRange(1, 1, 1, apSheet.getLastColumn()).getValues()[0];
  var apMap = _ms_headerMap_(apHdr);

  var newRowIdx = apSheet.getLastRow() + 1;
  var row = new Array(apHdr.length);
  for (var i = 0; i < row.length; i++) row[i] = "";

  if (apMap.Company != null) row[apMap.Company] = companyName;
  if (apMap.Status  != null) row[apMap.Status]  = "Pending Planning";

  apSheet.getRange(newRowIdx, 1, 1, row.length).setValues([row]);

  var auditId = _ms_generateAuditIdForRow_(apSheet, newRowIdx, apMap);

  return { success: true, auditId: auditId, rowIndex: newRowIdx };
}

/**
 * Header map: { "HeaderName": zeroBasedIndex }
 */
function _ms_headerMap_(hdrRow) {
  var map = {};
  for (var c = 0; c < hdrRow.length; c++) {
    var h = hdrRow[c];
    if (!h || typeof h !== "string") continue;
    map[h] = c;
  }
  return map;
}

/**
 * Ensure a company row exists in Companies sheet.
 */
function _ms_ensureCompanyRow_(sheet, companyName, location) {
  var data = sheet.getDataRange().getValues();
  var hdr  = data[0];
  var map  = _ms_headerMap_(hdr);

  var idxCompany  = map["Company"];
  var idxLocation = map["Location"];

  var foundRow = -1;

  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var name = idxCompany != null ? row[idxCompany] : "";
    if (!name) continue;
    if (String(name).trim() === companyName) {
      foundRow = r + 1;
      break;
    }
  }

  if (foundRow > 0) {
    if (location && idxLocation != null) {
      var currentLoc = sheet.getRange(foundRow, idxLocation + 1).getValue();
      if (!currentLoc) {
        sheet.getRange(foundRow, idxLocation + 1).setValue(location);
        // δ9 (2026-05-03): location backfilled on existing Companies row →
        // evict persist + MP_CC_V1 NM-key (no uid known in legacy creator).
        _ms_invalidateCompaniesCacheD9_(companyName, location);
      }
    }
    return;
  }

  var newRowIdx = sheet.getLastRow() + 1;
  var newRow = new Array(hdr.length);
  for (var i = 0; i < newRow.length; i++) newRow[i] = "";

  if (idxCompany != null)  newRow[idxCompany]  = companyName;
  if (idxLocation != null) newRow[idxLocation] = location || "";

  sheet.getRange(newRowIdx, 1, 1, newRow.length).setValues([newRow]);
  // δ9 (2026-05-03): new Companies row created → evict persist + MP_CC_V1
  // NM-key. Uid is set later by CompaniesBackend.saveCompanyDetail (which
  // has its own δ9 invalidation), so name|loc is the only key we can hit here.
  _ms_invalidateCompaniesCacheD9_(companyName, location || "");
}

// δ9 (2026-05-03): shared invalidator helper for legacy company creator.
// fail-loud Logger only — never throw, never block the create flow.
function _ms_invalidateCompaniesCacheD9_(companyName, location) {
  try {
    if (typeof __mp_invalidatePersistCaches_ === 'function') {
      __mp_invalidatePersistCaches_(['Companies']);
    }
    if (typeof _mp_invalidateCompanyConstraintsCache_ === 'function') {
      _mp_invalidateCompanyConstraintsCache_('', String(companyName || ''), String(location || ''));
    }
  } catch (_e9) {
    try { Logger.log('[δ9][_ms_ensureCompanyRow_] invalidate failed: ' + _e9); } catch (_) {}
  }
}

/**
 * Generate unified Audit ID for a given row in Audit planning sheet.
 */
function _ms_generateAuditIdForRow_(sheet, rowIndex, apMap) {
  var hdr;
  if (!apMap) {
    hdr  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    apMap = _ms_headerMap_(hdr);
  }

  var idxAuditIdCol = apMap["Audit ID"];
  if (idxAuditIdCol == null) {
    return "";
  }

  var company = "";
  if (apMap.hasOwnProperty("Company")) {
    company = sheet.getRange(rowIndex, apMap["Company"] + 1).getValue();
  }

  var token = String(company || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 16);

  if (!token) token = "UNKNOWN";

  var epoch = new Date().getTime();
  var rand4 = Math.floor(Math.random() * 36 * 36 * 36 * 36)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");

  var id = "AUD_" + token + "_" + epoch + "_" + rand4;

  sheet.getRange(rowIndex, idxAuditIdCol + 1).setValue(id);

  return id;
}



// ============================================================
// OVERRIDE BLOCK — 2026-04-14
// Company Scope Manager rebuild:
// - Existing audits: fixed Audit planning scope/hour columns C:R
// - New companies: defaults from Config_Scopes!Default_hours
// - Preassigned auditor uses EMAIL as identifier
// - Date fields always written as TEXT yyyy-mm-dd
// ============================================================

