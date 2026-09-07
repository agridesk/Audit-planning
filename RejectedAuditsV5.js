// ====================================================
// RejectedAudits.gs
// Build: 2026-05-01_LIFECYCLE_SIDE_EFFECTS_001
// ====================================================
//
// Purpose:
// Central handling for audits rejected as terminal outcome.
//
// Rules implemented:
// - Move audit row from "Audit planning" to "Rejected audits".
// - Delete the source row from "Audit planning" only after archive append succeeds.
// - Reason / Comment is mandatory and comes from payload.reason/comment/managerComment.
// - Status in "Rejected audits" is the original status at the moment Reject was clicked.
// - Date - Rejected is stored as yyyy-MM-dd HH:mm:ss.
// - Manager_Email comes from Auditors where Role = Manager and Active = Yes.
// - Company_UID is mandatory and resolved from Companies.Company_UID by company name.
// - Date - Planned and Date - Approved are normalized to yyyy-MM-dd where possible.
// - Preassigned Auditor and Assigned to are copied exactly from Audit planning.
//
// Compatibility aliases kept:
// - V5_MoveAuditToRejected(auditId, payload)
// - V5_ClearPlanningFields(auditId)
// ====================================================

var REJECTED_AUDITS_CONFIG = {
  AUDIT_PLANNING: {
    sheetName: 'Audit planning',
    headerRow: 1,
    columns: {
      company: 'Company',
      location: 'Location',
      preassigned: 'Preassigned Auditor',
      assignedTo: 'Assigned to',
      datePlanned: 'Date - Planned',
      dateApproved: 'Date - Approved',
      status: 'Status',
      auditId: 'Audit ID',
      planningJson: 'Planning JSON',
      mpsAbc: 'MPS-ABC',
      mpsGap: 'MPS-GAP',
      mpsSq: 'MPS-SQ',
      grasp: 'GRASP',
      florimarkTracecert: 'Florimark Tracecert',
      florimarkGtp: 'Florimark GTP',
      scope7: 'Scope 7',
      scope8: 'Scope 8'
    }
  },
  REJECTED_AUDITS: {
    sheetName: 'Rejected audits',
    headerRow: 1,
    columns: {
      company: 'Company',
      location: 'Location',
      scopes: 'Scopes',
      preassigned: 'Preassigned Auditor',
      assignedTo: 'Assigned to',
      datePlanned: 'Date - Planned',
      dateApproved: 'Date - Approved',
      status: 'Status',
      reason: 'Reason / Comment',
      dateRejected: 'Date - Rejected',
      auditId: 'Audit ID',
      managerEmail: 'Manager_Email',
      companyUid: 'Company_UID',
      activeAudits: 'Active Audits'
    }
  },
  COMPANIES: {
    sheetName: 'Companies',
    headerRow: 1,
    columns: {
      company: 'Company',
      companyUid: 'Company_UID'
    }
  },
  AUDITORS: {
    sheetName: 'Auditors',
    headerRow: 1,
    columns: {
      emailCandidates: ['Email', 'E-mail', 'Auditor email', 'Auditor Email', 'E-mail address'],
      roleCandidates: ['Role', 'Roles'],
      activeCandidates: ['Active', 'Is Active', 'Active?']
    }
  }
};

// Backward-compatible config alias.
var V5_RA_CONFIG = REJECTED_AUDITS_CONFIG;

