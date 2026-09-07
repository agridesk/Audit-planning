/*
===============================================================================
Diagnostics.gs
Build: 2026-04-28_CENTRAL_DIAGNOSTICS_ENV_COMPACT_LOG

Purpose:
- One central diagnostics file for Manager diagnostics, cache diagnostics,
  audit consistency diagnostics, availability diagnostics and notification rule diagnostics.
- Replaces the separate diagnostics-only files:
  AuditDiagnostics.gs
  AuditCacheWarmupDiagnostics.gs
  AuditorAvailabilityDiagnostic.gs
  NotificationRules_Diagnostics.gs
  ManagerDiagnostics.gs

Safety:
- ManagerDiagnostics_RunAll is read-only.
- No repair.
- No cache clear.
- No availability change.
- No audit/status mutation.
- Legacy log-writing helpers are overridden at the end for read-only panel use.
===============================================================================
*/



/* ===== INCLUDED FROM: AuditDiagnostics.js ===== */
/*
===============================================================================
AuditDiagnostics.gs
Build: 2026-04-26_DIAGNOSTICS_FULL_RUNNABLE_TUNED

Purpose:
- Lightweight diagnostics for Locations / Scopes / Auditor Identity.
- Diagnostics only: does NOT change source data or business flows.
- Writes findings to "Diagnostics_Log".
- Returns summary object for manual execution logs.

Manual run functions:
- RUN_AUDIT_DIAGNOSTICS_ALL()
- RUN_AUDIT_DIAGNOSTICS_LOCATIONS()
- RUN_AUDIT_DIAGNOSTICS_SCOPES()
- RUN_AUDIT_DIAGNOSTICS_IDENTITY()

Severity tuning:
- Mirror drift is INFO, not WARN/ERROR.
- Legacy/testdata is INFO/WARN unless active production row can break planning.
- Real SSOT corruption remains ERROR.
===============================================================================
*/

var AUDIT_DIAGNOSTICS_BUILD = '2026-04-26_DIAGNOSTICS_FULL_RUNNABLE_TUNED';

var AUDIT_DIAGNOSTICS_CONFIG = {
  LOG_SHEET: 'Diagnostics_Log',

  COMPANIES: {
    sheetName: 'Companies',
    headers: {
      company: ['Company'],
      status: ['Status'],
      gps: ['GPS-data', 'GPS data', 'GPS'],
      locationsToPlan: ['Locations_to_plan', 'Locations to plan', 'Locs'],
      companyUid: ['Company_UID', 'Company UID', 'CompanyUID'],
      locationsJson: ['Locations_JSON', 'Locations JSON']
    }
  },

  AUDIT_PLANNING: {
    sheetName: 'Audit planning',
    headers: {
      auditId: ['Audit ID', 'Audit_ID', 'AuditId'],
      company: ['Company'],
      status: ['Status'],
      allowSelfPlanning: ['Allow self planning', 'Allow Self Planning', 'Self planning'],
      preassignedAuditor: ['Preassigned Auditor', 'Preassigned auditor'],
      assignedTo: ['Assigned to', 'Assigned To'],
      scopes: [
        'MPS-ABC',
        'MPS-GAP',
        'MPS-SQ',
        'GRASP',
        'Florimark Tracecert',
        'Florimark GTP',
        'Scope 7',
        'Scope 8'
      ]
    }
  },

  AUDITORS: {
    sheetName: 'Auditors',
    headers: {
      email: ['Email', 'E-mail', 'Auditor email', 'Auditor Email', 'E-mail address'],
      role: ['Role', 'Roles'],
      active: ['Active', 'Is Active', 'Active?']
    }
  },

  CONFIG_SCOPES: {
    sheetName: 'Config_Scopes',
    headers: {
      displayName: ['DisplayName', 'Display Name', 'Name'],
      scopeCode: ['ScopeCode', 'Scope Code', 'Code'],
      slotKey: ['SlotKey', 'Slot Key', 'Slot'],
      active: ['Active', 'IsActive']
    }
  }
};

/* ============================================================================
 * MANUAL ENTRYPOINTS
 * ========================================================================== */

function RUN_AUDIT_DIAGNOSTICS_ALL() {
  return AuditDiagnostics_RunAll();
}

function RUN_AUDIT_DIAGNOSTICS_LOCATIONS() {
  return AuditDiagnostics_RunLocations();
}

function RUN_AUDIT_DIAGNOSTICS_SCOPES() {
  return AuditDiagnostics_RunScopes();
}

function RUN_AUDIT_DIAGNOSTICS_IDENTITY() {
  return AuditDiagnostics_RunIdentity();
}

/* Compatibility aliases */
function V5_RunAuditDiagnosticsAll() {
  return AuditDiagnostics_RunAll();
}

function AuditDiagnostics_runAll() {
  return AuditDiagnostics_RunAll();
}

/* ============================================================================
 * MAIN RUNNERS
 * ========================================================================== */

function AuditDiagnostics_RunAll() {
  var started = new Date();
  var diagnostics = [];

  diagnostics = diagnostics.concat(AuditDiagnostics_collectLocations_());
  diagnostics = diagnostics.concat(AuditDiagnostics_collectScopes_());
  diagnostics = diagnostics.concat(AuditDiagnostics_collectIdentity_());

  return AuditDiagnostics_finishRun_('ALL', diagnostics, started);
}

function AuditDiagnostics_RunLocations() {
  var started = new Date();
  var diagnostics = AuditDiagnostics_collectLocations_();
  return AuditDiagnostics_finishRun_('LOCATIONS', diagnostics, started);
}

function AuditDiagnostics_RunScopes() {
  var started = new Date();
  var diagnostics = AuditDiagnostics_collectScopes_();
  return AuditDiagnostics_finishRun_('SCOPES', diagnostics, started);
}

function AuditDiagnostics_RunIdentity() {
  var started = new Date();
  var diagnostics = AuditDiagnostics_collectIdentity_();
  return AuditDiagnostics_finishRun_('IDENTITY', diagnostics, started);
}

function AuditDiagnostics_finishRun_(scope, diagnostics, started) {
  diagnostics = diagnostics || [];

  var ss = AuditDiagnostics_getSpreadsheet_();
  AuditDiagnostics_writeLog_(ss, scope, diagnostics);

  var counts = AuditDiagnostics_countSeverities_(diagnostics);
  var result = {
    ok: true,
    build: AUDIT_DIAGNOSTICS_BUILD,
    scope: scope,
    generatedAt: AuditDiagnostics_formatDateTime_(new Date()),
    durationMs: new Date().getTime() - started.getTime(),
    counts: counts,
    diagnostics: diagnostics
  };

  try {
    Logger.log(JSON.stringify(result, null, 2));
  } catch (e) {
    Logger.log('Audit diagnostics completed. Total=' + counts.TOTAL);
  }

  return result;
}

/* ============================================================================
 * LOCATIONS DIAGNOSTICS
 * ========================================================================== */

function AuditDiagnostics_collectLocations_() {
  var out = [];
  var ss = AuditDiagnostics_getSpreadsheet_();
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.COMPANIES;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    out.push(AuditDiagnostics_diag_('ERROR', 'SHEET_MISSING', cfg.sheetName, '', "Sheet 'Companies' not found.", {}));
    return out;
  }

  var table = AuditDiagnostics_readTable_(sh, cfg.headers);
  if (!table.ok) {
    out.push(AuditDiagnostics_diag_('ERROR', 'HEADER_MISSING', cfg.sheetName, '', table.message, table.details || {}));
    return out;
  }

  var companyIdx = table.idx.company;
  var gpsIdx = table.idx.gps;
  var locationsToPlanIdx = table.idx.locationsToPlan;
  var locationsJsonIdx = table.idx.locationsJson;
  var uidIdx = table.idx.companyUid;

  for (var r = 0; r < table.rows.length; r++) {
    var row = table.rows[r];
    var company = AuditDiagnostics_norm_(row[companyIdx]);
    if (!company) continue;

    var companyUid = uidIdx >= 0 ? AuditDiagnostics_norm_(row[uidIdx]) : '';
    if (!companyUid) {
      out.push(AuditDiagnostics_diag_(
        'ERROR',
        'COMPANY_UID_MISSING',
        cfg.sheetName,
        company,
        'Company_UID is missing.',
        { row: table.startRow + r }
      ));
    }

    var mirrorCount = AuditDiagnostics_parseIntSafe_(locationsToPlanIdx >= 0 ? row[locationsToPlanIdx] : '');
    var gpsMirror = gpsIdx >= 0 ? AuditDiagnostics_norm_(row[gpsIdx]) : '';
    var rawJson = locationsJsonIdx >= 0 ? AuditDiagnostics_norm_(row[locationsJsonIdx]) : '';

    var parsed = AuditDiagnostics_parseLocationsJson_(rawJson);
    var severityInfo = AuditDiagnostics_getSeverityForLocations_(
      parsed.valid,
      parsed.empty,
      parsed.activeCount,
      mirrorCount
    );

    if (severityInfo) {
      out.push(AuditDiagnostics_diag_(
        severityInfo.severity,
        severityInfo.type,
        cfg.sheetName,
        company,
        AuditDiagnostics_locationMessage_(severityInfo.type),
        {
          row: table.startRow + r,
          mirror: String(mirrorCount),
          activeCount: parsed.activeCount,
          totalJsonLocations: parsed.totalCount,
          companyUid: companyUid
        }
      ));
    }

    if (parsed.valid && parsed.hqGps && gpsMirror && AuditDiagnostics_normGps_(gpsMirror) !== AuditDiagnostics_normGps_(parsed.hqGps)) {
      out.push(AuditDiagnostics_diag_(
        'INFO',
        'GPS_MIRROR_MISMATCH',
        cfg.sheetName,
        company,
        'Companies.GPS-data differs from HQ GPS in Locations_JSON.',
        {
          row: table.startRow + r,
          gpsMirror: gpsMirror,
          hqGpsInLocationsJson: parsed.hqGps,
          companyUid: companyUid
        }
      ));
    }
  }

  return out;
}

