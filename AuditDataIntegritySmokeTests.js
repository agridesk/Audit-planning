/**
 * =========================================================
 * AUDIT DATA INTEGRITY SMOKE TESTS
 * =========================================================
 * Build: 2026-05-01_COMPANY_UID_SSOT_SMOKE_002
 *
 * PURPOSE
 * Read-only smoke tests for Audit Planning data integrity.
 *
 * GOVERNANCE BASELINE
 * - Companies is SSoT for company master data.
 * - Company_UID is the unique company identity field.
 * - Audit planning may only contain companies that exist in Companies.
 * - Company name is display data only, never identity.
 * - Planning JSON is the planning truth for planned blocks/hours.
 * - This file does NOT change statuses, availability, planning, cache, or UI.
 *
 * PUBLIC FUNCTIONS
 * - AUDIT_DATA_SMOKE_Run_All()
 * - AUDIT_DATA_SMOKE_Run_CompanyUidIntegrity()
 * - AUDIT_DATA_SMOKE_Run_LifecycleMetadataGaps()
 * - AUDIT_DATA_SMOKE_Run_PlanningJsonHoursVisibility()
 *
 * OUTPUT
 * Writes/overwrites report tab:
 * - DATA_SMOKE_Report
 *
 * SAFETY
 * - Read-only except report tab output.
 * - No business writes.
 * - No cache invalidation.
 * - No status decisions.
 * =========================================================
 */

var AUDIT_DATA_SMOKE_BUILD = '2026-05-01_COMPANY_UID_SSOT_SMOKE_002';
var AUDIT_DATA_SMOKE_REPORT_TAB = 'DATA_SMOKE_Report';

function AUDIT_DATA_SMOKE_Run_All() {
  var started = new Date();
  var ss = AUDIT_DATA_SMOKE_getSs_();
  var report = [];

  AUDIT_DATA_SMOKE_pushHeader_(report, 'AUDIT DATA INTEGRITY SMOKE TESTS');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Build', AUDIT_DATA_SMOKE_BUILD);
  AUDIT_DATA_SMOKE_pushKv_(report, 'Started at', AUDIT_DATA_SMOKE_formatDateTime_(started));
  AUDIT_DATA_SMOKE_pushKv_(report, 'Mode', 'READ_ONLY_REPORT_ONLY');
  AUDIT_DATA_SMOKE_pushBlank_(report);

  var companyUid = AUDIT_DATA_SMOKE_Run_CompanyUidIntegrity(true);
  var lifecycle = AUDIT_DATA_SMOKE_Run_LifecycleMetadataGaps(true);
  var hours = AUDIT_DATA_SMOKE_Run_PlanningJsonHoursVisibility(true);

  AUDIT_DATA_SMOKE_appendSection_(report, companyUid);
  AUDIT_DATA_SMOKE_appendSection_(report, lifecycle);
  AUDIT_DATA_SMOKE_appendSection_(report, hours);

  var ok = !!(companyUid.ok && lifecycle.ok && hours.ok);
  AUDIT_DATA_SMOKE_pushBlank_(report);
  AUDIT_DATA_SMOKE_pushHeader_(report, 'SUMMARY');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Overall OK', ok ? 'YES' : 'NO');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Company UID integrity OK', companyUid.ok ? 'YES' : 'NO');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Lifecycle metadata OK', lifecycle.ok ? 'YES' : 'NO');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Planning JSON hours visibility OK', hours.ok ? 'YES' : 'NO');
  AUDIT_DATA_SMOKE_pushKv_(report, 'Finished at', AUDIT_DATA_SMOKE_formatDateTime_(new Date()));

  AUDIT_DATA_SMOKE_writeReport_(ss, report);

  var out = {
    success: ok,
    ok: ok,
    build: AUDIT_DATA_SMOKE_BUILD,
    reportTab: AUDIT_DATA_SMOKE_REPORT_TAB,
    companyUid: companyUid.summary,
    lifecycle: lifecycle.summary,
    planningJsonHours: hours.summary
  };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