function _raNorm(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function _raNormKey(v) {
  return _raNorm(v).toLowerCase().replace(/[\s_\-]+/g, ' ');
}

function _raGetSpreadsheet() {
  var id = '';
  try { id = _raNorm(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID')); } catch (e0) {}
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function _raGetTimezone(ss) {
  try {
    if (ss && ss.getSpreadsheetTimeZone) {
      var tz = _raNorm(ss.getSpreadsheetTimeZone());
      if (tz) return tz;
    }
  } catch (e0) {}
  try {
    var stz = _raNorm(Session.getScriptTimeZone());
    if (stz) return stz;
  } catch (e1) {}
  return 'Europe/Amsterdam';
}

function _raHeaderMap(headers) {
  var exact = {};
  var norm = {};
  headers = headers || [];
  for (var i = 0; i < headers.length; i++) {
    var h = _raNorm(headers[i]);
    if (!h) continue;
    exact[h] = i;
    norm[_raNormKey(h)] = i;
  }
  return {
    exact: exact,
    norm: norm,
    indexOf: function (names) {
      if (!Array.isArray(names)) names = [names];
      for (var n = 0; n < names.length; n++) {
        var raw = _raNorm(names[n]);
        if (!raw) continue;
        if (exact.hasOwnProperty(raw)) return exact[raw];
        var key = _raNormKey(raw);
        if (norm.hasOwnProperty(key)) return norm[key];
      }
      return -1;
    }
  };
}

function _raIsTruthy(v) {
  var s = _raNorm(v).toLowerCase();
  return !!s && s !== 'no' && s !== '0' && s !== 'false' && s !== 'inactive' && s !== 'n';
}

function _raIsoDate(v, ss) {
  if (v === null || v === undefined || v === '') return '';
  var tz = _raGetTimezone(ss);
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var s = _raNorm(v);
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  return s;
}

function _raDateTimeNow(ss) {
  return Utilities.formatDate(new Date(), _raGetTimezone(ss), 'yyyy-MM-dd HH:mm:ss');
}

function _raResolveReason(payload) {
  payload = payload || {};
  var candidates = [
    payload.reason,
    payload.comment,
    payload.managerComment,
    payload.rejectReason,
    payload.rejectComment,
    payload.message
  ];
  for (var i = 0; i < candidates.length; i++) {
    var v = _raNorm(candidates[i]);
    if (v) return v;
  }
  return '';
}

function _raDisplayStatus(status) {
  var s = _raNorm(status);
  if (!s) return '';
  var key = s.toUpperCase().replace(/[\s\-]+/g, '_');
  var map = {
    PENDING_PLANNING: 'Pending Planning',
    PENDING_APPROVAL: 'Pending Approval',
    PENDING_ACCEPTANCE: 'Approved',
    APPROVED: 'Approved',
    ACCEPTED: 'Accepted',
    COMPLETED: 'Completed',
    REJECTED: 'Rejected'
  };
  return map[key] || s;
}

// ====================================================
// PUBLIC: Move audit row from Audit planning to Rejected audits
// ====================================================
function MoveAuditToRejected(auditId, payload) {
  auditId = _raNorm(auditId);
  payload = payload || {};

  if (!auditId) {
    return { success: false, message: 'MoveAuditToRejected: missing auditId' };
  }

  var reason = _raResolveReason(payload);
  if (!reason) {
    return { success: false, message: 'Reject reason/comment is required.' };
  }

  var ss = _raGetSpreadsheet();
  if (!ss) return { success: false, message: 'Spreadsheet not available.' };

  var apInfo = _raFindAuditRow(ss, auditId);
  if (!apInfo.found) {
    return { success: false, message: apInfo.message };
  }

  var managerEmail = _raGetActiveManagerEmail(ss);
  if (!managerEmail) {
    return { success: false, message: 'No active Manager e-mail found in Auditors where Role = Manager and Active = Yes.' };
  }

  var companyUid = _raGetCompanyUid(ss, apInfo.company);
  if (!companyUid) {
    return { success: false, message: 'Company_UID not found for company: ' + _raNorm(apInfo.company) };
  }

  var raCfg = REJECTED_AUDITS_CONFIG.REJECTED_AUDITS;
  var raSheet = ss.getSheetByName(raCfg.sheetName);
  if (!raSheet) {
    return { success: false, message: "Sheet '" + raCfg.sheetName + "' not found." };
  }

  var raHeaders = raSheet
    .getRange(raCfg.headerRow, 1, 1, raSheet.getLastColumn())
    .getValues()[0];
  var raMap = _raHeaderMap(raHeaders);

  var newRow = new Array(raHeaders.length);
  for (var i = 0; i < newRow.length; i++) newRow[i] = '';

  function setRA(headerName, value) {
    var idx = raMap.indexOf(headerName);
    if (idx < 0) return;
    newRow[idx] = value;
  }

  setRA(raCfg.columns.company, apInfo.company);
  setRA(raCfg.columns.location, apInfo.location);
  setRA(raCfg.columns.scopes, _raBuildScopesString(ss, apInfo));
  setRA(raCfg.columns.preassigned, apInfo.preassigned);
  setRA(raCfg.columns.assignedTo, apInfo.assignedTo);
  setRA(raCfg.columns.datePlanned, _raIsoDate(apInfo.datePlanned, ss));
  setRA(raCfg.columns.dateApproved, _raIsoDate(apInfo.dateApproved, ss));
  setRA(raCfg.columns.status, _raDisplayStatus(apInfo.status));
  setRA(raCfg.columns.reason, reason);
  setRA(raCfg.columns.dateRejected, _raDateTimeNow(ss));
  setRA(raCfg.columns.auditId, auditId);
  setRA(raCfg.columns.managerEmail, managerEmail);
  setRA(raCfg.columns.companyUid, companyUid);

  raSheet.appendRow(newRow);


  var lifecycle = _raLifecycleOnStatusChanged(apInfo, {
    auditId:auditId,
    action:'REJECT',
    actorRole:'MANAGER',
    actorEmail:managerEmail,
    beforeStatus:apInfo.status,
    afterStatus:'Rejected',
    reason:reason,
    source:'RejectedAuditsV5.MoveAuditToRejected'
  });

  var activeAuditsUpdate = _raSetCompanyActiveAudits(ss, companyUid, apInfo.company, 'No');

  apInfo.sheet.deleteRow(apInfo.sheetRow);

  try {
    if (typeof AvailabilityV5_ReleaseReservation === 'function') AvailabilityV5_ReleaseReservation(auditId);
  } catch (e0) {}
  try {
    if (typeof V5_availabilityClearAuditId_ === 'function') V5_availabilityClearAuditId_(auditId);
  } catch (e1) {}
  try {
    if (typeof managerV5_releaseAvailability_ === 'function') managerV5_releaseAvailability_(auditId, { silent: true });
  } catch (e2) {}

  return {
    success: true,
    message: 'Audit ' + auditId + ' moved to Rejected audits and removed from Audit planning.',
    auditId: auditId,
    statusAtReject: _raDisplayStatus(apInfo.status),
    reason: reason,
    managerEmail: managerEmail,
    companyUid: companyUid,
    activeAuditsUpdate: activeAuditsUpdate,
    lifecycle: lifecycle,
    metadataWritten: !!(lifecycle && (lifecycle.managerMetadataWritten || lifecycle.statusSinceWritten))
  };
}

function _raLifecycleOnStatusChanged(apInfo, event) {
  try {
    if (typeof Lifecycle_onStatusChanged_ !== 'function') {
      return { success:true, skipped:true, reason:'Lifecycle_onStatusChanged_ unavailable' };
    }
    apInfo = apInfo || {};
    event = event || {};
    return Lifecycle_onStatusChanged_({
      auditId:event.auditId,
      action:event.action,
      actorRole:event.actorRole,
      actorEmail:event.actorEmail,
      beforeStatus:event.beforeStatus,
      afterStatus:event.afterStatus,
      reason:event.reason,
      source:event.source || 'RejectedAuditsV5',
      sheet:apInfo.sheet,
      rowIndex:apInfo.sheetRow,
      headers:apInfo.headers,
      row:apInfo.row,
      payload:event
    });
  } catch (e) {
    return { success:false, message:'Rejected audit lifecycle side effects failed: ' + (e && e.message ? e.message : e) };
  }
}

function V5_MoveAuditToRejected(auditId, payload) {
  return MoveAuditToRejected(auditId, payload || {});
}

// ====================================================
// PUBLIC: Clear planning fields in Audit planning
// ====================================================
function ClearPlanningFields(auditId) {
  auditId = _raNorm(auditId);
  if (!auditId) {
    return { success: false, message: 'ClearPlanningFields: missing auditId' };
  }

  var ss = _raGetSpreadsheet();
  var cfg = REJECTED_AUDITS_CONFIG.AUDIT_PLANNING;
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) {
    return { success: false, message: 'Audit planning sheet not found.' };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= cfg.headerRow) {
    return { success: false, message: 'No audit rows.' };
  }

  var headers = sheet
    .getRange(cfg.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  var map = _raHeaderMap(headers);

  var colAuditId = map.indexOf(cfg.columns.auditId);
  var colAssignedTo = map.indexOf(cfg.columns.assignedTo);
  var colDatePlanned = map.indexOf(cfg.columns.datePlanned);
  var colDateApproved = map.indexOf(cfg.columns.dateApproved);
  var colPlanningJson = map.indexOf(cfg.columns.planningJson);

  if (colAuditId < 0) {
    return { success: false, message: 'Audit ID column not found in Audit planning.' };
  }

  var range = sheet.getRange(cfg.headerRow + 1, 1, lastRow - cfg.headerRow, sheet.getLastColumn());
  var data = range.getValues();
  var changed = false;
  var protectedSnapshot = null;

  for (var i = 0; i < data.length; i++) {
    if (_raNorm(data[i][colAuditId]) === auditId) {
      try {
        if (typeof Lifecycle_snapshotProtectedPlanningFields_ === 'function') {
          protectedSnapshot = Lifecycle_snapshotProtectedPlanningFields_({
            auditId: auditId,
            sheet: sheet,
            rowIndex: cfg.headerRow + 1 + i,
            headers: headers,
            source: 'RejectedAuditsV5.ClearPlanningFields:before'
          });
        }
      } catch (eSnap) {
        protectedSnapshot = { success:false, message:String(eSnap && eSnap.message ? eSnap.message : eSnap) };
      }

      if (colAssignedTo >= 0) data[i][colAssignedTo] = '';
      if (colDatePlanned >= 0) data[i][colDatePlanned] = '';
      if (colDateApproved >= 0) data[i][colDateApproved] = '';
      if (colPlanningJson >= 0) data[i][colPlanningJson] = '';
      changed = true;
      break;
    }
  }

  if (!changed) {
    return { success: false, message: 'Audit ID not found in Audit planning for clearing.' };
  }

  range.setValues(data);

  var protectedRestore = { success:true, skipped:true };
  try {
    if (protectedSnapshot && typeof Lifecycle_restoreProtectedPlanningFields_ === 'function') {
      protectedRestore = Lifecycle_restoreProtectedPlanningFields_(protectedSnapshot, { source:'RejectedAuditsV5.ClearPlanningFields:after' });
    }
  } catch (eRestore) {
    protectedRestore = { success:false, message:String(eRestore && eRestore.message ? eRestore.message : eRestore) };
  }

  return { success: true, protectedPlanningFields: protectedRestore };
}

function V5_ClearPlanningFields(auditId) {
  return ClearPlanningFields(auditId);
}

// ====================================================
// INTERNAL: Find audit row in Audit planning
// ====================================================
function _raFindAuditRow(ss, auditId) {
  var cfg = REJECTED_AUDITS_CONFIG.AUDIT_PLANNING;
  var sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet) {
    return { found: false, message: 'Audit planning sheet not found.' };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= cfg.headerRow) {
    return { found: false, message: 'No audit rows in Audit planning.' };
  }

  var headers = sheet
    .getRange(cfg.headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  var map = _raHeaderMap(headers);

  var colAuditId = map.indexOf(cfg.columns.auditId);
  if (colAuditId < 0) {
    return { found: false, message: 'Audit ID column not found in Audit planning.' };
  }

  var dataRange = sheet.getRange(cfg.headerRow + 1, 1, lastRow - cfg.headerRow, sheet.getLastColumn());
  var data = dataRange.getValues();
  var key = _raNorm(auditId);

  function getCell(row, name) {
    var c = map.indexOf(name);
    return c >= 0 ? row[c] : '';
  }

  for (var i = 0; i < data.length; i++) {
    if (_raNorm(data[i][colAuditId]) !== key) continue;

    var sheetRowIndex = cfg.headerRow + 1 + i;
    var row = data[i];

    return {
      found: true,
      sheet: sheet,
      sheetRow: sheetRowIndex,
      headers: headers,
      row: row,
      company: getCell(row, cfg.columns.company),
      location: getCell(row, cfg.columns.location),
      preassigned: getCell(row, cfg.columns.preassigned),
      assignedTo: getCell(row, cfg.columns.assignedTo),
      datePlanned: getCell(row, cfg.columns.datePlanned),
      dateApproved: getCell(row, cfg.columns.dateApproved),
      status: getCell(row, cfg.columns.status),
      mpsAbc: getCell(row, cfg.columns.mpsAbc),
      mpsGap: getCell(row, cfg.columns.mpsGap),
      mpsSq: getCell(row, cfg.columns.mpsSq),
      grasp: getCell(row, cfg.columns.grasp),
      florimarkTracecert: getCell(row, cfg.columns.florimarkTracecert),
      florimarkGtp: getCell(row, cfg.columns.florimarkGtp),
      scope7: getCell(row, cfg.columns.scope7),
      scope8: getCell(row, cfg.columns.scope8)
    };
  }

  return { found: false, message: "Audit ID '" + auditId + "' not found in Audit planning." };
}

// ====================================================
// INTERNAL: Scopes
// ====================================================
function _raBuildScopesString(ss, apInfo) {
  var viaConfig = _raBuildScopesFromConfig(ss, apInfo);
  if (viaConfig) return viaConfig;

  var parts = [];
  function add(flagValue, label) {
    if (_raIsTruthy(flagValue)) parts.push(label);
  }
  add(apInfo.mpsAbc, 'MPS-ABC');
  add(apInfo.mpsGap, 'MPS-GAP');
  add(apInfo.mpsSq, 'MPS-SQ');
  add(apInfo.grasp, 'GRASP');
  add(apInfo.florimarkTracecert, 'Florimark Tracecert');
  add(apInfo.florimarkGtp, 'Florimark GTP');
  add(apInfo.scope7, 'Scope 7');
  add(apInfo.scope8, 'Scope 8');
  return parts.join('; ');
}

function _raBuildScopesFromConfig(ss, apInfo) {
  try {
    var sh = ss.getSheetByName('Config_Scopes');
    if (!sh || sh.getLastRow() < 2) return '';
    var vals = sh.getDataRange().getValues();
    var headers = vals[0].map(function (x) { return _raNorm(x); });
    var cfgMap = _raHeaderMap(headers);
    var slotCol = cfgMap.indexOf(['SlotKey', 'Slot', 'Slot Key']);
    var displayCol = cfgMap.indexOf(['DisplayName', 'Display Name', 'Name']);
    var codeCol = cfgMap.indexOf(['ScopeCode', 'Scope Code', 'Code']);
    var activeCol = cfgMap.indexOf(['Active', 'IsActive']);
    var sortCol = cfgMap.indexOf(['SortOrder', 'Sort Order', 'Order']);
    if (slotCol < 0) return '';

    var apMap = _raHeaderMap(apInfo.headers || []);
    var defs = [];
    for (var r = 1; r < vals.length; r++) {
      var rec = vals[r];
      if (activeCol >= 0 && !_raIsTruthy(rec[activeCol])) continue;
      var slot = _raNorm(rec[slotCol]);
      if (!slot) continue;
      var apCol = apMap.indexOf(slot);
      if (apCol < 0) continue;
      if (!_raIsTruthy(apInfo.row[apCol])) continue;
      var name = displayCol >= 0 ? _raNorm(rec[displayCol]) : '';
      if (!name && codeCol >= 0) name = _raNorm(rec[codeCol]);
      if (!name) name = slot;
      var order = sortCol >= 0 ? Number(rec[sortCol]) : 9999;
      if (!isFinite(order)) order = 9999;
      defs.push({ order: order, name: name });
    }
    defs.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name);
    });
    return defs.map(function (x) { return x.name; }).join('; ');
  } catch (e) {
    return '';
  }
}

// ====================================================
// INTERNAL: Manager email from Auditors
// ====================================================
function _raGetActiveManagerEmail(ss) {
  var cfg = REJECTED_AUDITS_CONFIG.AUDITORS;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh || sh.getLastRow() <= cfg.headerRow) return '';

  var values = sh.getDataRange().getValues();
  var headers = values[0].map(function (x) { return _raNorm(x); });
  var map = _raHeaderMap(headers);

  var idxEmail = map.indexOf(cfg.columns.emailCandidates);
  var idxRole = map.indexOf(cfg.columns.roleCandidates);
  var idxActive = map.indexOf(cfg.columns.activeCandidates);
  if (idxEmail < 0 || idxRole < 0 || idxActive < 0) return '';

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var role = _raNorm(row[idxRole]).toLowerCase();
    var active = _raNorm(row[idxActive]).toLowerCase();
    var email = _raNorm(row[idxEmail]).toLowerCase();
    var isManager = role === 'manager' || role.split(/[;,|]/).map(function (x) { return _raNorm(x).toLowerCase(); }).indexOf('manager') >= 0;
    var isActive = active === 'yes' || active === 'y' || active === 'true' || active === '1' || active === 'active';
    if (isManager && isActive && email) return email;
  }
  return '';
}