function AuditDiagnostics_parseLocationsJson_(raw) {
  var result = {
    valid: true,
    empty: false,
    totalCount: 0,
    activeCount: 0,
    hqGps: '',
    message: ''
  };

  raw = AuditDiagnostics_norm_(raw);
  if (!raw) {
    result.empty = true;
    return result;
  }

  var obj;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    result.valid = false;
    result.message = e && e.message ? e.message : String(e);
    return result;
  }

  var locations = [];
  if (Array.isArray(obj)) locations = obj;
  else if (obj && Array.isArray(obj.locations)) locations = obj.locations;

  result.totalCount = locations.length;

  for (var i = 0; i < locations.length; i++) {
    var loc = locations[i] || {};
    var code = AuditDiagnostics_norm_(loc.code).toUpperCase();
    var label = AuditDiagnostics_norm_(loc.label || loc.name);
    var gps = AuditDiagnostics_norm_(loc.gps);
    var isActive;

    if (typeof loc.active === 'boolean') isActive = loc.active;
    else if (loc.active === null || loc.active === undefined || loc.active === '') {
      isActive = !!(code || label || gps);
    } else {
      isActive = AuditDiagnostics_isTruthy_(loc.active);
    }

    if (isActive) result.activeCount++;

    if (code === 'HQ' && gps && !result.hqGps) result.hqGps = gps;
  }

  if (!locations.length) result.empty = true;
  return result;
}

function AuditDiagnostics_getSeverityForLocations_(jsonValid, jsonEmpty, activeCount, mirrorCount) {
  mirrorCount = Number(mirrorCount || 0);
  activeCount = Number(activeCount || 0);

  if (!jsonValid) {
    return { severity: 'ERROR', type: 'LOCATIONS_JSON_INVALID' };
  }

  if (jsonEmpty) {
    return { severity: 'WARN', type: 'LOCATIONS_JSON_EMPTY' };
  }

  if (activeCount <= 0 && mirrorCount > 0) {
    return { severity: 'WARN', type: 'LOCATIONS_JSON_NO_ACTIVE_LOCATIONS' };
  }

  if (activeCount !== mirrorCount) {
    return { severity: 'INFO', type: 'LOCATIONS_COUNT_MIRROR_DRIFT' };
  }

  return null;
}

function AuditDiagnostics_locationMessage_(type) {
  if (type === 'LOCATIONS_JSON_INVALID') return 'Locations_JSON is invalid JSON.';
  if (type === 'LOCATIONS_JSON_EMPTY') return 'Locations_JSON is empty or contains no locations.';
  if (type === 'LOCATIONS_JSON_NO_ACTIVE_LOCATIONS') return 'Locations_JSON contains no active locations while mirror count is greater than zero.';
  if (type === 'LOCATIONS_COUNT_MIRROR_DRIFT') return 'Locations_to_plan differs from active Locations_JSON count. Legacy mirror drift only.';
  return 'Locations diagnostic.';
}

/* ============================================================================
 * SCOPES DIAGNOSTICS
 * ========================================================================== */

function AuditDiagnostics_collectScopes_() {
  var out = [];
  var ss = AuditDiagnostics_getSpreadsheet_();

  var scopeModel = AuditDiagnostics_getConfigScopesModel_(ss);
  if (!scopeModel.ok) {
    out.push(AuditDiagnostics_diag_('ERROR', 'CONFIG_SCOPES_UNAVAILABLE', 'Config_Scopes', '', scopeModel.message, scopeModel.details || {}));
    return out;
  }

  out = out.concat(AuditDiagnostics_checkAuditorScopeHeaders_(ss, scopeModel));
  out = out.concat(AuditDiagnostics_checkAuditPlanningScopeHeaders_(ss, scopeModel));

  return out;
}

function AuditDiagnostics_getConfigScopesModel_(ss) {
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.CONFIG_SCOPES;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) return { ok: false, message: "Sheet 'Config_Scopes' not found." };

  var table = AuditDiagnostics_readTable_(sh, cfg.headers);
  if (!table.ok) return { ok: false, message: table.message, details: table.details };

  var displayIdx = table.idx.displayName;
  var codeIdx = table.idx.scopeCode;
  var slotIdx = table.idx.slotKey;
  var activeIdx = table.idx.active;

  var activeDisplayNames = {};
  var activeSlotKeys = {};
  var activeCodes = {};
  var records = [];

  for (var r = 0; r < table.rows.length; r++) {
    var row = table.rows[r];
    var active = activeIdx >= 0 ? AuditDiagnostics_isTruthy_(row[activeIdx]) : true;
    if (!active) continue;

    var displayName = displayIdx >= 0 ? AuditDiagnostics_norm_(row[displayIdx]) : '';
    var code = codeIdx >= 0 ? AuditDiagnostics_norm_(row[codeIdx]) : '';
    var slot = slotIdx >= 0 ? AuditDiagnostics_norm_(row[slotIdx]) : '';

    if (!displayName && !code && !slot) continue;

    if (displayName) activeDisplayNames[AuditDiagnostics_normKey_(displayName)] = displayName;
    if (code) activeCodes[AuditDiagnostics_normKey_(code)] = code;
    if (slot) activeSlotKeys[AuditDiagnostics_normKey_(slot)] = slot;

    records.push({
      displayName: displayName,
      code: code,
      slot: slot,
      row: table.startRow + r
    });
  }

  return {
    ok: true,
    records: records,
    activeDisplayNames: activeDisplayNames,
    activeCodes: activeCodes,
    activeSlotKeys: activeSlotKeys
  };
}

function AuditDiagnostics_checkAuditorScopeHeaders_(ss, scopeModel) {
  var out = [];
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.AUDITORS;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    out.push(AuditDiagnostics_diag_('ERROR', 'SHEET_MISSING', cfg.sheetName, '', "Sheet 'Auditors' not found.", {}));
    return out;
  }

  var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0] || [];
  var headerKeys = {};
  for (var i = 0; i < headers.length; i++) {
    headerKeys[AuditDiagnostics_normKey_(headers[i])] = true;
  }

  for (var r = 0; r < scopeModel.records.length; r++) {
    var rec = scopeModel.records[r];
    var display = rec.displayName || rec.code || rec.slot;
    if (!display) continue;

    var hit =
      headerKeys[AuditDiagnostics_normKey_(display)] ||
      headerKeys[AuditDiagnostics_normKey_(rec.code)] ||
      headerKeys[AuditDiagnostics_normKey_(rec.slot)];

    if (!hit) {
      out.push(AuditDiagnostics_diag_(
        'WARN',
        'AUDITOR_SCOPE_HEADER',
        cfg.sheetName,
        display,
        'Auditors qualification header missing for active Config_Scopes.DisplayName.',
        {
          displayName: rec.displayName,
          scopeCode: rec.code,
          slotKey: rec.slot
        }
      ));
    }
  }

  return out;
}

function AuditDiagnostics_checkAuditPlanningScopeHeaders_(ss, scopeModel) {
  var out = [];
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.AUDIT_PLANNING;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    out.push(AuditDiagnostics_diag_('ERROR', 'SHEET_MISSING', cfg.sheetName, '', "Sheet 'Audit planning' not found.", {}));
    return out;
  }

  var headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0] || [];
  var headerKeys = {};
  for (var i = 0; i < headers.length; i++) {
    headerKeys[AuditDiagnostics_normKey_(headers[i])] = true;
  }

  var known = {};
  Object.keys(scopeModel.activeDisplayNames || {}).forEach(function(k) { known[k] = true; });
  Object.keys(scopeModel.activeCodes || {}).forEach(function(k) { known[k] = true; });
  Object.keys(scopeModel.activeSlotKeys || {}).forEach(function(k) { known[k] = true; });

  for (var h = 0; h < cfg.headers.scopes.length; h++) {
    var legacyScopeHeader = cfg.headers.scopes[h];
    var key = AuditDiagnostics_normKey_(legacyScopeHeader);
    if (headerKeys[key] && !known[key]) {
      out.push(AuditDiagnostics_diag_(
        'ERROR',
        'UNKNOWN_SCOPE',
        cfg.sheetName,
        legacyScopeHeader,
        'Scope header in Audit planning is not resolvable through Config_Scopes.',
        { scope: legacyScopeHeader }
      ));
    }
  }

  return out;
}

/* ============================================================================
 * IDENTITY / AUDIT DATA DIAGNOSTICS
 * ========================================================================== */

function AuditDiagnostics_collectIdentity_() {
  var out = [];
  var ss = AuditDiagnostics_getSpreadsheet_();

  out = out.concat(AuditDiagnostics_checkAuditorsEmails_(ss));
  out = out.concat(AuditDiagnostics_checkAuditPlanningIdentity_(ss));

  return out;
}

function AuditDiagnostics_checkAuditorsEmails_(ss) {
  var out = [];
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.AUDITORS;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    out.push(AuditDiagnostics_diag_('ERROR', 'SHEET_MISSING', cfg.sheetName, '', "Sheet 'Auditors' not found.", {}));
    return out;
  }

  var table = AuditDiagnostics_readTable_(sh, cfg.headers);
  if (!table.ok) {
    out.push(AuditDiagnostics_diag_('ERROR', 'HEADER_MISSING', cfg.sheetName, '', table.message, table.details || {}));
    return out;
  }

  var emailIdx = table.idx.email;

  for (var r = 0; r < table.rows.length; r++) {
    var raw = emailIdx >= 0 ? table.rows[r][emailIdx] : '';
    var diag = AuditDiagnostics_buildAuditorEmailDiagnostic_(raw);
    if (diag) {
      diag.sheet = cfg.sheetName;
      diag.entity = AuditDiagnostics_norm_(raw);
      diag.details = diag.details || {};
      diag.details.row = table.startRow + r;
      out.push(diag);
    }
  }

  return out;
}