function AUDIT_DATA_SMOKE_Run_CompanyUidIntegrity(returnOnly) {
  var ss = AUDIT_DATA_SMOKE_getSs_();
  var section = AUDIT_DATA_SMOKE_newSection_('Company_UID integrity');

  try {
    var companies = AUDIT_DATA_SMOKE_readSheet_(ss, 'Companies');
    var planning = AUDIT_DATA_SMOKE_readSheet_(ss, 'Audit planning');

    if (!companies.ok) throw new Error(companies.message);
    if (!planning.ok) throw new Error(planning.message);

    var cUid = AUDIT_DATA_SMOKE_findHeader_(companies.headers, ['Company_UID', 'Company UID', 'CompanyUID']);
    var cName = AUDIT_DATA_SMOKE_findHeader_(companies.headers, ['Company']);
    var cActive = AUDIT_DATA_SMOKE_findHeader_(companies.headers, ['Active', 'Status']);

    var pUid = AUDIT_DATA_SMOKE_findHeader_(planning.headers, ['Company_UID', 'Company UID', 'CompanyUID']);
    var pName = AUDIT_DATA_SMOKE_findHeader_(planning.headers, ['Company']);
    var pAuditId = AUDIT_DATA_SMOKE_findHeader_(planning.headers, ['Audit ID', 'Audit_ID']);
    var pStatus = AUDIT_DATA_SMOKE_findHeader_(planning.headers, ['Status']);

    if (cUid < 0) throw new Error('Companies missing Company_UID column');
    if (cName < 0) throw new Error('Companies missing Company column');
    if (pUid < 0) throw new Error('Audit planning missing Company_UID column');
    if (pName < 0) throw new Error('Audit planning missing Company column');
    if (pAuditId < 0) throw new Error('Audit planning missing Audit ID column');

    var companiesByUid = {};
    var companyNameToUids = {};
    var duplicateCompanyUids = [];
    var duplicateCompanyNames = [];
    var companiesMissingUid = [];

    for (var r = 0; r < companies.rows.length; r++) {
      var crow = companies.rows[r];
      var uid = AUDIT_DATA_SMOKE_clean_(crow[cUid]);
      var name = AUDIT_DATA_SMOKE_clean_(crow[cName]);
      var active = cActive >= 0 ? AUDIT_DATA_SMOKE_clean_(crow[cActive]) : '';
      var sheetRow = r + 2;

      if (!uid) {
        companiesMissingUid.push({ row: sheetRow, company: name });
        continue;
      }

      if (companiesByUid[uid]) {
        duplicateCompanyUids.push({ uid: uid, firstRow: companiesByUid[uid].row, duplicateRow: sheetRow, company: name });
      } else {
        companiesByUid[uid] = { uid: uid, company: name, active: active, row: sheetRow };
      }

      var nameKey = AUDIT_DATA_SMOKE_normCompanyName_(name);
      if (nameKey) {
        if (!companyNameToUids[nameKey]) companyNameToUids[nameKey] = { company: name, uids: {}, rows: [] };
        companyNameToUids[nameKey].uids[uid] = true;
        companyNameToUids[nameKey].rows.push(sheetRow);
      }
    }

    Object.keys(companyNameToUids).forEach(function(k) {
      var item = companyNameToUids[k];
      var uids = Object.keys(item.uids);
      if (uids.length > 1) {
        duplicateCompanyNames.push({ company: item.company, uidCount: uids.length, uids: uids.join(' | '), rows: item.rows.join(', ') });
      }
    });

    var apMissingUid = [];
    var apUidNotInCompanies = [];
    var apCompanyNameUidMismatch = [];

    for (var i = 0; i < planning.rows.length; i++) {
      var prow = planning.rows[i];
      var auditId = AUDIT_DATA_SMOKE_clean_(prow[pAuditId]);
      var status = pStatus >= 0 ? AUDIT_DATA_SMOKE_clean_(prow[pStatus]) : '';
      var company = AUDIT_DATA_SMOKE_clean_(prow[pName]);
      var companyUid = AUDIT_DATA_SMOKE_clean_(prow[pUid]);
      var apRow = i + 2;

      if (!auditId && !company && !companyUid && !status) continue;

      if (!companyUid) {
        apMissingUid.push({ row: apRow, auditId: auditId, company: company, status: status });
        continue;
      }

      if (!companiesByUid[companyUid]) {
        apUidNotInCompanies.push({ row: apRow, auditId: auditId, company: company, companyUid: companyUid, status: status });
        continue;
      }

      var masterCompany = AUDIT_DATA_SMOKE_clean_(companiesByUid[companyUid].company);
      if (company && masterCompany && AUDIT_DATA_SMOKE_normCompanyName_(company) !== AUDIT_DATA_SMOKE_normCompanyName_(masterCompany)) {
        apCompanyNameUidMismatch.push({
          row: apRow,
          auditId: auditId,
          auditPlanningCompany: company,
          companiesCompany: masterCompany,
          companyUid: companyUid,
          status: status
        });
      }
    }

    section.ok = duplicateCompanyUids.length === 0 && companiesMissingUid.length === 0 && apMissingUid.length === 0 && apUidNotInCompanies.length === 0 && apCompanyNameUidMismatch.length === 0;
    section.summary = {
      companiesRows: companies.rows.length,
      auditPlanningRows: planning.rows.length,
      duplicateCompanyUids: duplicateCompanyUids.length,
      duplicateCompanyNamesDifferentUid: duplicateCompanyNames.length,
      companiesMissingUid: companiesMissingUid.length,
      auditPlanningMissingCompanyUid: apMissingUid.length,
      auditPlanningUidNotInCompanies: apUidNotInCompanies.length,
      auditPlanningCompanyNameUidMismatch: apCompanyNameUidMismatch.length
    };

    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'OK', section.ok ? 'YES' : 'NO');
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Companies rows', companies.rows.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Audit planning rows', planning.rows.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Duplicate Company_UID in Companies', duplicateCompanyUids.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Duplicate Company name with different UID in Companies', duplicateCompanyNames.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Companies missing Company_UID', companiesMissingUid.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Audit planning missing Company_UID', apMissingUid.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Audit planning Company_UID not found in Companies', apUidNotInCompanies.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Audit planning Company display mismatch for UID', apCompanyNameUidMismatch.length);

    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Duplicate Company_UID in Companies', duplicateCompanyUids, ['uid', 'firstRow', 'duplicateRow', 'company']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Duplicate Company name with different UID in Companies', duplicateCompanyNames, ['company', 'uidCount', 'uids', 'rows']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Companies missing Company_UID', companiesMissingUid, ['row', 'company']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Audit planning missing Company_UID', apMissingUid, ['row', 'auditId', 'company', 'status']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Audit planning Company_UID not found in Companies', apUidNotInCompanies, ['row', 'auditId', 'company', 'companyUid', 'status']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Audit planning Company display mismatch for UID', apCompanyNameUidMismatch, ['row', 'auditId', 'auditPlanningCompany', 'companiesCompany', 'companyUid', 'status']);

  } catch (e) {
    section.ok = false;
    section.summary = { error: AUDIT_DATA_SMOKE_err_(e) };
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'ERROR', AUDIT_DATA_SMOKE_err_(e));
  }

  if (!returnOnly) AUDIT_DATA_SMOKE_writeReport_(ss, section.rows);
  return section;
}