// ====================================================
// INTERNAL: Company UID from Companies
// ====================================================
function _raSetCompanyActiveAudits(ss, companyUid, companyName, value) {
  var cfg = REJECTED_AUDITS_CONFIG.COMPANIES;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh || sh.getLastRow() <= cfg.headerRow) return { ok:false, error:'COMPANIES_EMPTY_OR_MISSING' };

  var headers = sh
    .getRange(cfg.headerRow, 1, 1, sh.getLastColumn())
    .getValues()[0];
  var map = _raHeaderMap(headers);

  var colCompany = map.indexOf(cfg.columns.company);
  var colCompanyUid = map.indexOf([cfg.columns.companyUid, 'Company UID', 'CompanyUID']);
  var colActiveAudits = map.indexOf([cfg.columns.activeAudits, 'Active audits', 'Active audit', 'ActiveAudit', 'Active_Audits']);

  if (colCompanyUid < 0 && headers.length >= 20) colCompanyUid = 19; // historical Companies col T fallback
  if (colActiveAudits < 0 && headers.length >= 19) colActiveAudits = 18; // historical Companies col S fallback
  if (colActiveAudits < 0) return { ok:false, error:'COMPANIES_MISSING_ACTIVE_AUDITS' };
  if (colCompany < 0 && colCompanyUid < 0) return { ok:false, error:'COMPANIES_MISSING_LOOKUP_COLUMNS' };

  var data = sh.getRange(cfg.headerRow + 1, 1, sh.getLastRow() - cfg.headerRow, sh.getLastColumn()).getValues();
  var uidKey = _raNorm(companyUid);
  var nameKey = _raNorm(companyName).toLowerCase();

  for (var i = 0; i < data.length; i++) {
    var uidMatch = colCompanyUid >= 0 && uidKey && _raNorm(data[i][colCompanyUid]) === uidKey;
    var nameMatch = colCompany >= 0 && nameKey && _raNorm(data[i][colCompany]).toLowerCase() === nameKey;
    if (!uidMatch && !nameMatch) continue;

    sh.getRange(cfg.headerRow + 1 + i, colActiveAudits + 1).setValue(value);
    try { if (typeof CompaniesIndex_ClearCache === 'function') CompaniesIndex_ClearCache(); } catch (eCache) {}
    return { ok:true, rowIndex1:cfg.headerRow + 1 + i, value:value };
  }

  return { ok:false, error:'COMPANY_NOT_FOUND', companyUid:uidKey, companyName:companyName };
}