function AuditDiagnostics_checkAuditPlanningIdentity_(ss) {
  var out = [];
  var cfg = AUDIT_DIAGNOSTICS_CONFIG.AUDIT_PLANNING;
  var sh = ss.getSheetByName(cfg.sheetName);
  if (!sh) {
    out.push(AuditDiagnostics_diag_('ERROR', 'SHEET_MISSING', cfg.sheetName, '', "Sheet 'Audit planning' not found.", {}));
    return out;
  }

  var table = AuditDiagnostics_readTable_(sh, cfg.headers);
  if (!table.ok) {
    out.push(AuditDiagnostics_diag_('ERROR', 'HEADER_MISSING', cfg.sheetName, '', table.message, table.details || {}));
    return out;
  }

  var idxAuditId = table.idx.auditId;
  var idxCompany = table.idx.company;
  var idxStatus = table.idx.status;
  var idxAllowSelf = table.idx.allowSelfPlanning;
  var idxPreassigned = table.idx.preassignedAuditor;
  var idxAssigned = table.idx.assignedTo;

  for (var r = 0; r < table.rows.length; r++) {
    var row = table.rows[r];
    var auditId = idxAuditId >= 0 ? AuditDiagnostics_norm_(row[idxAuditId]) : '';
    var company = idxCompany >= 0 ? AuditDiagnostics_norm_(row[idxCompany]) : '';
    var status = idxStatus >= 0 ? AuditDiagnostics_norm_(row[idxStatus]) : '';
    var allowSelf = idxAllowSelf >= 0 ? AuditDiagnostics_norm_(row[idxAllowSelf]) : '';
    var preassigned = idxPreassigned >= 0 ? AuditDiagnostics_norm_(row[idxPreassigned]) : '';
    var assigned = idxAssigned >= 0 ? AuditDiagnostics_norm_(row[idxAssigned]) : '';

    var entity = auditId || company || ('row ' + (table.startRow + r));

    if (AuditDiagnostics_isYes_(allowSelf) && !preassigned) {
      var sev = AuditDiagnostics_getSeverityForSelfPlanning_(auditId, status);
      out.push(AuditDiagnostics_diag_(
        sev.severity,
        sev.type,
        cfg.sheetName,
        entity,
        AuditDiagnostics_selfPlanningMessage_(sev.type),
        {
          row: table.startRow + r,
          auditId: auditId,
          company: company,
          status: status,
          allowSelfPlanning: allowSelf,
          preassignedAuditor: preassigned
        }
      ));
    }

    var d1 = AuditDiagnostics_buildAuditorEmailDiagnostic_(preassigned);
    if (d1 && preassigned) {
      d1.sheet = cfg.sheetName;
      d1.entity = entity;
      d1.details = d1.details || {};
      d1.details.row = table.startRow + r;
      d1.details.field = 'Preassigned Auditor';
      out.push(d1);
    }

    var d2 = AuditDiagnostics_buildAuditorEmailDiagnostic_(assigned);
    if (d2 && assigned) {
      d2.sheet = cfg.sheetName;
      d2.entity = entity;
      d2.details = d2.details || {};
      d2.details.row = table.startRow + r;
      d2.details.field = 'Assigned to';
      out.push(d2);
    }
  }

  return out;
}

function AuditDiagnostics_getSeverityForSelfPlanning_(auditId, status) {
  var s = AuditDiagnostics_normStatus_(status);
  var id = String(auditId || '').trim().toUpperCase();

  var activeStatuses = {
    'PENDING PLANNING': true,
    'PENDING APPROVAL': true,
    'APPROVED': true,
    'ACCEPTED': true
  };

  var archiveStatuses = {
    'COMPLETED': true,
    'REJECTED': true,
    'CANCELLED': true,
    'CANCELED': true,
    'DENIED': true
  };

  if (archiveStatuses[s]) {
    return {
      severity: 'INFO',
      type: 'SELF_PLANNING_WITHOUT_PREASSIGNED_ARCHIVE'
    };
  }

  if (activeStatuses[s]) {
    if (id.indexOf('TEST') === 0 || id.indexOf('TESTAUD') === 0) {
      return {
        severity: 'WARN',
        type: 'SELF_PLANNING_WITHOUT_PREASSIGNED_TESTDATA'
      };
    }

    return {
      severity: 'ERROR',
      type: 'SELF_PLANNING_WITHOUT_PREASSIGNED_ACTIVE'
    };
  }

  return {
    severity: 'INFO',
    type: 'SELF_PLANNING_WITHOUT_PREASSIGNED_LEGACY'
  };
}

function AuditDiagnostics_selfPlanningMessage_(type) {
  if (type === 'SELF_PLANNING_WITHOUT_PREASSIGNED_ACTIVE') {
    return 'Allow self planning = YES but Preassigned Auditor is empty on active/open audit.';
  }
  if (type === 'SELF_PLANNING_WITHOUT_PREASSIGNED_TESTDATA') {
    return 'Legacy/test audit: Allow self planning = YES but Preassigned Auditor is empty.';
  }
  if (type === 'SELF_PLANNING_WITHOUT_PREASSIGNED_ARCHIVE') {
    return 'Archived/terminal audit has legacy Allow self planning = YES without Preassigned Auditor.';
  }
  return 'Legacy row has Allow self planning = YES without Preassigned Auditor.';
}

function AuditDiagnostics_buildAuditorEmailDiagnostic_(rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  var trimmed = raw.trim();
  var normalized = AuditDiagnostics_normalizeEmail_(rawValue);

  if (!trimmed) return null;

  if (!AuditDiagnostics_isValidEmail_(normalized)) {
    return {
      severity: 'WARN',
      type: 'AUDITOR_EMAIL_NOT_NORMALIZED',
      message: 'Non-email or invalid auditor identity detected.',
      details: {
        input: rawValue,
        normalized: normalized
      }
    };
  }

  if (trimmed !== normalized) {
    return {
      severity: 'WARN',
      type: 'AUDITOR_EMAIL_NOT_NORMALIZED',
      message: 'Auditor email should be normalized using trim().toLowerCase().',
      details: {
        input: rawValue,
        normalized: normalized
      }
    };
  }

  return null;
}

/* ============================================================================
 * LOGGING
 * ========================================================================== */

function AuditDiagnostics_writeLog_(ss, scope, diagnostics) {
  diagnostics = diagnostics || [];

  var sh = ss.getSheetByName(AUDIT_DIAGNOSTICS_CONFIG.LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(AUDIT_DIAGNOSTICS_CONFIG.LOG_SHEET);
  }

  var headers = [
    'Generated_At',
    'Build',
    'Run_Scope',
    'Severity',
    'Type',
    'Sheet',
    'Entity',
    'Message',
    'Details_JSON'
  ];

  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (!diagnostics.length) {
    sh.getRange(2, 1, 1, headers.length).setValues([[
      AuditDiagnostics_formatDateTime_(new Date()),
      AUDIT_DIAGNOSTICS_BUILD,
      scope,
      'INFO',
      'NO_FINDINGS',
      '',
      '',
      'No diagnostics found.',
      '{}'
    ]]);
    return;
  }

  var now = AuditDiagnostics_formatDateTime_(new Date());
  var rows = diagnostics.map(function(d) {
    return [
      now,
      AUDIT_DIAGNOSTICS_BUILD,
      scope,
      d.severity || '',
      d.type || '',
      d.sheet || '',
      d.entity || '',
      d.message || '',
      JSON.stringify(d.details || {})
    ];
  });

  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  try {
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  } catch (e) {}
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function AuditDiagnostics_getSpreadsheet_() {
  var id = '';
  try {
    id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim();
  } catch (e) {}

  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function AuditDiagnostics_readTable_(sheet, headerSpec) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 1 || lastCol < 1) {
    return { ok: false, message: 'Sheet has no data.', details: { sheet: sheet.getName() } };
  }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var map = AuditDiagnostics_headerMap_(headers);
  var idx = {};
  var missing = [];

  Object.keys(headerSpec || {}).forEach(function(key) {
    var spec = headerSpec[key];

    if (key === 'scopes') return;

    var found = map.indexOf(spec);
    idx[key] = found;
    if (found < 0 && AuditDiagnostics_requiredHeader_(key)) {
      missing.push(key + ': ' + JSON.stringify(spec));
    }
  });

  if (missing.length) {
    return {
      ok: false,
      message: 'Required headers missing: ' + missing.join('; '),
      details: { missing: missing }
    };
  }

  var rows = [];
  if (lastRow > 1) {
    rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  }

  return {
    ok: true,
    headers: headers,
    idx: idx,
    rows: rows,
    startRow: 2
  };
}

function AuditDiagnostics_requiredHeader_(key) {
  return key === 'company' ||
    key === 'auditId' ||
    key === 'status' ||
    key === 'allowSelfPlanning' ||
    key === 'preassignedAuditor' ||
    key === 'email' ||
    key === 'displayName';
}

function AuditDiagnostics_headerMap_(headers) {
  var exact = {};
  var norm = {};
  headers = headers || [];

  for (var i = 0; i < headers.length; i++) {
    var h = AuditDiagnostics_norm_(headers[i]);
    if (!h) continue;
    exact[h] = i;
    norm[AuditDiagnostics_normKey_(h)] = i;
  }

  return {
    indexOf: function(names) {
      if (!Array.isArray(names)) names = [names];
      for (var n = 0; n < names.length; n++) {
        var raw = AuditDiagnostics_norm_(names[n]);
        if (!raw) continue;
        if (exact.hasOwnProperty(raw)) return exact[raw];
        var key = AuditDiagnostics_normKey_(raw);
        if (norm.hasOwnProperty(key)) return norm[key];
      }
      return -1;
    }
  };
}

function AuditDiagnostics_diag_(severity, type, sheet, entity, message, details) {
  return {
    severity: severity || 'INFO',
    type: type || '',
    sheet: sheet || '',
    entity: entity || '',
    message: message || '',
    details: details || {}
  };
}

function AuditDiagnostics_countSeverities_(diagnostics) {
  var counts = {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    TOTAL: diagnostics.length
  };

  diagnostics.forEach(function(d) {
    var s = String(d && d.severity || '').toUpperCase();
    if (counts.hasOwnProperty(s)) counts[s]++;
    else counts.INFO++;
  });

  return counts;
}