function AUDIT_DATA_SMOKE_Run_LifecycleMetadataGaps(returnOnly) {
  var ss = AUDIT_DATA_SMOKE_getSs_();
  var section = AUDIT_DATA_SMOKE_newSection_('Lifecycle metadata governance');

  try {
    var planning = AUDIT_DATA_SMOKE_readSheet_(ss, 'Audit planning');
    if (!planning.ok) throw new Error(planning.message);

    var h = planning.headers;
    var cAuditId = AUDIT_DATA_SMOKE_findHeader_(h, ['Audit ID', 'Audit_ID']);
    var cCompany = AUDIT_DATA_SMOKE_findHeader_(h, ['Company']);
    var cStatus = AUDIT_DATA_SMOKE_findHeader_(h, ['Status']);
    var cDecision = AUDIT_DATA_SMOKE_findHeader_(h, ['Last manager decision']);
    var cDecisionTs = AUDIT_DATA_SMOKE_findHeader_(h, ['Last decision timestamp']);
    var cStatusSince = AUDIT_DATA_SMOKE_findHeader_(h, ['Status since']);
    var cJson = AUDIT_DATA_SMOKE_findHeader_(h, ['Planning JSON']);

    if (cAuditId < 0) throw new Error('Audit planning missing Audit ID column');
    if (cStatus < 0) throw new Error('Audit planning missing Status column');
    if (cDecision < 0) throw new Error('Audit planning missing Last manager decision column');
    if (cDecisionTs < 0) throw new Error('Audit planning missing Last decision timestamp column');
    if (cStatusSince < 0) throw new Error('Audit planning missing Status since column');

    var allowedManagerActions = { PLAN:true, APPROVE:true, DENY:true, CANCEL:true, REJECT:true, COMPLETE:true, COMPLETE_ON_BEHALF:true, STATUS_CHANGED:true };

    var statusSinceMissing = [];
    var managerDecisionInvalid = [];
    var managerDecisionWithoutTimestamp = [];
    var timestampWithoutManagerDecision = [];
    var managerActionMissingStatusSince = [];
    var managerDecisionLegacyText = [];
    var plannedRowsWithoutManagerDecision = [];

    for (var r = 0; r < planning.rows.length; r++) {
      var row = planning.rows[r];
      var auditId = AUDIT_DATA_SMOKE_clean_(row[cAuditId]);
      var company = cCompany >= 0 ? AUDIT_DATA_SMOKE_clean_(row[cCompany]) : '';
      var statusDisplay = AUDIT_DATA_SMOKE_clean_(row[cStatus]);
      var statusKey = AUDIT_DATA_SMOKE_normStatus_(statusDisplay);
      var decision = AUDIT_DATA_SMOKE_clean_(row[cDecision]);
      var decisionTs = AUDIT_DATA_SMOKE_clean_(row[cDecisionTs]);
      var statusSince = AUDIT_DATA_SMOKE_clean_(row[cStatusSince]);
      var planningJson = cJson >= 0 ? AUDIT_DATA_SMOKE_clean_(row[cJson]) : '';
      var rowNo = r + 2;

      if (!auditId && !company && !statusDisplay) continue;

      if (statusKey && !statusSince) statusSinceMissing.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay });

      if (decision) {
        var actionKey = AUDIT_DATA_SMOKE_normAction_(decision);
        if (decision.indexOf('->') >= 0 || decision.indexOf('|') >= 0) managerDecisionLegacyText.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, value: decision });
        if (!allowedManagerActions[actionKey]) managerDecisionInvalid.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, value: decision });
        if (!decisionTs) managerDecisionWithoutTimestamp.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, value: decision });
        if (!statusSince) managerActionMissingStatusSince.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, value: decision });
      }

      if (decisionTs && !decision) timestampWithoutManagerDecision.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, timestamp: decisionTs });
      if ((statusKey === 'APPROVED' || statusKey === 'ACCEPTED') && planningJson && !decision) plannedRowsWithoutManagerDecision.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, hasPlanningJson: 'YES' });
    }

    var blockingErrors = managerDecisionInvalid.length + managerDecisionWithoutTimestamp.length + timestampWithoutManagerDecision.length + managerActionMissingStatusSince.length + managerDecisionLegacyText.length;

    section.ok = blockingErrors === 0;
    section.summary = {
      statusSinceMissing: statusSinceMissing.length,
      invalidManagerDecisionValues: managerDecisionInvalid.length,
      managerDecisionWithoutTimestamp: managerDecisionWithoutTimestamp.length,
      timestampWithoutManagerDecision: timestampWithoutManagerDecision.length,
      managerActionMissingStatusSince: managerActionMissingStatusSince.length,
      managerDecisionLegacyText: managerDecisionLegacyText.length,
      plannedRowsWithoutManagerDecisionWarning: plannedRowsWithoutManagerDecision.length,
      blockingErrors: blockingErrors
    };

    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'OK', section.ok ? 'YES' : 'NO');
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Blocking lifecycle errors', blockingErrors);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Status since missing (legacy/backlog warning)', statusSinceMissing.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Invalid Last manager decision values', managerDecisionInvalid.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Legacy/prose Last manager decision values', managerDecisionLegacyText.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Manager decision without timestamp', managerDecisionWithoutTimestamp.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Timestamp without manager decision', timestampWithoutManagerDecision.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Manager action missing Status since', managerActionMissingStatusSince.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Planned rows without manager decision (warning only)', plannedRowsWithoutManagerDecision.length);

    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Invalid Last manager decision values', managerDecisionInvalid, ['row', 'auditId', 'company', 'status', 'value']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Legacy/prose Last manager decision values', managerDecisionLegacyText, ['row', 'auditId', 'company', 'status', 'value']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Manager decision without timestamp', managerDecisionWithoutTimestamp, ['row', 'auditId', 'company', 'status', 'value']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Timestamp without manager decision', timestampWithoutManagerDecision, ['row', 'auditId', 'company', 'status', 'timestamp']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Manager action missing Status since', managerActionMissingStatusSince, ['row', 'auditId', 'company', 'status', 'value']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Status since missing (legacy/backlog warning)', statusSinceMissing, ['row', 'auditId', 'company', 'status']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Planned rows without manager decision (warning only)', plannedRowsWithoutManagerDecision, ['row', 'auditId', 'company', 'status', 'hasPlanningJson']);

  } catch (e) {
    section.ok = false;
    section.summary = { error: AUDIT_DATA_SMOKE_err_(e) };
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'ERROR', AUDIT_DATA_SMOKE_err_(e));
  }

  if (!returnOnly) AUDIT_DATA_SMOKE_writeReport_(ss, section.rows);
  return section;
}