function _raGetCompanyUid(ss, companyName) {
  var cfg = REJECTED_AUDITS_CONFIG.COMPANIES;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh || sh.getLastRow() <= cfg.headerRow) return '';

  var headers = sh
    .getRange(cfg.headerRow, 1, 1, sh.getLastColumn())
    .getValues()[0];
  var map = _raHeaderMap(headers);

  var colCompany = map.indexOf(cfg.columns.company);
  var colCompanyUid = map.indexOf([cfg.columns.companyUid, 'Company UID', 'CompanyUID']);
  if (colCompanyUid < 0 && headers.length >= 20) colCompanyUid = 19; // historical Companies col T fallback
  if (colCompany < 0 || colCompanyUid < 0) return '';

  var data = sh.getRange(cfg.headerRow + 1, 1, sh.getLastRow() - cfg.headerRow, sh.getLastColumn()).getValues();
  var key = _raNorm(companyName).toLowerCase();
  for (var i = 0; i < data.length; i++) {
    if (_raNorm(data[i][colCompany]).toLowerCase() === key) {
      return _raNorm(data[i][colCompanyUid]);
    }
  }
  return '';
}

// Legacy helper kept for compatibility with any older callers.
function _raGetManagerEmail(ss, companyName) {
  return _raGetActiveManagerEmail(ss);
}