function AuditDiagnostics_norm_(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function AuditDiagnostics_normKey_(v) {
  return AuditDiagnostics_norm_(v).toLowerCase().replace(/[\s_\-]+/g, ' ');
}

function AuditDiagnostics_normStatus_(v) {
  return AuditDiagnostics_norm_(v).toUpperCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
}

function AuditDiagnostics_isTruthy_(v) {
  var s = AuditDiagnostics_norm_(v).toLowerCase();
  return !!s && s !== 'no' && s !== 'false' && s !== '0' && s !== 'inactive' && s !== 'n';
}

function AuditDiagnostics_isYes_(v) {
  var s = AuditDiagnostics_norm_(v).toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function AuditDiagnostics_parseIntSafe_(v) {
  var n = parseInt(String(v == null ? '' : v).replace(/[^\d\-]/g, ''), 10);
  return isFinite(n) ? n : 0;
}

function AuditDiagnostics_normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function AuditDiagnostics_isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function AuditDiagnostics_normGps_(v) {
  return String(v || '').trim().replace(/\s+/g, '').replace(/,+$/, '');
}

function AuditDiagnostics_formatDateTime_(d) {
  var tz = 'Europe/Amsterdam';
  try {
    tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || tz;
  } catch (e) {}
  return Utilities.formatDate(d || new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}


/* ===== INCLUDED FROM: AuditCacheWarmupDiagnostics.js ===== */
/*
===============================================================================
AuditCacheWarmupDiagnostics.gs
Build: 2026-04-27_CACHE_WARMUP_DIAGNOSTICS_COMPANIES_NAMECORE

Purpose:
- Diagnostics-only checker for Companies / Config_Scopes cache & warmup readiness.
- Uses the actual project function names:
  - AUDIT_CACHE.*
  - RUN_COMPANIESINDEX_*
  - CompaniesIndex_*
  - RUN_CONFIGSCOPES_*
  - ConfigScopes_*
- Does not change business flows.
- Does not rewrite project data.
- Writes output to "Diagnostics_Log".

Manual run functions:
- RUN_CACHE_WARMUP_DIAGNOSTICS()
- RUN_CACHE_WARMUP_DIAGNOSTICS_AND_WARMUP()
===============================================================================
*/

var CACHE_WARMUP_DIAG_BUILD = '2026-04-27_CACHE_WARMUP_DIAGNOSTICS_COMPANIES_NAMECORE';
var CACHE_WARMUP_DIAG_LOG_SHEET = 'Diagnostics_Log';

function RUN_CACHE_WARMUP_DIAGNOSTICS() {
  return CacheWarmupDiagnostics_Run_({ warmup: false });
}

function RUN_CACHE_WARMUP_DIAGNOSTICS_AND_WARMUP() {
  return CacheWarmupDiagnostics_Run_({ warmup: true });
}

function CacheWarmupDiagnostics_Run_(opts) {
  opts = opts || {};
  var started = new Date();
  var diagnostics = [];

  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_checkCoreServices_());
  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_checkSheets_());
  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_probeServices_());

  if (opts.warmup) {
    diagnostics = diagnostics.concat(CacheWarmupDiagnostics_runWarmup_());
  }

  CacheWarmupDiagnostics_writeLog_(diagnostics, opts.warmup ? 'CACHE_WARMUP_AND_DIAG' : 'CACHE_DIAG');

  var counts = CacheWarmupDiagnostics_count_(diagnostics);
  var result = {
    ok: true,
    build: CACHE_WARMUP_DIAG_BUILD,
    generatedAt: CacheWarmupDiagnostics_formatDateTime_(new Date()),
    durationMs: new Date().getTime() - started.getTime(),
    warmup: !!opts.warmup,
    counts: counts,
    diagnostics: diagnostics
  };

  try {
    Logger.log(JSON.stringify(result, null, 2));
  } catch (e) {
    Logger.log('Cache warmup diagnostics completed. Total=' + counts.TOTAL);
  }

  return result;
}

/* ============================================================================
 * CORE SERVICE CHECKS
 * ========================================================================== */

function CacheWarmupDiagnostics_checkCoreServices_() {
  var out = [];

  var auditCacheOk = (typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE);
  out.push(CacheWarmupDiagnostics_diag_(
    auditCacheOk ? 'INFO' : 'ERROR',
    auditCacheOk ? 'AUDIT_CACHE_AVAILABLE' : 'AUDIT_CACHE_MISSING',
    'CacheService',
    'AUDIT_CACHE',
    auditCacheOk ? 'AUDIT_CACHE object is available.' : 'AUDIT_CACHE object is missing.',
    {}
  ));

  CacheWarmupDiagnostics_objFnDiag_(out, 'CacheService', 'AUDIT_CACHE', 'get', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_objFnDiag_(out, 'CacheService', 'AUDIT_CACHE', 'put', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_objFnDiag_(out, 'CacheService', 'AUDIT_CACHE', 'removeNamespace', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_objFnDiag_(out, 'CacheService', 'AUDIT_CACHE', 'diagnostics', 'INFO', 'WARN');
  CacheWarmupDiagnostics_objFnDiag_(out, 'CacheService', 'AUDIT_CACHE', 'warmupReadOnlyReferenceData', 'INFO', 'WARN');

  CacheWarmupDiagnostics_fnDiag_(out, 'CacheService', 'AUDIT_CACHE_diagnostics', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CacheService', 'AUDIT_CACHE_warmupReadOnlyReferenceData', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CacheService', 'AUDIT_CACHE_removeAllRegistered', 'INFO', 'INFO');

  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_GetUidNameIndex', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_GetUidCoreIndex', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_GetLocationSummaryIndex', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_GetNameCoreIndex', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_GetCompanyCoreByName', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'CompaniesIndex_ClearCache', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'RUN_COMPANIESINDEX_DIAGNOSTICS', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'RUN_COMPANIESINDEX_CACHE_WARMUP', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'CompaniesIndexService', 'RUN_COMPANIESINDEX_CACHE_HIT_TEST', 'INFO', 'WARN');

  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'ConfigScopes_GetCatalog', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'ConfigScopes_GetByDisplayName', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'ConfigScopes_GetAliasMeta', 'INFO', 'ERROR');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'ConfigScopes_CanonicalName', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'ConfigScopes_ClearCache', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'RUN_CONFIGSCOPES_DIAGNOSTICS', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'RUN_CONFIGSCOPES_CACHE_WARMUP', 'INFO', 'WARN');
  CacheWarmupDiagnostics_fnDiag_(out, 'ConfigScopesService', 'RUN_CONFIGSCOPES_CACHE_HIT_TEST', 'INFO', 'WARN');

  return out;
}

function CacheWarmupDiagnostics_fnDiag_(out, service, fnName, okSeverity, missingSeverity) {
  var exists = CacheWarmupDiagnostics_fnExists_(fnName);
  out.push(CacheWarmupDiagnostics_diag_(
    exists ? okSeverity : missingSeverity,
    exists ? 'FUNCTION_AVAILABLE' : 'FUNCTION_MISSING',
    service,
    fnName,
    exists ? 'Function is available.' : 'Function not found.',
    { functionName: fnName }
  ));
}

function CacheWarmupDiagnostics_objFnDiag_(out, service, objName, fnName, okSeverity, missingSeverity) {
  var exists = false;
  try {
    var obj = this[objName];
    exists = !!(obj && typeof obj[fnName] === 'function');
  } catch (e) {
    exists = false;
  }

  out.push(CacheWarmupDiagnostics_diag_(
    exists ? okSeverity : missingSeverity,
    exists ? 'OBJECT_FUNCTION_AVAILABLE' : 'OBJECT_FUNCTION_MISSING',
    service,
    objName + '.' + fnName,
    exists ? 'Object function is available.' : 'Object function not found.',
    { objectName: objName, functionName: fnName }
  ));
}

/* ============================================================================
 * SHEET CHECKS
 * ========================================================================== */

function CacheWarmupDiagnostics_checkSheets_() {
  var out = [];
  var ss = CacheWarmupDiagnostics_getSpreadsheet_();

  var expected = [
    { sheet: 'Companies', severityMissing: 'ERROR' },
    { sheet: 'Config_Scopes', severityMissing: 'ERROR' },
    { sheet: 'Auditors', severityMissing: 'ERROR' },
    { sheet: 'Audit planning', severityMissing: 'ERROR' },
    { sheet: 'Standards', severityMissing: 'WARN' }
  ];

  expected.forEach(function(x) {
    var sh = ss.getSheetByName(x.sheet);
    out.push(CacheWarmupDiagnostics_diag_(
      sh ? 'INFO' : x.severityMissing,
      sh ? 'SHEET_AVAILABLE' : 'SHEET_MISSING',
      x.sheet,
      '',
      sh ? 'Sheet exists.' : 'Sheet not found.',
      sh ? { rows: sh.getLastRow(), cols: sh.getLastColumn() } : {}
    ));
  });

  var standards = ss.getSheetByName('Standards');
  if (standards) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'LEGACY_STANDARDS_SHEET_PRESENT',
      'Standards',
      '',
      'Legacy Standards sheet exists. This is allowed only if no active flow reads it.',
      { recommendation: 'Use Config_Scopes as SSOT.' }
    ));
  }

  return out;
}

/* ============================================================================
 * SERVICE PROBES
 * ========================================================================== */

function CacheWarmupDiagnostics_probeServices_() {
  var out = [];
  out = out.concat(CacheWarmupDiagnostics_probeAuditCache_());
  out = out.concat(CacheWarmupDiagnostics_probeConfigScopes_());
  out = out.concat(CacheWarmupDiagnostics_probeCompaniesIndex_());
  return out;
}

function CacheWarmupDiagnostics_probeAuditCache_() {
  var out = [];
  if (!(typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function')) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'AUDIT_CACHE_DIAGNOSTICS_NOT_AVAILABLE',
      'CacheService',
      'AUDIT_CACHE.diagnostics',
      'AUDIT_CACHE diagnostics function is not available.',
      {}
    ));
    return out;
  }

  var t0 = new Date().getTime();
  try {
    var d = AUDIT_CACHE.diagnostics();
    out.push(CacheWarmupDiagnostics_diag_(
      'INFO',
      'AUDIT_CACHE_DIAGNOSTICS_OK',
      'CacheService',
      'AUDIT_CACHE.diagnostics',
      'AUDIT_CACHE diagnostics ran successfully.',
      {
        ms: new Date().getTime() - t0,
        version: d && d.version,
        namespaces: d && d.namespaces,
        totalRegisteredKeys: d && d.totalRegisteredKeys
      }
    ));
  } catch (e) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'AUDIT_CACHE_DIAGNOSTICS_FAILED',
      'CacheService',
      'AUDIT_CACHE.diagnostics',
      'AUDIT_CACHE diagnostics failed.',
      { ms: new Date().getTime() - t0, error: CacheWarmupDiagnostics_err_(e) }
    ));
  }

  return out;
}