function AUDIT_DATA_SMOKE_Run_PlanningJsonHoursVisibility(returnOnly) {
  var ss = AUDIT_DATA_SMOKE_getSs_();
  var section = AUDIT_DATA_SMOKE_newSection_('Planning JSON hours visibility');

  try {
    var planning = AUDIT_DATA_SMOKE_readSheet_(ss, 'Audit planning');
    if (!planning.ok) throw new Error(planning.message);

    var h = planning.headers;
    var cAuditId = AUDIT_DATA_SMOKE_findHeader_(h, ['Audit ID', 'Audit_ID']);
    var cCompany = AUDIT_DATA_SMOKE_findHeader_(h, ['Company']);
    var cStatus = AUDIT_DATA_SMOKE_findHeader_(h, ['Status']);
    var cJson = AUDIT_DATA_SMOKE_findHeader_(h, ['Planning JSON']);

    if (cAuditId < 0) throw new Error('Audit planning missing Audit ID column');
    if (cStatus < 0) throw new Error('Audit planning missing Status column');
    if (cJson < 0) throw new Error('Audit planning missing Planning JSON column');

    var plannedStatuses = { APPROVED: true, ACCEPTED: true, PENDING_APPROVAL: true };
    var invalidJson = [];
    var missingJson = [];
    var noBlocks = [];
    var computed = [];

    for (var r = 0; r < planning.rows.length; r++) {
      var row = planning.rows[r];
      var auditId = AUDIT_DATA_SMOKE_clean_(row[cAuditId]);
      var company = cCompany >= 0 ? AUDIT_DATA_SMOKE_clean_(row[cCompany]) : '';
      var statusDisplay = AUDIT_DATA_SMOKE_clean_(row[cStatus]);
      var statusKey = AUDIT_DATA_SMOKE_normStatus_(statusDisplay);
      var rawJson = AUDIT_DATA_SMOKE_clean_(row[cJson]);
      var rowNo = r + 2;

      if (!auditId && !company && !statusDisplay) continue;
      if (!plannedStatuses[statusKey]) continue;

      if (!rawJson) {
        missingJson.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay });
        continue;
      }

      var parsed;
      try {
        parsed = JSON.parse(rawJson);
      } catch (eJson) {
        invalidJson.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, error: AUDIT_DATA_SMOKE_err_(eJson) });
        continue;
      }

      var blocks = [];
      if (parsed && Array.isArray(parsed.blocks)) blocks = parsed.blocks;
      else if (parsed && Array.isArray(parsed.slots)) blocks = parsed.slots;

      if (!blocks.length) {
        noBlocks.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay });
        continue;
      }

      var hours = AUDIT_DATA_SMOKE_computeBlocksHours_(blocks);
      computed.push({ row: rowNo, auditId: auditId, company: company, status: statusDisplay, blocks: blocks.length, computedHours: hours });
    }

    section.ok = invalidJson.length === 0 && missingJson.length === 0 && noBlocks.length === 0;
    section.summary = {
      plannedRowsComputed: computed.length,
      missingPlanningJson: missingJson.length,
      invalidPlanningJson: invalidJson.length,
      planningJsonWithoutBlocks: noBlocks.length
    };

    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'OK', section.ok ? 'YES' : 'NO');
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Rows with computed Planning JSON hours', computed.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Missing Planning JSON', missingJson.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Invalid Planning JSON', invalidJson.length);
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'Planning JSON without blocks/slots', noBlocks.length);

    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Computed hours from Planning JSON', computed, ['row', 'auditId', 'company', 'status', 'blocks', 'computedHours']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Missing Planning JSON', missingJson, ['row', 'auditId', 'company', 'status']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Invalid Planning JSON', invalidJson, ['row', 'auditId', 'company', 'status', 'error']);
    AUDIT_DATA_SMOKE_pushDetails_(section.rows, 'Planning JSON without blocks/slots', noBlocks, ['row', 'auditId', 'company', 'status']);

  } catch (e) {
    section.ok = false;
    section.summary = { error: AUDIT_DATA_SMOKE_err_(e) };
    AUDIT_DATA_SMOKE_pushKv_(section.rows, 'ERROR', AUDIT_DATA_SMOKE_err_(e));
  }

  if (!returnOnly) AUDIT_DATA_SMOKE_writeReport_(ss, section.rows);
  return section;
}