function CacheWarmupDiagnostics_probeConfigScopes_() {
  var out = [];

  if (!CacheWarmupDiagnostics_fnExists_('ConfigScopes_GetCatalog')) {
    out.push(CacheWarmupDiagnostics_diag_(
      'ERROR',
      'CONFIG_SCOPES_SERVICE_NOT_AVAILABLE',
      'Config_Scopes',
      'ConfigScopes_GetCatalog',
      'ConfigScopes_GetCatalog not found.',
      {}
    ));
    return out;
  }

  var t0 = new Date().getTime();
  try {
    var catalog = ConfigScopes_GetCatalog(false);
    var active = CacheWarmupDiagnostics_fnExists_('ConfigScopes_GetActiveScopes') ? ConfigScopes_GetActiveScopes(false) : [];
    var byDisplay = CacheWarmupDiagnostics_fnExists_('ConfigScopes_GetByDisplayName') ? ConfigScopes_GetByDisplayName(false) : null;
    var alias = CacheWarmupDiagnostics_fnExists_('ConfigScopes_GetAliasMeta') ? ConfigScopes_GetAliasMeta(false) : null;

    out.push(CacheWarmupDiagnostics_diag_(
      catalog && catalog.ok ? 'INFO' : 'WARN',
      catalog && catalog.ok ? 'CONFIG_SCOPES_SERVICE_OK' : 'CONFIG_SCOPES_SERVICE_WARN',
      'Config_Scopes',
      'ConfigScopes_GetCatalog',
      catalog && catalog.ok ? 'Config_Scopes catalog loaded through service.' : 'Config_Scopes catalog did not return ok=true.',
      {
        ms: new Date().getTime() - t0,
        catalogRows: catalog && (catalog.rowCount || (catalog.rows || []).length) || 0,
        activeRows: Array.isArray(active) ? active.length : 0,
        byDisplayCount: byDisplay && byDisplay.count || 0,
        aliasKeys: alias && alias.byAnyKey ? Object.keys(alias.byAnyKey).length : 0
      }
    ));
  } catch (e) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'CONFIG_SCOPES_SERVICE_PROBE_FAILED',
      'Config_Scopes',
      'ConfigScopes_GetCatalog',
      'ConfigScopes service probe failed.',
      { ms: new Date().getTime() - t0, error: CacheWarmupDiagnostics_err_(e) }
    ));
  }

  return out;
}

function CacheWarmupDiagnostics_probeCompaniesIndex_() {
  var out = [];

  if (!CacheWarmupDiagnostics_fnExists_('CompaniesIndex_GetUidNameIndex')) {
    out.push(CacheWarmupDiagnostics_diag_(
      'ERROR',
      'COMPANIES_INDEX_SERVICE_NOT_AVAILABLE',
      'Companies',
      'CompaniesIndex_GetUidNameIndex',
      'CompaniesIndex_GetUidNameIndex not found.',
      {}
    ));
    return out;
  }

  var t0 = new Date().getTime();
  try {
    var uidName = CompaniesIndex_GetUidNameIndex(false);
    var uidCore = CompaniesIndex_GetUidCoreIndex(false);
    var loc = CompaniesIndex_GetLocationSummaryIndex(false);
    var nameCore = (typeof CompaniesIndex_GetNameCoreIndex === 'function') ? CompaniesIndex_GetNameCoreIndex(false) : null;

    out.push(CacheWarmupDiagnostics_diag_(
      uidName && uidName.ok && uidCore && uidCore.ok && loc && loc.ok ? 'INFO' : 'WARN',
      uidName && uidName.ok && uidCore && uidCore.ok && loc && loc.ok ? 'COMPANIES_INDEX_SERVICE_OK' : 'COMPANIES_INDEX_SERVICE_WARN',
      'Companies',
      'CompaniesIndex_*',
      'Companies lightweight indexes loaded through service.',
      {
        ms: new Date().getTime() - t0,
        uidNameCount: uidName && uidName.count || 0,
        uidCoreCount: uidCore && uidCore.count || 0,
        locationSummaryCount: loc && loc.count || 0,
        nameCoreCount: nameCore && nameCore.count || 0
      }
    ));
  } catch (e) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'COMPANIES_INDEX_SERVICE_PROBE_FAILED',
      'Companies',
      'CompaniesIndex_*',
      'Companies index service probe failed.',
      { ms: new Date().getTime() - t0, error: CacheWarmupDiagnostics_err_(e) }
    ));
  }

  return out;
}

/* ============================================================================
 * WARMUP
 * ========================================================================== */

function CacheWarmupDiagnostics_runWarmup_() {
  var out = [];

  out = out.concat(CacheWarmupDiagnostics_callWarmup_('CacheService', 'AUDIT_CACHE_warmupReadOnlyReferenceData'));
  out = out.concat(CacheWarmupDiagnostics_callWarmup_('ConfigScopesService', 'RUN_CONFIGSCOPES_CACHE_WARMUP'));
  out = out.concat(CacheWarmupDiagnostics_callWarmup_('CompaniesIndexService', 'RUN_COMPANIESINDEX_CACHE_WARMUP'));

  return out;
}

function CacheWarmupDiagnostics_callWarmup_(service, fnName) {
  var out = [];

  if (!CacheWarmupDiagnostics_fnExists_(fnName)) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'WARMUP_FUNCTION_NOT_AVAILABLE',
      service,
      fnName,
      'Warmup function not found.',
      {}
    ));
    return out;
  }

  var t0 = new Date().getTime();
  try {
    var res = this[fnName]();
    out.push(CacheWarmupDiagnostics_diag_(
      res && res.ok === false ? 'WARN' : 'INFO',
      res && res.ok === false ? 'WARMUP_WARN' : 'WARMUP_OK',
      service,
      fnName,
      'Warmup function executed.',
      { ms: new Date().getTime() - t0, result: CacheWarmupDiagnostics_smallJson_(res) }
    ));
  } catch (e) {
    out.push(CacheWarmupDiagnostics_diag_(
      'WARN',
      'WARMUP_FAILED',
      service,
      fnName,
      'Warmup function failed.',
      { ms: new Date().getTime() - t0, error: CacheWarmupDiagnostics_err_(e) }
    ));
  }

  return out;
}

/* ============================================================================
 * LOGGING
 * ========================================================================== */

function CacheWarmupDiagnostics_writeLog_(diagnostics, runScope) {
  var ss = CacheWarmupDiagnostics_getSpreadsheet_();
  var sh = ss.getSheetByName(CACHE_WARMUP_DIAG_LOG_SHEET);
  if (!sh) sh = ss.insertSheet(CACHE_WARMUP_DIAG_LOG_SHEET);

  var headers = [
    'Generated_At',
    'Build',
    'Run_Scope',
    'Severity',
    'Type',
    'Sheet',
    'Entity',
    'Message',
    'Details_JSON'
  ];

  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);

  diagnostics = diagnostics || [];
  if (!diagnostics.length) {
    diagnostics = [CacheWarmupDiagnostics_diag_('INFO', 'NO_FINDINGS', '', '', 'No findings.', {})];
  }

  var now = CacheWarmupDiagnostics_formatDateTime_(new Date());
  var rows = diagnostics.map(function(d) {
    return [
      now,
      CACHE_WARMUP_DIAG_BUILD,
      runScope || 'CACHE_DIAG',
      d.severity || '',
      d.type || '',
      d.sheet || '',
      d.entity || '',
      d.message || '',
      JSON.stringify(d.details || {})
    ];
  });

  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  try {
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, headers.length);
  } catch (e) {}
}

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function CacheWarmupDiagnostics_getSpreadsheet_() {
  var id = '';
  try {
    id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim();
  } catch (e) {}

  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function CacheWarmupDiagnostics_fnExists_(fnName) {
  try {
    return typeof this[fnName] === 'function';
  } catch (e) {
    return false;
  }
}

function CacheWarmupDiagnostics_diag_(severity, type, sheet, entity, message, details) {
  return {
    severity: severity || 'INFO',
    type: type || '',
    sheet: sheet || '',
    entity: entity || '',
    message: message || '',
    details: details || {}
  };
}

function CacheWarmupDiagnostics_count_(diagnostics) {
  var c = { ERROR: 0, WARN: 0, INFO: 0, TOTAL: 0 };
  diagnostics = diagnostics || [];
  c.TOTAL = diagnostics.length;
  diagnostics.forEach(function(d) {
    var s = String((d && d.severity) || '').toUpperCase();
    if (c.hasOwnProperty(s)) c[s]++;
    else c.INFO++;
  });
  return c;
}

function CacheWarmupDiagnostics_err_(e) {
  return String(e && e.message ? e.message : e);
}

function CacheWarmupDiagnostics_smallJson_(obj) {
  try {
    var s = JSON.stringify(obj || {});
    if (s.length > 1000) return s.slice(0, 1000) + '...';
    return s;
  } catch (e) {
    return String(obj);
  }
}

function CacheWarmupDiagnostics_formatDateTime_(d) {
  var tz = 'Europe/Amsterdam';
  try {
    tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || tz;
  } catch (e) {}
  return Utilities.formatDate(d || new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}


/* ===== INCLUDED FROM: AuditorAvailabilityDiagnostic.js ===== */
/**
 * AuditorAvailabilityDiagnostic.gs
 * Add this as a separate file next to the current backend.
 * Run AV_DIAG_month() manually from Apps Script.
 */

function AV_DIAG_month(auditorEmail, monthKey) {
  auditorEmail = String(auditorEmail || '').trim().toLowerCase();
  monthKey = String(monthKey || '').trim();
  if (!auditorEmail) throw new Error('Missing auditorEmail');
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Invalid monthKey');

  var ss = AV_getSs_();
  var sh = ss.getSheetByName('Auditor Availability');
  if (!sh) throw new Error('Sheet "Auditor Availability" not found');

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) {
    Logger.log(JSON.stringify({ ok:true, matchedRows:0, days:{} }, null, 2));
    return { ok:true, matchedRows:0, days:{} };
  }

  var headers = values[0].map(function(x){ return String(x || '').trim(); });
  var idx = AV_exactHeaderIndexes_(headers);
  AV_assertHeaders_(idx);

  var bounds = AV_monthBounds_(monthKey);
  var startISO = bounds.startISO;
  var endISO = bounds.endISO;

  var out = {
    ok: true,
    auditorEmail: auditorEmail,
    monthKey: monthKey,
    startISO: startISO,
    endISO: endISO,
    matchedRows: 0,
    rows: [],
    chosenByDay: {},
    counts: { hard:0, soft:0, available:0 }
  };

  function rankStatus_(s) {
    s = String(s || '').toLowerCase();
    if (s === 'hard') return 3;
    if (s === 'soft' || s === 'blocked') return 2;
    return 1;
  }

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var rowNumber = r + 1;
    var em = AV_normEmail_(row[idx.auditorEmail]);
    var parsedDate = AV_parseDate_(row[idx.date]);
    var iso = parsedDate ? AV_fmtYMD_(parsedDate) : '';

    if (em !== auditorEmail) continue;
    if (!iso) continue;
    if (iso < startISO || iso > endISO) continue;

    out.matchedRows++;

    var cls = AV_classifyRow_(row, idx, rowNumber);
    var rec = {
      rowNumber: rowNumber,
      iso: iso,
      available: String(row[idx.available] || ''),
      from1: String(row[idx.firstStart] || ''),
      to1: String(row[idx.firstEnd] || ''),
      auditId1: String(row[idx.auditId1] || ''),
      from2: String(row[idx.secondStart] || ''),
      to2: String(row[idx.secondEnd] || ''),
      auditId2: String(row[idx.auditId2] || ''),
      status1: String(row[idx.status1] || ''),
      status2: String(row[idx.status2] || ''),
      finalStatus: cls.finalStatus,
      slot1Hard: cls.slot1Hard,
      slot2Hard: cls.slot2Hard,
      slot1Soft: cls.slot1Soft,
      slot2Soft: cls.slot2Soft,
      decisionReason: cls.decisionReason,
      intervals: cls.intervals
    };
    out.rows.push(rec);

    var existing = out.chosenByDay[iso];
    if (!existing) {
      out.chosenByDay[iso] = rec;
    } else {
      var oldRank = rankStatus_(existing.finalStatus);
      var newRank = rankStatus_(rec.finalStatus);
      if (newRank > oldRank) {
        out.chosenByDay[iso] = rec;
      } else if (newRank === oldRank) {
        var oldHasAuditId = !!(existing.auditId1 || existing.auditId2);
        var newHasAuditId = !!(rec.auditId1 || rec.auditId2);
        if (newHasAuditId && !oldHasAuditId) out.chosenByDay[iso] = rec;
      }
    }
  }

  Object.keys(out.chosenByDay).sort().forEach(function(iso){
    var s = String(out.chosenByDay[iso].finalStatus || '').toLowerCase();
    if (s === 'hard') out.counts.hard++;
    else if (s === 'soft' || s === 'blocked') out.counts.soft++;
    else out.counts.available++;
  });

  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * Convenience wrapper:
 * edit these 2 values and run this function.
 */
function AV_DIAG_month_run() {
  return AV_DIAG_month('romboutsrwj@gmail.com', '2026-04');
}


/* ===== INCLUDED FROM: NotificationRules_Diagnostics.js ===== */
/***********************************************************************
 * FILE: NotificationRules_Diagnostics.gs
 *
 * PURPOSE
 * - Diagnose why Notification_Rules returns 0 parsed rows
 * - READ ONLY
 * - No cache changes
 * - No notification logic changes
 * - No planning/status/availability impact
 ***********************************************************************/

function RUN_NOTIFICATION_RULES_DIAGNOSTICS() {
  return NotificationRules_Diagnostics();
}

function NotificationRules_Diagnostics() {
  var out = {
    ok: true,
    sheetNameExpected: 'Notification_Rules',
    sheetExists: false,
    lastRow: 0,
    lastColumn: 0,
    headers: [],
    normalizedHeaders: [],
    requiredHeaders: {
      RuleKey: false,
      Value: false,
      Active: false
    },
    rowsTotal: 0,
    rowsWithRuleKey: 0,
    rowsActive: 0,
    rowsInactive: 0,
    rowsBlankRuleKey: 0,
    sampleRows: [],
    existingParserResult: null,
    errors: []
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Notification_Rules');

    if (!sh) {
      out.ok = false;
      out.errors.push('Missing sheet: Notification_Rules');
      Logger.log(JSON.stringify(out, null, 2));
      return out;
    }

    out.sheetExists = true;
    out.lastRow = sh.getLastRow();
    out.lastColumn = sh.getLastColumn();

    if (out.lastRow < 1 || out.lastColumn < 1) {
      out.ok = false;
      out.errors.push('Notification_Rules is empty');
      Logger.log(JSON.stringify(out, null, 2));
      return out;
    }

    var values = sh.getDataRange().getValues();
    var headers = values[0] || [];

    out.headers = headers.map(function(h) {
      return String(h == null ? '' : h);
    });

    out.normalizedHeaders = out.headers.map(function(h) {
      return NotificationRules_diagNorm_(h);
    });

    var idxExact = {};
    var idxNorm = {};

    for (var c = 0; c < headers.length; c++) {
      var raw = String(headers[c] == null ? '' : headers[c]).trim();
      var norm = NotificationRules_diagNorm_(raw);
      if (raw && idxExact[raw] === undefined) idxExact[raw] = c;
      if (norm && idxNorm[norm] === undefined) idxNorm[norm] = c;
    }

    var ruleKeyCol = NotificationRules_findHeader_(idxExact, idxNorm, [
      'RuleKey',
      'Rule Key',
      'RULE_KEY',
      'Rule',
      'Key'
    ]);

    var valueCol = NotificationRules_findHeader_(idxExact, idxNorm, [
      'Value',
      'RuleValue',
      'Rule Value',
      'VALUE'
    ]);

    var activeCol = NotificationRules_findHeader_(idxExact, idxNorm, [
      'Active',
      'ACTIVE',
      'Enabled',
      'ENABLED'
    ]);

    out.requiredHeaders.RuleKey = ruleKeyCol >= 0;
    out.requiredHeaders.Value = valueCol >= 0;
    out.requiredHeaders.Active = activeCol >= 0;

    out.detectedColumns = {
      ruleKeyCol0: ruleKeyCol,
      valueCol0: valueCol,
      activeCol0: activeCol
    };

    out.rowsTotal = Math.max(0, values.length - 1);

    for (var r = 1; r < values.length; r++) {
      var row = values[r] || [];

      var ruleKey = ruleKeyCol >= 0 ? String(row[ruleKeyCol] == null ? '' : row[ruleKeyCol]).trim() : '';
      var activeRaw = activeCol >= 0 ? String(row[activeCol] == null ? '' : row[activeCol]).trim() : '';
      var activeNorm = activeRaw.toUpperCase();

      if (!ruleKey) {
        out.rowsBlankRuleKey++;
      } else {
        out.rowsWithRuleKey++;
      }

      var isInactive = activeCol >= 0 && activeRaw && !(activeNorm === 'YES' || activeNorm === 'TRUE' || activeNorm === '1');
      if (ruleKey && isInactive) out.rowsInactive++;
      if (ruleKey && !isInactive) out.rowsActive++;

      if (out.sampleRows.length < 10) {
        out.sampleRows.push({
          rowNumber: r + 1,
          ruleKey: ruleKey,
          value: valueCol >= 0 ? row[valueCol] : '',
          active: activeRaw
        });
      }
    }

    try {
      if (typeof NotificationConfig_GetAllRules === 'function') {
        var parsed = NotificationConfig_GetAllRules();
        out.existingParserResult = {
          ok: true,
          count: Object.keys(parsed || {}).length,
          keys: Object.keys(parsed || {}).slice(0, 20)
        };
      } else {
        out.existingParserResult = {
          ok: false,
          error: 'NotificationConfig_GetAllRules is not defined'
        };
      }
    } catch (eParser) {
      out.existingParserResult = {
        ok: false,
        error: String(eParser && eParser.message ? eParser.message : eParser)
      };
    }

    if (!out.requiredHeaders.RuleKey) {
      out.ok = false;
      out.errors.push('Could not detect RuleKey header. Existing parser expects exact header RuleKey.');
    }

    if (out.rowsWithRuleKey > 0 && out.existingParserResult && out.existingParserResult.count === 0) {
      out.errors.push('Rows exist, but existing parser returns 0. Likely exact header mismatch or inactive filter.');
    }

    Logger.log(JSON.stringify(out, null, 2));
    return out;

  } catch (e) {
    out.ok = false;
    out.errors.push(String(e && e.stack ? e.stack : e));
    Logger.log(JSON.stringify(out, null, 2));
    return out;
  }
}

function NotificationRules_diagNorm_(v) {
  return String(v == null ? '' : v)
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function NotificationRules_findHeader_(idxExact, idxNorm, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var raw = String(candidates[i] || '').trim();
    if (idxExact.hasOwnProperty(raw)) return idxExact[raw];

    var norm = NotificationRules_diagNorm_(raw);
    if (idxNorm.hasOwnProperty(norm)) return idxNorm[norm];
  }
  return -1;
}


/* ===== INCLUDED FROM: ManagerDiagnostics_GS_FULL_2026-04-26.txt ===== */
/*
===============================================================================
ManagerDiagnostics.gs
Build: 2026-04-26_MANAGER_DIAGNOSTICS_CENTRAL_OWNER

Purpose:
- Central read-only diagnostics endpoint for the Manager portal.
- One owner for performance, cache, consistency, action timings and system status.
- Does not repair data.
- Does not clear cache.
- Does not modify audits or availability.

Public endpoints:
- ManagerDiagnostics_RunAll()
- ManagerDiagnostics_RecordActionTiming(action, auditId, durationMs, success, details)
- RUN_MANAGER_DIAGNOSTICS()
===============================================================================
*/

var MANAGER_DIAGNOSTICS_BUILD = '2026-04-28_MANAGER_DIAGNOSTICS_ENV_COMPACT_LOG';

var MANAGER_DIAGNOSTICS_CONFIG = {
  ACTION_TIMINGS_SHEET: 'Diagnostics_Action_Timings',
  MAX_TIMING_ROWS: 500,
  SLOW_ACTION_MS: 5000
};

function RUN_MANAGER_DIAGNOSTICS() {
  return ManagerDiagnostics_RunAll();
}

function ManagerDiagnostics_RunAll() {
  var started = new Date().getTime();
  var blocks = [];
  var warnings = [];
  var errors = [];

  blocks.push(ManagerDiagnostics_runBlock_('System', ManagerDiagnostics_systemStatus_));
  blocks.push(ManagerDiagnostics_runBlock_('Performance', ManagerDiagnostics_performanceSnapshot_));
  blocks.push(ManagerDiagnostics_runBlock_('Cache', ManagerDiagnostics_cacheSnapshot_));
  blocks.push(ManagerDiagnostics_runBlock_('Data consistency', ManagerDiagnostics_consistencySnapshot_));
  blocks.push(ManagerDiagnostics_runBlock_('Action timings', ManagerDiagnostics_actionTimingSnapshot_));
  blocks.push(ManagerDiagnostics_runBlock_('Notifications', ManagerDiagnostics_notificationSnapshot_));
  blocks.push(ManagerDiagnostics_runBlock_('Environment', ManagerDiagnostics_environmentSnapshot_));

  blocks.forEach(function(b) {
    if (!b) return;
    (b.warnings || []).forEach(function(w) { warnings.push(w); });
    (b.errors || []).forEach(function(e) { errors.push(e); });
    if (b.severity === 'WARN') warnings.push(b.message || b.name);
    if (b.severity === 'ERROR') errors.push(b.message || b.name);
  });

  var counts = ManagerDiagnostics_countBlocks_(blocks);
  var durationMs = new Date().getTime() - started;

  return {
    ok: errors.length === 0,
    build: MANAGER_DIAGNOSTICS_BUILD,
    generatedAt: ManagerDiagnostics_now_(),
    durationMs: durationMs,
    status: errors.length ? 'ERROR' : (warnings.length ? 'WARNING' : 'OK'),
    counts: counts,
    summaryLines: ManagerDiagnostics_buildSummaryLines_(blocks, durationMs),
    blocks: blocks,
    warnings: warnings,
    errors: errors
  };
}

function ManagerDiagnostics_systemStatus_() {
  var items = [];
  function fn(name, severityMissing) {
    var exists = ManagerDiagnostics_fnExists_(name);
    items.push({
      name: name,
      ok: exists,
      severity: exists ? 'OK' : (severityMissing || 'WARN')
    });
  }

  fn('getManagerV5Open', 'ERROR');
  fn('getManagerV5Archived', 'WARN');
  fn('managerV5Action', 'ERROR');
  fn('ManagerV5_Action', 'WARN');
  fn('Status_applyAction', 'ERROR');
  fn('AuditDiagnostics_RunAll', 'WARN');
  fn('RUN_CACHE_WARMUP_DIAGNOSTICS', 'WARN');
  fn('RUN_NOTIFICATION_RULES_DIAGNOSTICS', 'INFO');
  fn('AUDIT_CACHE_diagnostics', 'WARN');

  var missingErrors = items.filter(function(x) { return !x.ok && x.severity === 'ERROR'; });
  var missingWarnings = items.filter(function(x) { return !x.ok && x.severity === 'WARN'; });

  return {
    severity: missingErrors.length ? 'ERROR' : (missingWarnings.length ? 'WARN' : 'OK'),
    message: missingErrors.length ? 'Required functions missing.' : (missingWarnings.length ? 'Optional diagnostics functions missing.' : 'System endpoints available.'),
    details: { functions: items },
    warnings: missingWarnings.map(function(x) { return 'Missing optional function: ' + x.name; }),
    errors: missingErrors.map(function(x) { return 'Missing required function: ' + x.name; })
  };
}

function ManagerDiagnostics_performanceSnapshot_() {
  var probes = [];

  function probe(label, fnName, args) {
    var t0 = new Date().getTime();
    var item = { label: label, fn: fnName, ok: false, durationMs: 0, rows: null, message: '' };
    try {
      if (!ManagerDiagnostics_fnExists_(fnName)) {
        item.message = 'Function not found';
      } else {
        var res = this[fnName].apply(this, args || []);
        item.ok = !(res && res.success === false);
        item.rows = res && res.rows && Array.isArray(res.rows) ? res.rows.length : null;
        item.message = res && res.message ? String(res.message) : '';
        item.cacheHit = !!(res && res.cacheHit);
      }
    } catch (e) {
      item.message = ManagerDiagnostics_err_(e);
    }
    item.durationMs = new Date().getTime() - t0;
    probes.push(item);
  }

  probe('Manager grid open dataset', 'getManagerV5Open', []);
  probe('Completed dataset', 'getManagerV5Archived', []);
  probe('Dashboard summary', 'getManagerV5DashboardData', []);

  var slow = probes.filter(function(p) { return p.durationMs > 5000; });
  var failed = probes.filter(function(p) { return p.ok === false && p.message; });

  return {
    severity: failed.length ? 'WARN' : (slow.length ? 'WARN' : 'OK'),
    message: failed.length ? 'Some performance probes failed.' : (slow.length ? 'Some probes are slow.' : 'Performance probes completed.'),
    details: { probes: probes },
    warnings: slow.map(function(p) { return p.label + ' slow: ' + p.durationMs + ' ms'; }),
    errors: []
  };
}

function ManagerDiagnostics_cacheSnapshot_() {
  var details = {
    auditCacheAvailable: typeof AUDIT_CACHE !== 'undefined' && !!AUDIT_CACHE,
    auditCacheDiagnostics: null,
    warmupDiagnostics: null
  };
  var warnings = [];
  var errors = [];

  if (typeof AUDIT_CACHE !== 'undefined' && AUDIT_CACHE && typeof AUDIT_CACHE.diagnostics === 'function') {
    try {
      details.auditCacheDiagnostics = AUDIT_CACHE.diagnostics();
    } catch (e) {
      warnings.push('AUDIT_CACHE diagnostics failed: ' + ManagerDiagnostics_err_(e));
    }
  } else {
    warnings.push('AUDIT_CACHE.diagnostics unavailable.');
  }

  if (ManagerDiagnostics_fnExists_('RUN_CACHE_WARMUP_DIAGNOSTICS')) {
    try {
      details.warmupDiagnostics = RUN_CACHE_WARMUP_DIAGNOSTICS();
    } catch (e2) {
      warnings.push('Cache warmup diagnostics failed: ' + ManagerDiagnostics_err_(e2));
    }
  }

  return {
    severity: errors.length ? 'ERROR' : (warnings.length ? 'WARN' : 'OK'),
    message: errors.length ? 'Cache diagnostics errors.' : (warnings.length ? 'Cache diagnostics warnings.' : 'Cache diagnostics OK.'),
    details: details,
    warnings: warnings,
    errors: errors
  };
}

function ManagerDiagnostics_consistencySnapshot_() {
  var details = { auditDiagnostics: null, duplicateAuditIds: null };
  var warnings = [];
  var errors = [];

  if (ManagerDiagnostics_fnExists_('AuditDiagnostics_RunAll')) {
    try {
      details.auditDiagnostics = AuditDiagnostics_RunAll();
      var c = details.auditDiagnostics && details.auditDiagnostics.counts ? details.auditDiagnostics.counts : {};
      if (Number(c.ERROR || 0) > 0) errors.push('Audit diagnostics reports ' + c.ERROR + ' error(s).');
      if (Number(c.WARN || 0) > 0) warnings.push('Audit diagnostics reports ' + c.WARN + ' warning(s).');
    } catch (e) {
      warnings.push('AuditDiagnostics_RunAll failed: ' + ManagerDiagnostics_err_(e));
    }
  } else {
    warnings.push('AuditDiagnostics_RunAll unavailable.');
  }

  try {
    details.duplicateAuditIds = ManagerDiagnostics_checkDuplicateAuditIds_();
    if (details.duplicateAuditIds && details.duplicateAuditIds.duplicates && details.duplicateAuditIds.duplicates.length) {
      errors.push('Duplicate Audit ID rows found: ' + details.duplicateAuditIds.duplicates.length);
    }
  } catch (e2) {
    warnings.push('Duplicate Audit ID check failed: ' + ManagerDiagnostics_err_(e2));
  }

  return {
    severity: errors.length ? 'ERROR' : (warnings.length ? 'WARN' : 'OK'),
    message: errors.length ? 'Consistency errors found.' : (warnings.length ? 'Consistency warnings found.' : 'Consistency checks OK.'),
    details: details,
    warnings: warnings,
    errors: errors
  };
}

function ManagerDiagnostics_notificationSnapshot_() {
  var details = { notificationRules: null };
  var warnings = [];
  if (ManagerDiagnostics_fnExists_('RUN_NOTIFICATION_RULES_DIAGNOSTICS')) {
    try {
      details.notificationRules = RUN_NOTIFICATION_RULES_DIAGNOSTICS();
      if (details.notificationRules && details.notificationRules.ok === false) {
        warnings.push('Notification rules diagnostics not OK.');
      }
      if (details.notificationRules && details.notificationRules.errors && details.notificationRules.errors.length) {
        warnings = warnings.concat(details.notificationRules.errors);
      }
    } catch (e) {
      warnings.push('Notification rules diagnostics failed: ' + ManagerDiagnostics_err_(e));
    }
  }
  return {
    severity: warnings.length ? 'WARN' : 'OK',
    message: warnings.length ? 'Notification diagnostics warnings.' : 'Notification diagnostics OK or unavailable.',
    details: details,
    warnings: warnings,
    errors: []
  };
}

function ManagerDiagnostics_environmentSnapshot_() {
  var details = {
    environment: null,
    releasePrecheck: null
  };
  var warnings = [];
  var errors = [];

  try {
    if (ManagerDiagnostics_fnExists_('SYS_getUiEnvironmentPayload_')) {
      details.environment = SYS_getUiEnvironmentPayload_();
    } else {
      warnings.push('SYS_getUiEnvironmentPayload_ unavailable.');
    }
  } catch (eEnv) {
    warnings.push('Environment payload failed: ' + ManagerDiagnostics_err_(eEnv));
  }

  try {
    if (ManagerDiagnostics_fnExists_('SYS_RELEASE_PRECHECK')) {
      details.releasePrecheck = SYS_RELEASE_PRECHECK();

      if (details.releasePrecheck && details.releasePrecheck.errors && details.releasePrecheck.errors.length) {
        errors = errors.concat(details.releasePrecheck.errors);
      }

      if (details.releasePrecheck && details.releasePrecheck.warnings && details.releasePrecheck.warnings.length) {
        warnings = warnings.concat(details.releasePrecheck.warnings);
      }
    } else {
      warnings.push('SYS_RELEASE_PRECHECK unavailable.');
    }
  } catch (ePre) {
    warnings.push('Release precheck failed: ' + ManagerDiagnostics_err_(ePre));
  }

  var env = '';
  try {
    env = String((details.environment && details.environment.env) || '').trim().toUpperCase();
  } catch (e1) {}

  return {
    severity: errors.length ? 'ERROR' : (warnings.length ? 'WARN' : 'OK'),
    message: errors.length
      ? 'Environment safeguards failed.'
      : (warnings.length
          ? 'Environment safeguards warnings.'
          : ('Environment safeguards OK' + (env ? ' (' + env + ')' : '') + '.')),
    details: details,
    warnings: warnings,
    errors: errors
  };
}

function ManagerDiagnostics_actionTimingSnapshot_() {
  var summary = ManagerDiagnostics_getActionTimingSummary_();
  var warnings = [];

  (summary.actions || []).forEach(function(a) {
    if (a.lastMs > MANAGER_DIAGNOSTICS_CONFIG.SLOW_ACTION_MS) {
      warnings.push(a.action + ' last runtime slow: ' + a.lastMs + ' ms');
    }
    if (a.avgMs > MANAGER_DIAGNOSTICS_CONFIG.SLOW_ACTION_MS) {
      warnings.push(a.action + ' average runtime slow: ' + a.avgMs + ' ms');
    }
  });

  return {
    severity: warnings.length ? 'WARN' : 'OK',
    message: summary.totalRows ? 'Action timing summary loaded.' : 'No action timings registered yet.',
    details: summary,
    warnings: warnings,
    errors: []
  };
}

function ManagerDiagnostics_RecordActionTiming(action, auditId, durationMs, success, details) {
  action = String(action || '').trim().toUpperCase();
  auditId = String(auditId || '').trim();
  durationMs = Number(durationMs || 0);
  success = success !== false;
  details = details || {};

  var ss = ManagerDiagnostics_getSpreadsheet_();
  var sh = ss.getSheetByName(MANAGER_DIAGNOSTICS_CONFIG.ACTION_TIMINGS_SHEET);
  if (!sh) sh = ss.insertSheet(MANAGER_DIAGNOSTICS_CONFIG.ACTION_TIMINGS_SHEET);

  var headers = ['Timestamp', 'Action', 'Audit_ID', 'Duration_Ms', 'Success', 'Message', 'Details_JSON'];
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    try { sh.setFrozenRows(1); } catch (e0) {}
  }

  var message = String(details.message || details.error || '').slice(0, 500);
  var row = [
    ManagerDiagnostics_now_(),
    action,
    auditId,
    durationMs,
    success ? 'YES' : 'NO',
    message,
    ManagerDiagnostics_safeJson_(details, 2000)
  ];
  sh.appendRow(row);

  ManagerDiagnostics_trimTimingSheet_(sh);
  return { ok: true, action: action, auditId: auditId, durationMs: durationMs };
}