function AUDIT_DATA_SMOKE_getSs_() {
  var id = '';
  try { id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim(); } catch (e) {}
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  throw new Error('No active spreadsheet and V5_SSOT_SPREADSHEET_ID is not configured');
}

function AUDIT_DATA_SMOKE_readSheet_(ss, sheetName) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { ok:false, message:'Missing sheet: ' + sheetName };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { ok:false, message:'Empty sheet: ' + sheetName };
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(v) { return AUDIT_DATA_SMOKE_clean_(v); });
  var rows = values.slice(1);
  return { ok:true, sheet:sh, headers:headers, rows:rows };
}

function AUDIT_DATA_SMOKE_findHeader_(headers, candidates) {
  headers = headers || [];
  candidates = Array.isArray(candidates) ? candidates : [candidates];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = AUDIT_DATA_SMOKE_normHeader_(headers[i]);
    if (key && map[key] === undefined) map[key] = i;
  }
  for (var j = 0; j < candidates.length; j++) {
    var c = AUDIT_DATA_SMOKE_normHeader_(candidates[j]);
    if (map[c] !== undefined) return map[c];
  }
  return -1;
}

function AUDIT_DATA_SMOKE_normHeader_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function AUDIT_DATA_SMOKE_normCompanyName_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function AUDIT_DATA_SMOKE_normAction_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function AUDIT_DATA_SMOKE_normStatus_(v) {
  if (typeof Status_normalizeStatus_ === 'function') return Status_normalizeStatus_(v);
  return String(v == null ? '' : v)
    .trim()
    .toUpperCase()
    .replace(/[\s\-]+/g, '_');
}