function Diagnostics_RecordActionTiming(action, auditId, durationMs, success, details) {
  return ManagerDiagnostics_RecordActionTiming(action, auditId, durationMs, success, details);
}

function ManagerDiagnostics_getActionTimingSummary_() {
  var ss = ManagerDiagnostics_getSpreadsheet_();
  var sh = ss.getSheetByName(MANAGER_DIAGNOSTICS_CONFIG.ACTION_TIMINGS_SHEET);
  if (!sh || sh.getLastRow() < 2) {
    return { totalRows: 0, actions: [] };
  }

  var values = sh.getDataRange().getValues();
  var hdr = values[0] || [];
  var idx = {};
  for (var i = 0; i < hdr.length; i++) idx[String(hdr[i] || '').trim()] = i;

  var cTs = idx.Timestamp;
  var cAction = idx.Action;
  var cAudit = idx.Audit_ID;
  var cMs = idx.Duration_Ms;
  var cSuccess = idx.Success;

  var by = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r] || [];
    var action = String(row[cAction] || '').trim().toUpperCase();
    if (!action) continue;
    var ms = Number(row[cMs] || 0);
    if (!isFinite(ms)) ms = 0;
    if (!by[action]) {
      by[action] = { action: action, count: 0, totalMs: 0, avgMs: 0, lastMs: 0, lastAt: '', lastAuditId: '', failures: 0 };
    }
    by[action].count++;
    by[action].totalMs += ms;
    by[action].lastMs = ms;
    by[action].lastAt = String(row[cTs] || '');
    by[action].lastAuditId = String(row[cAudit] || '');
    if (String(row[cSuccess] || '').trim().toUpperCase() !== 'YES') by[action].failures++;
  }

  var actions = Object.keys(by).sort().map(function(k) {
    var a = by[k];
    a.avgMs = a.count ? Math.round(a.totalMs / a.count) : 0;
    delete a.totalMs;
    return a;
  });

  return { totalRows: values.length - 1, actions: actions };
}