function AUDIT_DATA_SMOKE_computeBlocksHours_(blocks) {
  var total = 0;
  blocks = Array.isArray(blocks) ? blocks : [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    var start = AUDIT_DATA_SMOKE_timeToMinutes_(b.start || b.startTime || '');
    var end = AUDIT_DATA_SMOKE_timeToMinutes_(b.end || b.endTime || '');
    if (isFinite(start) && isFinite(end) && end > start) total += (end - start) / 60;
  }
  return Math.round(total * 100) / 100;
}

function AUDIT_DATA_SMOKE_timeToMinutes_(v) {
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  var hh = Number(m[1]);
  var mm = Number(m[2]);
  if (!isFinite(hh) || !isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return NaN;
  return hh * 60 + mm;
}

function AUDIT_DATA_SMOKE_clean_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

function AUDIT_DATA_SMOKE_formatDateTime_(d) {
  var tz = 'Europe/Amsterdam';
  try {
    var ss = AUDIT_DATA_SMOKE_getSs_();
    if (ss && ss.getSpreadsheetTimeZone) tz = ss.getSpreadsheetTimeZone() || tz;
  } catch (e) {}
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss');
}

function AUDIT_DATA_SMOKE_newSection_(title) {
  var rows = [];
  AUDIT_DATA_SMOKE_pushHeader_(rows, title);
  return { title:title, ok:true, summary:{}, rows:rows };
}

function AUDIT_DATA_SMOKE_appendSection_(target, section) {
  AUDIT_DATA_SMOKE_pushBlank_(target);
  var rows = section && section.rows ? section.rows : [];
  for (var i = 0; i < rows.length; i++) target.push(rows[i]);
}

function AUDIT_DATA_SMOKE_pushHeader_(rows, title) {
  rows.push([String(title || ''), '', '', '', '', '', '', '']);
}

function AUDIT_DATA_SMOKE_pushKv_(rows, key, value) {
  rows.push([String(key || ''), value == null ? '' : String(value), '', '', '', '', '', '']);
}

function AUDIT_DATA_SMOKE_pushBlank_(rows) {
  rows.push(['', '', '', '', '', '', '', '']);
}

function AUDIT_DATA_SMOKE_pushDetails_(rows, title, items, fields) {
  items = Array.isArray(items) ? items : [];
  fields = Array.isArray(fields) ? fields : [];
  AUDIT_DATA_SMOKE_pushBlank_(rows);
  rows.push([title, 'count', String(items.length), '', '', '', '', '']);
  if (!items.length) return;
  rows.push(fields.concat(new Array(Math.max(0, 8 - fields.length)).fill('')));
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var row = [];
    for (var f = 0; f < fields.length; f++) row.push(item[fields[f]] == null ? '' : String(item[fields[f]]));
    while (row.length < 8) row.push('');
    rows.push(row);
  }
}

function AUDIT_DATA_SMOKE_writeReport_(ss, rows) {
  var sh = ss.getSheetByName(AUDIT_DATA_SMOKE_REPORT_TAB);
  if (!sh) sh = ss.insertSheet(AUDIT_DATA_SMOKE_REPORT_TAB);
  sh.clearContents();
  rows = rows && rows.length ? rows : [['No report rows']];
  var width = 8;
  var normalized = rows.map(function(r) {
    r = Array.isArray(r) ? r.slice(0) : [String(r || '')];
    while (r.length < width) r.push('');
    return r.slice(0, width);
  });
  sh.getRange(1, 1, normalized.length, width).setValues(normalized);
  try {
    sh.autoResizeColumns(1, width);
    sh.setFrozenRows(1);
  } catch (e) {}
}

function AUDIT_DATA_SMOKE_err_(e) {
  return String(e && e.message ? e.message : e);
}