function ManagerDiagnostics_checkDuplicateAuditIds_() {
  var ss = ManagerDiagnostics_getSpreadsheet_();
  var sh = ss.getSheetByName('Audit planning');
  if (!sh) return { ok:false, message:"Missing sheet 'Audit planning'", duplicates:[] };
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return { ok:true, duplicates:[] };

  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  var col = -1;
  for (var i = 0; i < hdr.length; i++) {
    var h = String(hdr[i] || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
    if (h === 'audit id') { col = i; break; }
  }
  if (col < 0) return { ok:false, message:'Missing Audit ID column', duplicates:[] };

  var vals = sh.getRange(2, col + 1, lastRow - 1, 1).getValues();
  var seen = {};
  var dup = [];
  vals.forEach(function(row, ix) {
    var id = String(row[0] || '').trim();
    if (!id) return;
    if (!seen[id]) seen[id] = [];
    seen[id].push(ix + 2);
  });
  Object.keys(seen).forEach(function(id) {
    if (seen[id].length > 1) dup.push({ auditId: id, rows: seen[id] });
  });
  return { ok: dup.length === 0, duplicates: dup };
}

function ManagerDiagnostics_runBlock_(name, fn) {
  var t0 = new Date().getTime();
  try {
    var res = fn();
    res = res || {};
    return {
      name: name,
      severity: res.severity || 'OK',
      durationMs: new Date().getTime() - t0,
      message: res.message || '',
      details: res.details || {},
      warnings: res.warnings || [],
      errors: res.errors || []
    };
  } catch (e) {
    return {
      name: name,
      severity: 'ERROR',
      durationMs: new Date().getTime() - t0,
      message: ManagerDiagnostics_err_(e),
      details: {},
      warnings: [],
      errors: [ManagerDiagnostics_err_(e)]
    };
  }
}

function ManagerDiagnostics_buildSummaryLines_(blocks, durationMs) {
  var lines = [];
  lines.push(ManagerDiagnostics_icon_(blocks) + ' Diagnostics completed in ' + durationMs + ' ms');
  (blocks || []).forEach(function(b) {
    lines.push(ManagerDiagnostics_icon_(b) + ' ' + b.name + ': ' + (b.message || b.severity) + ' (' + b.durationMs + ' ms)');
  });
  return lines;
}

function ManagerDiagnostics_icon_(x) {
  if (Array.isArray(x)) {
    var hasErr = x.some(function(b) { return b && b.severity === 'ERROR'; });
    var hasWarn = x.some(function(b) { return b && b.severity === 'WARN'; });
    return hasErr ? '❌' : (hasWarn ? '⚠' : '✅');
  }
  var s = String((x && x.severity) || '').toUpperCase();
  if (s === 'ERROR') return '❌';
  if (s === 'WARN' || s === 'WARNING') return '⚠';
  return '✅';
}

function ManagerDiagnostics_countBlocks_(blocks) {
  var out = { OK: 0, WARN: 0, ERROR: 0, TOTAL: 0 };
  (blocks || []).forEach(function(b) {
    out.TOTAL++;
    var s = String((b && b.severity) || 'OK').toUpperCase();
    if (s === 'WARNING') s = 'WARN';
    if (!out.hasOwnProperty(s)) s = 'OK';
    out[s]++;
  });
  return out;
}

function ManagerDiagnostics_trimTimingSheet_(sh) {
  try {
    var maxRows = Number(MANAGER_DIAGNOSTICS_CONFIG.MAX_TIMING_ROWS || 500);
    var last = sh.getLastRow();
    if (last <= maxRows + 1) return;
    var removeCount = last - maxRows - 1;
    if (removeCount > 0) sh.deleteRows(2, removeCount);
  } catch (e) {}
}

function ManagerDiagnostics_getSpreadsheet_() {
  var id = '';
  try {
    id = String(PropertiesService.getScriptProperties().getProperty('V5_SSOT_SPREADSHEET_ID') || '').trim();
  } catch (e) {}
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ManagerDiagnostics_fnExists_(fnName) {
  try {
    return typeof this[fnName] === 'function';
  } catch (e) {
    return false;
  }
}

function ManagerDiagnostics_now_() {
  var tz = 'Europe/Amsterdam';
  try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || tz; } catch (e) {}
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}

function ManagerDiagnostics_err_(e) {
  return String(e && e.message ? e.message : e);
}

function ManagerDiagnostics_safeJson_(obj, maxLen) {
  try {
    var s = JSON.stringify(obj || {});
    maxLen = Number(maxLen || 2000);
    return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
  } catch (e) {
    return '{}';
  }
}


/* =============================================================================
 * CENTRAL READ-ONLY OVERRIDES
 * These keep the diagnosis panel read-only. They override old diagnostics helpers
 * that previously wrote to Diagnostics_Log during manual runs.
 * =========================================================================== */

function Diagnostics_NoWriteAuditDiagnostics_finishRun_(scope, diagnostics, started) {
  diagnostics = diagnostics || [];
  var counts = AuditDiagnostics_countSeverities_(diagnostics);
  var result = {
    ok: true,
    build: AUDIT_DIAGNOSTICS_BUILD,
    scope: scope,
    generatedAt: AuditDiagnostics_formatDateTime_(new Date()),
    durationMs: new Date().getTime() - started.getTime(),
    counts: counts,
    diagnostics: diagnostics
  };

  try {
    Logger.log(JSON.stringify({
      ok: result.ok,
      build: result.build,
      scope: result.scope,
      generatedAt: result.generatedAt,
      durationMs: result.durationMs,
      counts: result.counts,
      note: 'Compact log only. Full diagnostics returned to caller/UI.'
    }, null, 2));
  } catch (e) {}

  return result;
}

function AuditDiagnostics_finishRun_(scope, diagnostics, started) {
  return Diagnostics_NoWriteAuditDiagnostics_finishRun_(scope, diagnostics, started);
}

function CacheWarmupDiagnostics_Run_(opts) {
  opts = opts || {};
  var started = new Date();
  var diagnostics = [];

  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_checkCoreServices_());
  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_checkSheets_());
  diagnostics = diagnostics.concat(CacheWarmupDiagnostics_probeServices_());

  if (opts.warmup) {
    diagnostics = diagnostics.concat(CacheWarmupDiagnostics_runWarmup_());
  }

  var counts = CacheWarmupDiagnostics_count_(diagnostics);
  var result = {
    ok: true,
    build: CACHE_WARMUP_DIAG_BUILD,
    generatedAt: CacheWarmupDiagnostics_formatDateTime_(new Date()),
    durationMs: new Date().getTime() - started.getTime(),
    warmup: !!opts.warmup,
    counts: counts,
    diagnostics: diagnostics,
    readOnlyPanelMode: !opts.warmup
  };

  try {
    Logger.log(JSON.stringify({
      ok: result.ok,
      build: result.build,
      generatedAt: result.generatedAt,
      durationMs: result.durationMs,
      warmup: result.warmup,
      counts: result.counts,
      readOnlyPanelMode: result.readOnlyPanelMode,
      note: 'Compact log only. Full diagnostics returned to caller/UI.'
    }, null, 2));
  } catch (e) {}

  return result;
}

function RUN_DIAGNOSTICS_ALL() {
  return ManagerDiagnostics_RunAll();
}

function Diagnostics_RunAll() {
  return ManagerDiagnostics_RunAll();
}
